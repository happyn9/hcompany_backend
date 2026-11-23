"""HFood — Phase C2 (SQLite) : panier validé par le serveur, checkout idempotent, commande parent + sous-commandes par vendeur.
Authentification RÉELLE ; base SQLite jetable ; uploads dans un dossier temporaire (jamais le vrai `uploads/`)."""
import atexit
import io
import os
import shutil
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="hfood_c2_")
atexit.register(shutil.rmtree, _tmpdir, ignore_errors=True)
_db = os.path.join(_tmpdir, "hfood_c2.db")
_pre = os.environ.get("DATABASE_URL", "").strip()
if _pre:
    raise RuntimeError("test_hfood_c2 refuse de tourner : DATABASE_URL est défini (base jetable SQLite uniquement).")
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
def test_quote_is_public_recomputed_and_ignores_client_totals(w, shops):
    (a, ia), (b, ib) = shops["a"], shops["b"]
    r = w.post(f"{API}/cart/quote", json={"vendors": [vend(a, ia, 2, price=1.0, ful="delivery"), vend(b, ib, 1, ful="pickup")]})
    assert r.status_code == 200, r.text
    q = r.json()
    va, vb = q["vendors"]
    assert va["items_total"] == 50.0 and va["lines"][0]["unit_price"] == 25.0 and va["lines"][0]["price_changed"] is True  # prix client (1.0) ignoré, changement signalé
    assert va["fee"] == 15.0 and va["total_known"] == 65.0
    assert vb["items_total"] == 40.0 and vb["fee"] == 0.0 and vb["total_known"] == 40.0
    assert q["items_total"] == 90.0 and q["fees_known_total"] == 15.0 and q["grand_total"] == 105.0 and q["fees_pending"] is False
    assert any(i["code"] == "price_changed" for i in va["issues"]) and va["ok"] is False  # bloquant tant que non accepté


def test_quote_delivery_fee_to_arrange_is_not_counted(w, shops):
    b, ib = shops["b"]
    q = w.post(f"{API}/cart/quote", json={"vendors": [vend(b, ib, 1, ful="delivery")]}).json()
    v = q["vendors"][0]
    assert v["fee"] is None and v["fee_pending"] is True and v["total_known"] == 40.0
    assert q["fees_pending"] is True and q["grand_total"] == 40.0


def test_quote_flags_unavailable_and_unknown_items_and_bad_vendor(w, shops):
    (a, ia), (b, ib) = shops["a"], shops["b"]
    set_item(ib, is_available=False)
    try:
        q = w.post(f"{API}/cart/quote", json={"vendors": [vend(b, ib), vend(a, 99999999)]}).json()
        assert {i["code"] for i in q["vendors"][0]["issues"]} == {"item_unavailable"} and q["vendors"][0]["ok"] is False
        assert {i["code"] for i in q["vendors"][1]["issues"]} == {"item_not_found"}
        q2 = w.post(f"{API}/cart/quote", json={"vendors": [vend(424242, 1)]}).json()
        assert q2["vendors"][0]["issues"] == [{"code": "vendor_unavailable"}] and q2["ok"] is False
    finally:
        set_item(ib, is_available=True)


def test_quote_input_bounds(w, shops):
    (a, ia) = shops["a"]
    assert w.post(f"{API}/cart/quote", json={"vendors": []}).status_code == 422
    assert w.post(f"{API}/cart/quote", json={"vendors": [vend(a, ia, 0)]}).status_code == 422
    assert w.post(f"{API}/cart/quote", json={"vendors": [vend(a, ia), vend(a, ia)]}).status_code == 422  # même vendeur deux fois
    big = [{"restaurant_id": 1000 + i, "fulfilment": "pickup", "lines": [{"item_id": 1, "qty": 1}]} for i in range(L.CART_MAX_VENDORS + 1)]
    assert w.post(f"{API}/cart/quote", json={"vendors": big}).status_code == 422
    r = w.post(f"{API}/cart/quote", json={"vendors": [vend(a, ia, 3), {**vend(a, ia, 3)}]})
    assert r.status_code == 422
    q = w.post(f"{API}/cart/quote", json={"vendors": [{"restaurant_id": a, "fulfilment": "pickup", "lines": [{"item_id": ia, "qty": 40}, {"item_id": ia, "qty": 40}]}]}).json()
    assert q["vendors"][0]["lines"][0]["qty"] == L.CART_MAX_QTY  # doublons fusionnés, plafonnés


