"""HFood — Catalogue plats (SQLite) : panier validé par le serveur, checkout idempotent, commande parent + sous-commandes par vendeur.
Authentification RÉELLE ; base SQLite jetable ; uploads dans un dossier temporaire (jamais le vrai `uploads/`)."""
import atexit
import io
import os
import shutil
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="hfood_e0_")
atexit.register(shutil.rmtree, _tmpdir, ignore_errors=True)
_db = os.path.join(_tmpdir, "hfood_e0.db")
_pre = os.environ.get("DATABASE_URL", "").strip()
if _pre:
    raise RuntimeError("test_hfood_e0 refuse de tourner : DATABASE_URL est défini (base jetable SQLite uniquement).")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Notification, PartnerModule, User, UserRole  # noqa: E402
from app.restaurant import limits as L, services as svc  # noqa: E402
from app.restaurant.models import FoodOrder, FoodOrderItem, FoodSubOrder, MenuItem, Restaurant  # noqa: E402
from app.restaurant.routers import owner as owner_router  # noqa: E402
from app.services.rate_limit import limiter as shared_limiter  # noqa: E402

API = "/api/v1/restaurant"
PW = "motdepasse1"


def img():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 80, 40)).save(buf, "PNG")
    return buf.getvalue()


def day(offset=2):
    d = svc.local_now().date() + timedelta(days=offset)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d


@pytest.fixture(scope="module", autouse=True)
def _isolated(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    root = tmp_path_factory.mktemp("uploads")
    (root / "restaurant").mkdir()
    mp.setattr(owner_router, "UPLOAD_ROOT", root)
    mp.setattr(shared_limiter, "enabled", False)
    for k in ("RATE_RESERVE", "RATE_CANCEL", "RATE_REVIEW", "RATE_UPLOAD", "RATE_OWNER_NEW", "RATE_OWNER_ACT", "RATE_BROWSE", "RATE_QUOTE", "RATE_CHECKOUT"):
        mp.setattr(L, k, "100000/minute")
    mp.setattr(svc, "MAX_ACTIVE_PER_USER", 10_000)
    mp.setattr(owner_router, "MAX_RESTAURANTS", 1000)
    L.limiter.reset()
    try:
        yield root
    finally:
        mp.undo()


@pytest.fixture(scope="module")
def w():
    SQLModel.metadata.create_all(engine)
    with TestClient(app) as client:
        users, roles = {}, {"boss": UserRole.admin}
        keys = ("boss", "owner", "other", "g1", "g2")
        for key in keys:
            r = client.post("/api/v1/auth/register", json={"email": f"{key}@c2.example.com", "password": PW, "full_name": f"{key} Test"})
            assert r.status_code in (200, 201), r.text
        with Session(engine) as s:
            for key in keys:
                u = s.exec(select(User).where(User.email == f"{key}@c2.example.com")).one()
                u.is_verified = True
                if key in roles:
                    u.role = roles[key]
                s.add(u)
                s.commit()
                users[key] = u.id
            for key in ("owner", "other"):
                s.add(PartnerModule(user_id=users[key], module="restaurant"))
            s.commit()
        tokens = {}
        for key in users:
            r = client.post("/api/v1/auth/login", json={"email": f"{key}@c2.example.com", "password": PW})
            assert r.status_code == 200, r.text
            tokens[key] = r.json()["access_token"]
        client.cookies.clear()
        client.users, client.tokens = users, tokens
        yield client


def H(w, who, confirm=False):
    h = {"Authorization": f"Bearer {w.tokens[who]}"}
    if confirm:
        r = w.post("/api/v1/admin-security/confirm", json={"password": PW}, headers=h)
        assert r.status_code == 200, r.text
        w.cookies.clear()
        h["X-Admin-Confirm"] = r.json()["confirm_token"]
    return h


def photo(w, who="owner"):
    p = w.post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(img()), "image/png")}, headers=H(w, who))
    assert p.status_code == 200, p.text
    return p.json()["path"]


