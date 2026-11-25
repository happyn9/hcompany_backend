"""HFood — Phase E (SQLite) : avis liés aux commandes terminées + modération.
Authentification RÉELLE ; base SQLite jetable ; uploads dans un dossier temporaire (jamais le vrai `uploads/`)."""
import atexit
import io
import os
import shutil
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="hfood_e_")
atexit.register(shutil.rmtree, _tmpdir, ignore_errors=True)
_db = os.path.join(_tmpdir, "hfood_d1.db")
_pre = os.environ.get("DATABASE_URL", "").strip()
if _pre:
    raise RuntimeError("test_hfood_e refuse de tourner : DATABASE_URL est défini (base jetable SQLite uniquement).")
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


from tests.c2_util import H, checkout, key, live_as, vend  # noqa: E402


def notifs(uid):
    with Session(engine) as s:
        return [(n.title, n.body) for n in s.exec(select(Notification).where(Notification.user_id == uid).order_by(Notification.id)).all()]



def make(w, who="g1", owner="owner", complete=True):
    with_item = live_as(w, owner, f"R{key()}", price=10.0)
    rid = with_item[0]
    with Session(engine) as ses:
        iid = ses.exec(select(MenuItem.id).where(MenuItem.restaurant_id == rid)).first()
    r = checkout(w, who, [vend(rid, iid, 2)])
    assert r.status_code == 201, r.text
    sub = r.json()["suborders"][0]["code"]
    if complete:
        assert w.post(f"{API}/seller/orders/{sub}/decision", json={"action": "accept"}, headers=H(w, owner)).status_code == 200
        assert w.post(f"{API}/seller/orders/{sub}/status", json={"status": "completed"}, headers=H(w, owner)).status_code == 200
    return rid, r.json()["code"], sub


def rev(w, sub, rating=5, comment="Très bon", who="g1"):
    return w.post(f"{API}/me/suborders/{sub}/review", json={"rating": rating, "comment": comment}, headers=H(w, who))


def public(w, rid):
    return w.get(f"{API}/restaurants/{rid}/reviews").json()


def card(w, rid):
    with Session(engine) as ses:
        r = ses.get(Restaurant, rid)
        return r.rating_avg, r.rating_count


def test_eligibility_and_single_review(w):
    rid, oc, sub = make(w, complete=False)
    assert rev(w, sub).status_code == 409  # commande pas terminée
    w.post(f"{API}/seller/orders/{sub}/decision", json={"action": "accept"}, headers=H(w, "owner"))
    assert rev(w, sub).status_code == 409  # acceptée seulement
    w.post(f"{API}/seller/orders/{sub}/status", json={"status": "completed"}, headers=H(w, "owner"))
    assert rev(w, sub, 4, "Bien").status_code == 201
    assert rev(w, sub, 1, "Changement d'avis").status_code == 409  # un seul avis, non modifiable
    assert card(w, rid) == (4.0, 1)
    o = w.get(f"{API}/me/orders/{oc}", headers=H(w, "g1")).json()["suborders"][0]
    assert o["review"]["rating"] == 4 and o["review"]["comment"] == "Bien"


def test_refused_for_wrong_people_and_bad_input(w):
    rid, oc, sub = make(w)
    assert rev(w, sub, who="g2").status_code == 404  # autre client
    assert rev(w, sub, who="owner").status_code == 404  # le vendeur ne s'auto-évalue pas
    assert w.post(f"{API}/me/suborders/{sub}/review", json={"rating": 5}).status_code in (401, 403)
    assert rev(w, sub, 0).status_code == 422 and rev(w, sub, 6).status_code == 422
    assert rev(w, sub, 5, "x" * 601).status_code == 422
    assert rev(w, "HS-INEXISTANT", 5).status_code == 404
    assert card(w, rid) == (0.0, 0)
    for st in ("declined", "cancelled"):
        rid2, _, sub2 = make(w, complete=False)
        if st == "declined":
            w.post(f"{API}/seller/orders/{sub2}/decision", json={"action": "decline", "reason": "Fermé"}, headers=H(w, "owner"))
        else:
            w.post(f"{API}/me/suborders/{sub2}/cancel", headers=H(w, "g1"))
        assert rev(w, sub2).status_code == 409  # refusée / annulée : pas d'avis


