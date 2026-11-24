"""HFood — Phase D2 (SQLite) : propositions de modification de commande.
Authentification RÉELLE ; base SQLite jetable ; uploads dans un dossier temporaire (jamais le vrai `uploads/`)."""
import atexit
import io
import os
import shutil
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="hfood_d2_")
atexit.register(shutil.rmtree, _tmpdir, ignore_errors=True)
_db = os.path.join(_tmpdir, "hfood_d1.db")
_pre = os.environ.get("DATABASE_URL", "").strip()
if _pre:
    raise RuntimeError("test_hfood_d2 refuse de tourner : DATABASE_URL est défini (base jetable SQLite uniquement).")
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



def setup_order(w, who="g1", owner="owner", qty=(3, 2), price=10.0):
    """Vendeur publié avec 2 plats ; commande de `who` ; retourne (rid, sub_code, [line_ids])."""
    rid, i1 = live_as(w, owner, f"V{key()}", price=price)
    d2 = w.post(f"{API}/owner/restaurants/{rid}/items", json={"name": "Second", "price": 5}, headers=H(w, owner))
    assert d2.status_code == 201, d2.text
    i2 = d2.json()["id"]
    v = {"restaurant_id": rid, "fulfilment": "pickup", "lines": [{"item_id": i1, "qty": qty[0]}, {"item_id": i2, "qty": qty[1]}]}
    r = checkout(w, who, [v])
    assert r.status_code == 201, r.text
    sub = r.json()["suborders"][0]
    return rid, r.json()["code"], sub["code"], [x["line_id"] for x in sub["items"]]


def propose(w, sub, changes, who="owner", msg="Plat épuisé"):
    return w.post(f"{API}/seller/orders/{sub}/proposals", json={"message": msg, "changes": [{"line_id": a, "qty": b} for a, b in changes]}, headers=H(w, who))


def decide(w, sub, pid, action, who="g1", note=""):
    return w.post(f"{API}/me/suborders/{sub}/proposals/{pid}/decision", json={"action": action, "note": note}, headers=H(w, who))


def mine(w, who, code):
    r = w.get(f"{API}/me/orders/{code}", headers=H(w, who))
    assert r.status_code == 200, r.text
    return r.json()


def test_accept_recomputes_totals(w):
    rid, oc, sub, lines = setup_order(w)  # 3×10 + 2×5 = 40
    assert mine(w, "g1", oc)["grand_total"] == 40.0
    r = propose(w, sub, [(lines[0], 1), (lines[1], 0)])
    assert r.status_code == 201, r.text
    p = r.json()["open_proposal"]
    assert p["items_total_before"] == 40.0 and p["items_total_after"] == 10.0
    # rien ne change avant la décision
    assert mine(w, "g1", oc)["grand_total"] == 40.0
    assert mine(w, "g1", oc)["suborders"][0]["open_proposal"]["id"] == p["id"]
    d = decide(w, sub, p["id"], "accept")
    assert d.status_code == 200, d.text
    o = mine(w, "g1", oc)
    assert o["grand_total"] == 10.0 and o["items_total"] == 10.0
    s = o["suborders"][0]
    assert s["items_total"] == 10.0 and s["total_known"] == 10.0 and len(s["items"]) == 1 and s["items"][0]["qty"] == 1
    assert s["open_proposal"] is None and s["proposals"][0]["status"] == "accepted"
    # une proposition ne s'applique qu'une fois
    assert decide(w, sub, p["id"], "accept").status_code == 409
    assert decide(w, sub, p["id"], "decline").status_code == 409
    assert mine(w, "g1", oc)["grand_total"] == 10.0


def test_decline_keeps_order(w):
    rid, oc, sub, lines = setup_order(w)
    p = propose(w, sub, [(lines[1], 1)]).json()["open_proposal"]
    d = decide(w, sub, p["id"], "decline", note="Je préfère garder")
    assert d.status_code == 200
    o = mine(w, "g1", oc)
    assert o["grand_total"] == 40.0 and o["suborders"][0]["proposals"][0]["status"] == "declined"
    assert any("refusé" in t.lower() for t, _ in notifs(w.users["owner"]))
    # une nouvelle proposition est possible après un refus ; plusieurs propositions successives
    p2 = propose(w, sub, [(lines[0], 2)]).json()["open_proposal"]
    assert p2["id"] != p["id"]
    assert decide(w, sub, p2["id"], "accept").status_code == 200
    assert mine(w, "g1", oc)["grand_total"] == 30.0
    assert len(mine(w, "g1", oc)["suborders"][0]["proposals"]) == 2