def create(w, name, seller_type=None, **kw):
    body = {"name": name, "summary": "Résumé", "city": "Lusaka", "phone": "0971", **kw}
    if seller_type:
        body["seller_type"] = seller_type
    r = w.post(f"{API}/owner/restaurants", json=body, headers=H(w, "owner"))
    assert r.status_code == 201, r.text
    return r.json()


def put(w, rid, body, who="owner"):
    return w.put(f"{API}/owner/restaurants/{rid}", json=body, headers=H(w, who))


def full(w, rid, **changes):
    """Corps de PUT complet (le PUT remplace les champs de base ; seuls les champs A2 absents sont conservés)."""
    v = w.get(f"{API}/owner/restaurants/{rid}", headers=H(w, "owner")).json()
    body = {k: v[k] for k in ("name", "summary", "description", "city", "area", "address", "phone", "whatsapp", "images")}
    body.update(changes)
    return body


def add_dish(w, rid, **kw):
    r = w.post(f"{API}/owner/restaurants/{rid}/items", json={"name": "Plat", "price": 10, **kw}, headers=H(w, "owner"))
    assert r.status_code == 201, r.text
    return r.json()


def approve(w, rid):
    r = w.post(f"{API}/admin/restaurants/{rid}/approve", headers=H(w, "boss", True))
    assert r.status_code == 200, r.text
    return r.json()



def live_as(w, who, name, price=10.0, seller_type="individual", **kw):
    """Vendeur individuel (ou restaurant) publié ; retourne (restaurant_id, item_id)."""
    body = {"name": name, "summary": "Résumé", "city": "Lusaka", "phone": "0971", "seller_type": seller_type, "images": [photo(w, who)], **kw}
    if seller_type == "restaurant":
        body["address"] = "Rue 1"
    v = w.post(f"{API}/owner/restaurants", json=body, headers=H(w, who))
    assert v.status_code == 201, v.text
    rid = v.json()["id"]
    d = w.post(f"{API}/owner/restaurants/{rid}/items", json={"name": f"Plat {name}", "price": price}, headers=H(w, who))
    assert d.status_code == 201, d.text
    if seller_type == "restaurant":
        assert w.put(f"{API}/owner/restaurants/{rid}/tables", json=[{"label": "T1", "seats": 4, "x": 2, "z": 2}], headers=H(w, who)).status_code == 200
    assert w.post(f"{API}/owner/restaurants/{rid}/submit", headers=H(w, who)).status_code == 200
    approve(w, rid)
    return rid, d.json()["id"]


def set_row(rid, **kw):
    with Session(engine) as s:
        r = s.get(Restaurant, rid)
        for k, v in kw.items():
            setattr(r, k, v)
        s.add(r)
        s.commit()


def set_item(iid, **kw):
    with Session(engine) as s:
        m = s.get(MenuItem, iid)
        for k, v in kw.items():
            setattr(m, k, v)
        s.add(m)
        s.commit()


def notifs(uid):
    with Session(engine) as s:
        return [(n.title, n.body) for n in s.exec(select(Notification).where(Notification.user_id == uid).order_by(Notification.id)).all()]


def count(model):
    with Session(engine) as s:
        return len(s.exec(select(model)).all())


_k = [0]


def key():
    _k[0] += 1
    return f"idem-key-{_k[0]:06d}"


def vend(rid, iid, qty=1, price=None, ful="pickup", **kw):
    line = {"item_id": iid, "qty": qty}
    if price is not None:
        line["price"] = price
    return {"restaurant_id": rid, "fulfilment": ful, "lines": [line], **kw}


def checkout(w, who, vendors, k=None, **kw):
    body = {"vendors": vendors, "contact_name": "Cliente Test", "phone": "0977000111", **kw}
    return w.post(f"{API}/orders/checkout", json=body, headers={**H(w, who), "Idempotency-Key": k or key()})