def test_public_listing_average_and_empty_state(w):
    rid, _, sub = make(w)
    assert public(w, rid) == [] and card(w, rid) == (0.0, 0)  # peu ou pas d'avis
    assert rev(w, sub, 5, "Excellent").status_code == 201
    rid_b = rid
    pub = public(w, rid)
    assert len(pub) == 1 and pub[0]["rating"] == 5 and pub[0]["comment"] == "Excellent" and pub[0]["verified_order"] is True
    assert pub[0]["author"] in ("g1", "Client") and "@" not in pub[0]["author"]  # prénom seulement ; aucune donnée privée
    assert set(pub[0]) == {"id", "rating", "comment", "author", "created_at", "verified_order"}
    # deuxième commande du même client chez le même vendeur → deuxième avis légitime
    with Session(engine) as ses:
        iid = ses.exec(select(MenuItem.id).where(MenuItem.restaurant_id == rid_b)).first()
    r = checkout(w, "g2", [vend(rid_b, iid, 1)])
    s2 = r.json()["suborders"][0]["code"]
    w.post(f"{API}/seller/orders/{s2}/decision", json={"action": "accept"}, headers=H(w, "owner"))
    w.post(f"{API}/seller/orders/{s2}/status", json={"status": "completed"}, headers=H(w, "owner"))
    assert rev(w, s2, 2, "Moyen", who="g2").status_code == 201
    assert card(w, rid_b) == (3.5, 2)
    assert [x["rating"] for x in public(w, rid_b)] == [2, 5]  # plus récent d'abord
    # la fiche publique et la recherche reflètent la note
    assert w.get(f"{API}/restaurants/{rid_b}/reviews?offset=1").json()[0]["rating"] == 5


def test_multi_vendor_each_sub_order_has_own_review(w):
    r1, _ = live_as(w, "owner", f"MV{key()}", price=10.0)
    r2, _ = live_as(w, "other", f"MW{key()}", price=8.0)
    with Session(engine) as ses:
        i1 = ses.exec(select(MenuItem.id).where(MenuItem.restaurant_id == r1)).first()
        i2 = ses.exec(select(MenuItem.id).where(MenuItem.restaurant_id == r2)).first()
    o = checkout(w, "g1", [vend(r1, i1, 1), vend(r2, i2, 1)]).json()
    a, b = [s["code"] for s in o["suborders"]]
    for code, who in ((a, "owner"), (b, "other")):
        w.post(f"{API}/seller/orders/{code}/decision", json={"action": "accept"}, headers=H(w, who))
        w.post(f"{API}/seller/orders/{code}/status", json={"status": "completed"}, headers=H(w, who))
    assert rev(w, a, 5).status_code == 201
    assert card(w, r1) == (5.0, 1) and card(w, r2) == (0.0, 0)  # l'avis ne touche que SON vendeur
    assert rev(w, b, 3).status_code == 201 and card(w, r2) == (3.0, 1)


def test_seller_sees_only_own_reviews(w):
    rid, _, sub = make(w)
    rev(w, sub, 5, "Top")
    mine = w.get(f"{API}/seller/reviews", headers=H(w, "owner")).json()
    assert any(x["comment"] == "Top" for x in mine["reviews"]) and any(r["id"] == rid and r["rating_count"] == 1 for r in mine["restaurants"])
    theirs = w.get(f"{API}/seller/reviews", headers=H(w, "other")).json()
    assert not any(x["comment"] == "Top" for x in theirs["reviews"])
    assert w.get(f"{API}/seller/reviews", headers=H(w, "g2")).json() == {"reviews": [], "restaurants": []}
    assert any(t == "Nouvel avis" for t, _ in notifs(w.users["owner"]))


def test_admin_moderation_and_summary(w):
    rid, _, sub = make(w)
    rev(w, sub, 1, "Insultes")
    rid_ok, _, sub_ok = make(w, owner="owner")
    assert rev(w, sub_ok, 5, "Bien").status_code == 201
    adm = w.get(f"{API}/admin/reviews", headers=H(w, "boss", True)).json()
    bad = next(x for x in adm if x["comment"] == "Insultes")
    assert w.get(f"{API}/admin/reviews", headers=H(w, "owner")).status_code == 403  # non-admin
    assert w.get(f"{API}/admin/orders/summary", headers=H(w, "g1")).status_code == 403
    assert w.post(f"{API}/admin/reviews/{bad['id']}/hide", json={"reason": ""}, headers=H(w, "boss", True)).status_code == 422
    assert card(w, rid) == (1.0, 1)
    assert w.post(f"{API}/admin/reviews/{bad['id']}/hide", json={"reason": "Insultes"}, headers=H(w, "boss", True)).status_code == 200
    assert public(w, rid) == [] and card(w, rid) == (0.0, 0)  # masqué : disparaît de la page et de la moyenne
    mine = w.get(f"{API}/seller/reviews", headers=H(w, "owner")).json()["reviews"]
    assert not any(x["comment"] == "Insultes" for x in mine)
    assert w.post(f"{API}/admin/reviews/{bad['id']}/unhide", json={}, headers=H(w, "boss", True)).status_code == 200
    assert card(w, rid) == (1.0, 1)
    assert w.post(f"{API}/admin/reviews/999999/hide", json={"reason": "x"}, headers=H(w, "boss", True)).status_code == 404
    assert w.post(f"{API}/admin/reviews/{bad['id']}/delete", json={}, headers=H(w, "boss", True)).status_code == 404
    s = w.get(f"{API}/admin/orders/summary", headers=H(w, "boss", True)).json()
    assert s["by_status"]["completed"] >= 2 and set(s["by_payment"]) == {"unpaid", "declared", "confirmed"} and "pending_over_48h" in s["problems"]
