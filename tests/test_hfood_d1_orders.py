"""HFood — Phase D1 (SQLite) : panier validé par le serveur, checkout idempotent, commande parent + sous-commandes par vendeur.
Authentification RÉELLE ; base SQLite jetable ; uploads dans un dossier temporaire (jamais le vrai `uploads/`)."""
import atexit
import io
import os
import shutil
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="hfood_d1_")
atexit.register(shutil.rmtree, _tmpdir, ignore_errors=True)
_db = os.path.join(_tmpdir, "hfood_d1.db")
_pre = os.environ.get("DATABASE_URL", "").strip()
if _pre:
    raise RuntimeError("test_hfood_d1 refuse de tourner : DATABASE_URL est défini (base jetable SQLite uniquement).")
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

def accepted(w, who="g1"):
    (a, ia) = shops_cache["a"]
    o = checkout(w, who, [vend(a, ia)]).json()
    code = o["suborders"][0]["code"]
    assert w.post(f"{API}/seller/orders/{code}/decision", json={"action": "accept"}, headers=H(w, "owner")).status_code == 200
    return code


@pytest.fixture(scope="module", autouse=True)
def _cache(shops):
    shops_cache.update(shops)


shops_cache = {}


def test_status_flow_and_invalid_transitions(w):
    c = accepted(w)
    own, cli = H(w, "owner"), H(w, "g1")
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "ready"}, headers=H(w, "other")).status_code == 404
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "bogus"}, headers=own).status_code == 422
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "preparing"}, headers=own).json()["status"] == "preparing"
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "preparing"}, headers=own).status_code == 409  # déjà en préparation
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "ready"}, headers=own).json()["status"] == "ready"
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "preparing"}, headers=own).status_code == 409  # pas de retour arrière
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "completed"}, headers=own).json()["status"] == "completed"
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "cancelled", "reason": "x"}, headers=own).status_code == 409  # terminée : figée
    titles = [t for t, _ in notifs(w.users["g1"])]
    assert {"Commande en préparation", "Commande prête", "Commande terminée"} <= set(titles)
    assert w.post(f"{API}/me/suborders/{c}/cancel", headers=cli).status_code == 409


def test_pending_cannot_progress_and_cancel_needs_reason(w, shops):
    a, ia = shops["a"]
    c = checkout(w, "g1", [vend(a, ia)]).json()["suborders"][0]["code"]
    own = H(w, "owner")
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "ready"}, headers=own).status_code == 409  # il faut d'abord accepter
    w.post(f"{API}/seller/orders/{c}/decision", json={"action": "accept"}, headers=own)
    assert w.post(f"{API}/seller/orders/{c}/status", json={"status": "cancelled"}, headers=own).status_code == 422
    r = w.post(f"{API}/seller/orders/{c}/status", json={"status": "cancelled", "reason": "Rupture"}, headers=own)
    assert r.json()["status"] == "cancelled" and r.json()["status_note"] == "Rupture"
    assert any("Rupture" in b for _, b in notifs(w.users["g1"]))


def test_manual_payment_declared_then_confirmed_independent_of_status(w):
    c = accepted(w)
    own, cli = H(w, "owner"), H(w, "g1")
    assert w.post(f"{API}/seller/orders/{c}/payment", json={"action": "reject", "note": "x"}, headers=own).status_code == 409  # rien à contester
    assert w.post(f"{API}/me/suborders/{c}/payment", json={"method": "Airtel Money", "reference": "AB123"}, headers=H(w, "g2")).status_code == 404
    d = w.post(f"{API}/me/suborders/{c}/payment", json={"method": "Airtel Money", "reference": "AB123", "note": "ok"}, headers=cli)
    assert d.status_code == 200 and d.json()["payment_status"] == "declared" and d.json()["status"] == "accepted"  # le statut de commande ne bouge pas
    assert w.post(f"{API}/me/suborders/{c}/payment", json={}, headers=cli).status_code == 409  # une seule déclaration
    assert w.post(f"{API}/seller/orders/{c}/payment", json={"action": "reject"}, headers=own).status_code == 422
    rj = w.post(f"{API}/seller/orders/{c}/payment", json={"action": "reject", "note": "Rien reçu"}, headers=own)
    assert rj.json()["payment_status"] == "unpaid"
    assert w.post(f"{API}/me/suborders/{c}/payment", json={"reference": "ZZ9"}, headers=cli).json()["payment_status"] == "declared"
    ok = w.post(f"{API}/seller/orders/{c}/payment", json={"action": "confirm"}, headers=own)
    assert ok.json()["payment_status"] == "confirmed" and ok.json()["status"] == "accepted"
    assert w.post(f"{API}/seller/orders/{c}/payment", json={"action": "confirm"}, headers=own).status_code == 409  # déjà confirmé
    titles = [t for t, _ in notifs(w.users["g1"])]
    assert "Paiement confirmé" in titles and "Paiement non reçu" in titles
    assert "Paiement déclaré" in [t for t, _ in notifs(w.users["owner"])]


def test_payment_not_possible_before_acceptance_or_after_decline(w, shops):
    a, ia = shops["a"]
    c = checkout(w, "g1", [vend(a, ia)]).json()["suborders"][0]["code"]
    assert w.post(f"{API}/me/suborders/{c}/payment", json={}, headers=H(w, "g1")).status_code == 409
    assert w.post(f"{API}/seller/orders/{c}/payment", json={"action": "confirm"}, headers=H(w, "owner")).status_code == 409
    w.post(f"{API}/seller/orders/{c}/decision", json={"action": "decline", "reason": "non"}, headers=H(w, "owner"))
    assert w.post(f"{API}/me/suborders/{c}/payment", json={}, headers=H(w, "g1")).status_code == 409


def test_other_vendor_cannot_touch_and_multivendor_isolated(w, shops):
    (a, ia), (c_, ic) = shops["a"], shops["c"]
    o = checkout(w, "g2", [vend(a, ia), vend(c_, ic)]).json()
    sa, sb = (s["code"] for s in o["suborders"])
    w.post(f"{API}/seller/orders/{sa}/decision", json={"action": "accept"}, headers=H(w, "owner"))
    w.post(f"{API}/seller/orders/{sb}/decision", json={"action": "accept"}, headers=H(w, "other"))
    w.post(f"{API}/seller/orders/{sa}/status", json={"status": "cancelled", "reason": "Non"}, headers=H(w, "owner"))
    got = w.get(f"{API}/me/orders/{o['code']}", headers=H(w, "g2")).json()
    assert [s["status"] for s in got["suborders"]] == ["cancelled", "accepted"]  # l'annulation d'un vendeur n'affecte pas l'autre
    assert w.post(f"{API}/seller/orders/{sb}/status", json={"status": "ready"}, headers=H(w, "owner")).status_code == 404