@pytest.fixture(scope="module")
def shops(w):
    """3 vendeurs : A (individuel, owner), B (restaurant, owner), C (individuel, other)."""
    a, ia = live_as(w, "owner", "C2 Vendeur A", 25.0)
    b, ib = live_as(w, "owner", "C2 Resto B", 40.0, "restaurant")
    c, ic = live_as(w, "other", "C2 Vendeur C", 12.5)
    set_row(a, offers_delivery=True, delivery_zones="Kabulonga, Roma", delivery_fee=15.0)
    set_row(b, offers_delivery=True, delivery_zones="", delivery_fee=None)   # frais à convenir
    set_row(c, offers_delivery=True, delivery_zones="Roma", delivery_fee=0.0)  # livraison gratuite
    return {"a": (a, ia), "b": (b, ib), "c": (c, ic)}


# ───────────────────────── Devis (public) ─────────────────────────
def test_dishes_lists_live_available_only_and_hides_private_data(w, shops):
    (a, ia), (b, ib) = shops["a"], shops["b"]
    with Session(engine) as s:
        from app.restaurant.models import MenuItem
        hidden = MenuItem(restaurant_id=a, name="Plat masqué", price=9.0, is_available=False)
        s.add(hidden); s.commit()
    d = w.get(f"{API}/dishes").json()
    ids = {x["id"] for x in d["dishes"]}
    assert ia in ids and ib in ids
    assert "Plat masqué" not in {x["name"] for x in d["dishes"]}  # indisponible : jamais listé
    rids = {r["id"] for r in d["restaurants"]}
    assert {a, b} <= rids
    blob = str(d)
    assert "phone" not in blob and "whatsapp" not in blob and "owner" not in blob  # aucune coordonnée privée
    assert d["total"] == len(d["dishes"]) and d["truncated"] is False
    for r in d["restaurants"]:
        assert r["dish_count"] == len([x for x in d["dishes"] if x["restaurant_id"] == r["id"]])


def test_dishes_excludes_unpublished_restaurants(w, shops):
    a, _ = shops["a"]
    set_row(a, status="paused")
    try:
        d = w.get(f"{API}/dishes").json()
        assert a not in {r["id"] for r in d["restaurants"]}
        assert all(x["restaurant_id"] != a for x in d["dishes"])
    finally:
        set_row(a, status="active")


def test_dishes_filters_search_city_delivery_restaurant(w, shops):
    (a, ia), (b, ib) = shops["a"], shops["b"]
    set_row(b, city="Ndola")
    try:
        assert {x["restaurant_id"] for x in w.get(f"{API}/dishes", params={"city": "ndola"}).json()["dishes"]} == {b}
        assert {x["restaurant_id"] for x in w.get(f"{API}/dishes", params={"restaurant_id": a}).json()["dishes"]} == {a}
        assert w.get(f"{API}/dishes", params={"q": "zzz-introuvable"}).json()["dishes"] == []
        name = next(x["name"] for x in w.get(f"{API}/dishes", params={"restaurant_id": a}).json()["dishes"] if x["id"] == ia)
        assert ia in {x["id"] for x in w.get(f"{API}/dishes", params={"q": name[:4].upper()}).json()["dishes"]}  # insensible à la casse
        assert w.get(f"{API}/dishes", params={"delivery": "true"}).json()["restaurants"]
    finally:
        set_row(b, city="Lusaka")


def test_dishes_cap_is_reported(w, shops, monkeypatch):
    from app.restaurant import limits
    monkeypatch.setattr(limits, "DISHES_CAP", 1)
    d = w.get(f"{API}/dishes").json()
    assert len(d["dishes"]) == 1 and d["truncated"] is True and d["total"] >= 2
    assert all(r["dish_count"] >= 1 for r in d["restaurants"])  # seules les fiches ayant des plats renvoyés