def test_validation_rules(w):
    rid, oc, sub, lines = setup_order(w)
    assert propose(w, sub, [(lines[0], 4)]).status_code == 422  # hausse interdite
    assert propose(w, sub, [(lines[0], 3)]).status_code == 422  # aucun changement
    assert propose(w, sub, [(lines[0], 0), (lines[1], 0)]).status_code == 422  # tout retirer = refuser
    assert propose(w, sub, [(999999, 1)]).status_code == 422
    assert propose(w, sub, [(lines[0], 1), (lines[0], 2)]).status_code == 422  # doublon
    r = w.post(f"{API}/seller/orders/{sub}/proposals", json={"message": "x", "changes": []}, headers=H(w, "owner"))
    assert r.status_code == 422


def test_only_one_pending_and_blocks_progress_and_payment(w):
    rid, oc, sub, lines = setup_order(w)
    assert w.post(f"{API}/seller/orders/{sub}/decision", json={"action": "accept"}, headers=H(w, "owner")).status_code == 200
    p = propose(w, sub, [(lines[1], 1)]).json()["open_proposal"]
    assert propose(w, sub, [(lines[0], 1)]).status_code == 409  # une seule en attente
    # le vendeur ne peut pas clore la commande ni confirmer un paiement avec un total non définitif
    assert w.post(f"{API}/seller/orders/{sub}/status", json={"status": "ready"}, headers=H(w, "owner")).status_code == 409
    assert w.post(f"{API}/seller/orders/{sub}/payment", json={"action": "confirm"}, headers=H(w, "owner")).status_code == 409
    # le client ne peut pas déclarer un paiement avant d'avoir répondu
    assert w.post(f"{API}/me/suborders/{sub}/payment", json={"method": "Airtel"}, headers=H(w, "g1")).status_code == 409
    # le vendeur peut retirer sa proposition
    c = w.post(f"{API}/seller/orders/{sub}/proposals/cancel", headers=H(w, "owner"))
    assert c.status_code == 200 and c.json()["open_proposal"] is None
    assert decide(w, sub, p["id"], "accept").status_code == 409
    assert mine(w, "g1", oc)["grand_total"] == 40.0
    assert w.post(f"{API}/seller/orders/{sub}/proposals/cancel", headers=H(w, "owner")).status_code == 409


def test_states_that_forbid_proposals(w):
    # paiement déclaré / confirmé → refus
    rid, oc, sub, lines = setup_order(w)
    w.post(f"{API}/seller/orders/{sub}/decision", json={"action": "accept"}, headers=H(w, "owner"))
    assert w.post(f"{API}/me/suborders/{sub}/payment", json={"method": "Airtel"}, headers=H(w, "g1")).status_code == 200
    assert propose(w, sub, [(lines[1], 1)]).status_code == 409
    # commande terminée / annulée / refusée
    rid, oc, sub, lines = setup_order(w)
    w.post(f"{API}/seller/orders/{sub}/decision", json={"action": "accept"}, headers=H(w, "owner"))
    w.post(f"{API}/seller/orders/{sub}/status", json={"status": "completed"}, headers=H(w, "owner"))
    assert propose(w, sub, [(lines[1], 1)]).status_code == 409
    rid, oc, sub, lines = setup_order(w)
    w.post(f"{API}/seller/orders/{sub}/decision", json={"action": "decline", "reason": "Fermé"}, headers=H(w, "owner"))
    assert propose(w, sub, [(lines[1], 1)]).status_code == 409
    rid, oc, sub, lines = setup_order(w)
    assert w.post(f"{API}/me/suborders/{sub}/cancel", headers=H(w, "g1")).status_code == 200
    assert propose(w, sub, [(lines[1], 1)]).status_code == 409