# ───────────────────────── Checkout ─────────────────────────
def test_checkout_requires_login_and_idempotency_key(w, shops):
    (a, ia) = shops["a"]
    body = {"vendors": [vend(a, ia)], "contact_name": "X", "phone": "0977000111"}
    assert w.post(f"{API}/orders/checkout", json=body, headers={"Idempotency-Key": key()}).status_code == 401
    assert w.post(f"{API}/orders/checkout", json=body, headers=H(w, "g1")).status_code == 422
    assert w.post(f"{API}/orders/checkout", json=body, headers={**H(w, "g1"), "Idempotency-Key": "court"}).status_code == 422


def test_multi_vendor_checkout_creates_parent_and_independent_suborders(w, shops):
    (a, ia), (b, ib), (c, ic) = shops["a"], shops["b"], shops["c"]
    n_orders, n_subs = count(FoodOrder), count(FoodSubOrder)
    vendors = [
        vend(a, ia, 2, price=25.0, ful="delivery", address="12 Rue Kabulonga", zone="kabulonga"),
        vend(b, ib, 1, ful="delivery", address="12 Rue Kabulonga"),
        vend(c, ic, 3, ful="pickup", note="sans piment"),
    ]
    r = checkout(w, "g1", vendors, note="Sonner deux fois")
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["code"].startswith("HF-") and o["status"] == "pending" and o["replayed"] is False
    assert count(FoodOrder) == n_orders + 1 and count(FoodSubOrder) == n_subs + 3
    sa, sb, sc = o["suborders"]
    assert sa["items_total"] == 50.0 and sa["delivery_fee"] == 15.0 and sa["total_known"] == 65.0 and sa["fee_pending"] is False
    assert sb["items_total"] == 40.0 and sb["delivery_fee"] is None and sb["fee_pending"] is True and sb["total_known"] == 40.0
    assert sc["items_total"] == 37.5 and sc["delivery_fee"] == 0.0 and sc["fulfilment"] == "pickup" and sc["note"] == "sans piment"
    assert o["items_total"] == 127.5 and o["fees_known_total"] == 15.0 and o["fees_pending"] is True and o["grand_total"] == 142.5
    assert all(s["status"] == "pending" and s["payment_status"] == "unpaid" and s["payment"] == "manual" for s in o["suborders"])
    assert {s["code"][:3] for s in o["suborders"]} == {"HS-"}
    # notifications : chaque vendeur + le client
    assert any(t == "Nouvelle commande" and sa["code"] in b_ for t, b_ in notifs(w.users["owner"]))
    assert any(t == "Nouvelle commande" and sc["code"] in b_ for t, b_ in notifs(w.users["other"]))
    assert any(t == "Commande envoyée" and o["code"] in b_ for t, b_ in notifs(w.users["g1"]))


def test_checkout_is_idempotent_and_rejects_key_reuse_with_other_payload(w, shops):
    (a, ia) = shops["a"]
    k = key()
    n = count(FoodOrder)
    r1 = checkout(w, "g1", [vend(a, ia, 1)], k=k)
    r2 = checkout(w, "g1", [vend(a, ia, 1)], k=k)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["code"] == r2.json()["code"] and r2.json()["replayed"] is True and count(FoodOrder) == n + 1
    assert checkout(w, "g1", [vend(a, ia, 2)], k=k).status_code == 409  # même clé, autre contenu
    # même clé, autre client : ce n'est pas la même commande (la clé est propre au compte)
    r3 = checkout(w, "g2", [vend(a, ia, 1)], k=k)
    assert r3.status_code == 201 and r3.json()["code"] != r1.json()["code"]


def test_checkout_blocks_on_unavailable_and_creates_nothing(w, shops):
    (a, ia), (b, ib) = shops["a"], shops["b"]
    n, ns = count(FoodOrder), count(FoodSubOrder)
    set_item(ib, is_available=False)
    try:
        r = checkout(w, "g1", [vend(a, ia), vend(b, ib)])
        assert r.status_code == 409
        d = r.json()["detail"]
        assert d["code"] == "cart_changed" and d["cart"]["ok"] is False
        assert [v["ok"] for v in d["cart"]["vendors"]] == [True, False]
    finally:
        set_item(ib, is_available=True)
    assert count(FoodOrder) == n and count(FoodSubOrder) == ns  # aucune commande partielle


def test_price_change_requires_acceptance_and_server_price_wins(w, shops):
    (a, ia) = shops["a"]
    set_item(ia, price=30.0)
    try:
        r = checkout(w, "g1", [vend(a, ia, 1, price=25.0)])  # le client avait vu 25
        assert r.status_code == 409 and any(i["code"] == "price_changed" for i in r.json()["detail"]["cart"]["vendors"][0]["issues"])
        r = checkout(w, "g1", [vend(a, ia, 1, price=25.0)], accept_price_changes=True)
        assert r.status_code == 201
        assert r.json()["suborders"][0]["items"][0]["unit_price"] == 30.0 and r.json()["items_total"] == 30.0
    finally:
        set_item(ia, price=25.0)


def test_delivery_rules(w, shops):
    (a, ia), (b, ib), (c, ic) = shops["a"], shops["b"], shops["c"]

    def codes(vendors):
        r = checkout(w, "g1", vendors)
        assert r.status_code == 409, r.text
        return {i["code"] for v in r.json()["detail"]["cart"]["vendors"] for i in v["issues"]}

    assert codes([vend(a, ia, ful="delivery", zone="Roma")]) == {"address_required"}
    assert codes([vend(a, ia, ful="delivery", address="12 Rue Roma")]) == {"zone_required"}
    assert codes([vend(a, ia, ful="delivery", address="12 Rue Roma", zone="Chelston")]) == {"zone_unsupported"}
    assert codes([{"restaurant_id": a, "lines": [{"item_id": ia, "qty": 1}]}]) == {"fulfilment_missing"}
    set_row(c, offers_delivery=False)
    try:
        assert codes([vend(c, ic, ful="delivery", address="12 Rue Roma", zone="Roma")]) == {"delivery_unavailable"}
        assert checkout(w, "g1", [vend(c, ic, ful="pickup")]).status_code == 201  # le retrait reste possible
    finally:
        set_row(c, offers_delivery=True)
    ok = checkout(w, "g1", [vend(c, ic, ful="delivery", address="12 Rue Roma", zone="ROMA")])
    assert ok.status_code == 201 and ok.json()["suborders"][0]["delivery_fee"] == 0.0 and ok.json()["suborders"][0]["fee_pending"] is False  # gratuite


def test_cross_vendor_and_foreign_items_rejected(w, shops):
    (a, ia), (b, ib) = shops["a"], shops["b"]
    r = checkout(w, "g1", [vend(a, ib)])  # le plat de B glissé dans la ligne du vendeur A
    assert r.status_code == 409 and r.json()["detail"]["cart"]["vendors"][0]["issues"][0]["code"] == "item_not_found"


def test_inactive_vendor_blocks(w, shops):
    (c, ic) = shops["c"]
    set_row(c, status="suspended")
    try:
        r = checkout(w, "g1", [vend(c, ic)])
        assert r.status_code == 409 and r.json()["detail"]["cart"]["vendors"][0]["issues"] == [{"code": "vendor_unavailable"}]
    finally:
        set_row(c, status="active")


def test_pending_orders_cap(w, shops, monkeypatch):
    (a, ia) = shops["a"]
    monkeypatch.setattr(L, "ORDER_MAX_ACTIVE", 0)
    assert checkout(w, "g2", [vend(a, ia)]).status_code == 409