def test_cancel_or_decline_closes_open_proposal(w):
    rid, oc, sub, lines = setup_order(w)
    p = propose(w, sub, [(lines[1], 1)]).json()["open_proposal"]
    assert w.post(f"{API}/me/suborders/{sub}/cancel", headers=H(w, "g1")).status_code == 200
    s = mine(w, "g1", oc)["suborders"][0]
    assert s["open_proposal"] is None and s["proposals"][0]["status"] == "cancelled"
    assert decide(w, sub, p["id"], "accept").status_code == 409
    rid, oc, sub, lines = setup_order(w)
    propose(w, sub, [(lines[1], 1)])
    w.post(f"{API}/seller/orders/{sub}/decision", json={"action": "decline", "reason": "Fermé"}, headers=H(w, "owner"))
    assert mine(w, "g1", oc)["suborders"][0]["proposals"][0]["status"] == "cancelled"


def test_expiry(w):
    rid, oc, sub, lines = setup_order(w)
    p = propose(w, sub, [(lines[1], 1)]).json()["open_proposal"]
    from app.restaurant.models import FoodOrderProposal
    with Session(engine) as s:
        x = s.get(FoodOrderProposal, p["id"])
        x.expires_at = x.created_at - timedelta(hours=1)
        s.add(x)
        s.commit()
    assert mine(w, "g1", oc)["suborders"][0]["open_proposal"] is None
    assert mine(w, "g1", oc)["suborders"][0]["proposals"][0]["status"] == "expired"
    assert decide(w, sub, p["id"], "accept").status_code == 409
    assert mine(w, "g1", oc)["grand_total"] == 40.0
    assert propose(w, sub, [(lines[1], 1)]).status_code == 201  # on peut en refaire une


def test_permissions(w):
    rid, oc, sub, lines = setup_order(w)
    assert propose(w, sub, [(lines[1], 1)], who="other").status_code == 404  # autre vendeur
    assert propose(w, sub, [(lines[1], 1)], who="g2").status_code == 404  # simple client
    assert w.post(f"{API}/seller/orders/{sub}/proposals", json={"changes": [{"line_id": lines[1], "qty": 1}]}).status_code in (401, 403)
    p = propose(w, sub, [(lines[1], 1)]).json()["open_proposal"]
    assert decide(w, sub, p["id"], "accept", who="g2").status_code == 404  # autre client
    assert decide(w, sub, p["id"], "accept", who="owner").status_code == 404  # le vendeur ne décide pas à la place du client
    assert w.post(f"{API}/seller/orders/{sub}/proposals/cancel", headers=H(w, "other")).status_code == 404
    assert decide(w, sub, 999999, "accept").status_code == 404
    # le client B ne voit jamais la proposition
    assert w.get(f"{API}/me/orders/{oc}", headers=H(w, "g2")).status_code == 404
    assert mine(w, "g1", oc)["grand_total"] == 40.0


def test_multi_vendor_isolated(w):
    r1, i1 = live_as(w, "owner", f"MA{key()}", price=10.0)
    r2, i2 = live_as(w, "other", f"MB{key()}", price=8.0)
    r = checkout(w, "g1", [vend(r1, i1, 4), vend(r2, i2, 2)])
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["grand_total"] == 56.0
    sa, sb = o["suborders"]
    la = sa["items"][0]["line_id"]
    # un seul article → réduire (4→2) est autorisé, retirer serait un refus
    p = propose(w, sa["code"], [(la, 2)]).json()["open_proposal"]
    assert decide(w, sa["code"], p["id"], "accept").status_code == 200
    o2 = mine(w, "g1", o["code"])
    assert o2["grand_total"] == 36.0
    assert o2["suborders"][0]["items_total"] == 20.0 and o2["suborders"][1]["items_total"] == 16.0 and o2["suborders"][1]["proposals"] == []


def test_notifications_and_frozen_prices(w):
    rid, oc, sub, lines = setup_order(w)
    with Session(engine) as s:  # le prix du plat change entre-temps : la proposition utilise les prix figés
        for m in s.exec(select(MenuItem).where(MenuItem.restaurant_id == rid)).all():
            m.price = 99
            s.add(m)
        s.commit()
    p = propose(w, sub, [(lines[0], 1)]).json()["open_proposal"]
    assert p["items_total_after"] == 20.0  # 1×10 + 2×5, pas 99
    assert any("Modification proposée" == t for t, _ in notifs(w.users["g1"]))
    decide(w, sub, p["id"], "accept")
    assert any("Modification acceptée" == t for t, _ in notifs(w.users["owner"]))
    assert mine(w, "g1", oc)["grand_total"] == 20.0