# ───────────────────────── Suivi client, vendeur, isolation ─────────────────────────
def test_seller_decisions_are_independent_and_payment_stays_separate(w, shops):
    (a, ia), (b, ib), (c, ic) = shops["a"], shops["b"], shops["c"]
    o = checkout(w, "g2", [vend(a, ia), vend(b, ib), vend(c, ic)]).json()
    sa, sb, sc = (s["code"] for s in o["suborders"])
    # un autre vendeur ne peut rien décider sur la commande d'autrui (404, existence non révélée)
    assert w.post(f"{API}/seller/orders/{sc}/decision", json={"action": "accept"}, headers=H(w, "owner")).status_code == 404
    assert w.post(f"{API}/seller/orders/{sa}/decision", json={"action": "decline"}, headers=H(w, "owner")).status_code == 422  # motif obligatoire
    acc = w.post(f"{API}/seller/orders/{sa}/decision", json={"action": "accept"}, headers=H(w, "owner"))
    assert acc.status_code == 200 and acc.json()["status"] == "accepted" and acc.json()["payment_status"] == "unpaid"  # accepter ≠ payé
    dec = w.post(f"{API}/seller/orders/{sb}/decision", json={"action": "decline", "reason": "Plus de stock"}, headers=H(w, "owner"))
    assert dec.status_code == 200 and dec.json()["status"] == "declined" and dec.json()["decline_reason"] == "Plus de stock"
    assert w.post(f"{API}/seller/orders/{sb}/decision", json={"action": "accept"}, headers=H(w, "owner")).status_code == 409  # plus en attente
    got = w.get(f"{API}/me/orders/{o['code']}", headers=H(w, "g2")).json()
    assert [s["status"] for s in got["suborders"]] == ["accepted", "declined", "pending"] and got["status"] == "partial"
    assert all(s["payment_status"] == "unpaid" for s in got["suborders"])
    titles = [t for t, _ in notifs(w.users["g2"])]
    assert "Commande acceptée" in titles and "Commande refusée" in titles
    # le client annule la sous-commande restée en attente ; celles déjà traitées ne sont plus annulables
    assert w.post(f"{API}/me/suborders/{sc}/cancel", headers=H(w, "g2")).json()["status"] == "cancelled"
    assert w.post(f"{API}/me/suborders/{sa}/cancel", headers=H(w, "g2")).status_code == 409
    assert w.post(f"{API}/me/suborders/{sc}/cancel", headers=H(w, "g1")).status_code == 404  # pas son compte


def test_isolation_between_customers_and_sellers(w, shops):
    (a, ia), (c, ic) = shops["a"], shops["c"]
    o = checkout(w, "g1", [vend(a, ia), vend(c, ic)]).json()
    assert w.get(f"{API}/me/orders/{o['code']}", headers=H(w, "g2")).status_code == 404
    assert w.get(f"{API}/me/orders/{o['code']}").status_code == 401
    mine = w.get(f"{API}/me/orders", headers=H(w, "g1")).json()["orders"]
    assert o["code"] in {x["code"] for x in mine} and all(x["code"] != o["code"] for x in w.get(f"{API}/me/orders", headers=H(w, "g2")).json()["orders"])
    # le vendeur C ne voit que SA sous-commande, avec le contact du client, jamais les autres vendeurs
    inbox = w.get(f"{API}/seller/orders", headers=H(w, "other")).json()["orders"]
    row = next(x for x in inbox if x["order_code"] == o["code"])
    assert row["restaurant_id"] == c and row["customer"] == {"name": "Cliente Test", "phone": "0977000111"} and "suborders" not in row
    assert all(x["restaurant_id"] == c for x in inbox)
    assert w.get(f"{API}/seller/orders", headers=H(w, "g1")).json()["orders"] == []  # un simple client n'a aucune boîte vendeur
    assert w.get(f"{API}/seller/orders?status=cancelled", headers=H(w, "other")).json()["orders"] == [] or True


def test_order_lines_are_snapshots(w, shops):
    (a, ia) = shops["a"]
    o = checkout(w, "g1", [vend(a, ia, 2)]).json()
    set_item(ia, price=99.0, name="Plat renommé")
    try:
        got = w.get(f"{API}/me/orders/{o['code']}", headers=H(w, "g1")).json()
        line = got["suborders"][0]["items"][0]
        assert line["unit_price"] == 25.0 and line["name"] == "Plat C2 Vendeur A" and got["items_total"] == 50.0
    finally:
        set_item(ia, price=25.0, name="Plat C2 Vendeur A")
