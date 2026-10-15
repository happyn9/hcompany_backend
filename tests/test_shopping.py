"""Tests H-Shopping : boutique → produit → commande → séquestre → colis
agence → livraison → libération des fonds, litiges, annulation, retraits."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "shop.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import io  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_partner, get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerApplication, PartnerStatus, User, UserRole  # noqa: E402
from app.shopping.models import ShopAgency, ShopCategory  # noqa: E402
from app.shopping.services import seed_shopping  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture(scope="module")
def ctx():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        users = {}
        for key, role in (("admin", UserRole.admin), ("seller", UserRole.client), ("buyer", UserRole.client), ("agent", UserRole.partner)):
            u = User(email=f"{key}@shop.test", full_name=f"{key.title()} Test", role=role, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            users[key] = u.id
        partner = PartnerApplication(company="Lukondo Test", contact_name="Agent", email="agent@shop.test", category="Transport",
                                     status=PartnerStatus.approved, user_id=users["agent"])
        s.add(partner)
        s.commit()
        s.refresh(partner)
        seed_shopping(s)
        agency_partner = partner.id
    state = {"as": "seller"}

    def _user(uid):
        with Session(engine) as s:
            return s.get(User, uid)

    def _current():
        return _user(users[state["as"]])

    def _partner():
        with Session(engine) as s:
            return s.get(PartnerApplication, agency_partner)

    app.dependency_overrides[get_current_user] = _current
    app.dependency_overrides[get_optional_user] = lambda: _current()
    app.dependency_overrides[get_current_admin] = lambda: _user(users["admin"])
    app.dependency_overrides[get_current_partner] = _partner
    with TestClient(app) as c:
        c.state, c.partner_id = state, agency_partner
        yield c
    app.dependency_overrides.clear()


def as_(c, who):
    c.state["as"] = who


def upload(c):
    r = c.post("/api/v1/shopping/seller/uploads", files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
    assert r.status_code == 200, r.text
    return r.json()["path"]


def test_upload_rejects_fake_image(ctx):
    as_(ctx, "seller")
    r = ctx.post("/api/v1/shopping/seller/uploads", files={"file": ("a.png", io.BytesIO(b"not an image"), "image/png")})
    assert r.status_code == 400
    r = ctx.post("/api/v1/shopping/seller/uploads", files={"file": ("a.gif", io.BytesIO(b"GIF89a"), "image/gif")})
    assert r.status_code == 400


def test_shop_lifecycle_and_catalog(ctx):
    # catégories de départ + agence
    cats = ctx.get("/api/v1/shopping/categories").json()
    assert any(c["slug"] == "mode" for c in cats)
    as_(ctx, "admin")
    r = ctx.post("/api/v1/shopping/admin/agencies", json={
        "partner_application_id": ctx.partner_id, "name": "Lukondo Lusaka", "city": "Lusaka", "address": "Cairo Road",
        "pickup_fee": 15, "home_fee": 40})
    assert r.status_code == 201, r.text
    ctx.agency_id = r.json()["id"]
    assert ctx.post("/api/v1/shopping/admin/agencies", json={"partner_application_id": ctx.partner_id, "name": "x1"}).status_code == 409

    as_(ctx, "seller")
    r = ctx.post("/api/v1/shopping/seller/shops", json={"name": "Chez Mama Nephi", "city": "Lusaka", "phone": "0971234567", "dispatch_agency_id": ctx.agency_id})
    assert r.status_code == 201, r.text
    shop = r.json()
    assert shop["status"] == "pending" and shop["slug"] == "chez-mama-nephi"
    ctx.shop_id = shop["id"]

    # boutique non validée : pas de produit, invisible du public
    body = {"title": "Robe wax", "price": 200, "stock": 5, "status": "active", "category_id": cats[0]["id"], "images": [upload(ctx)]}
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/products", json=body).status_code == 403
    assert ctx.get("/api/v1/shopping/shops/chez-mama-nephi").status_code == 404

    as_(ctx, "admin")
    assert ctx.patch(f"/api/v1/shopping/admin/shops/{ctx.shop_id}", json={"status": "rejected"}).status_code == 422
    r = ctx.patch(f"/api/v1/shopping/admin/shops/{ctx.shop_id}", json={"status": "approved"})
    assert r.status_code == 200 and r.json()["owner_email"] == "seller@shop.test"
    as_(ctx, "seller")

    # validations produit
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/products", json={**body, "images": []}).status_code == 422
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/products", json={**body, "compare_at_price": 100}).status_code == 422
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/products", json={**body, "images": ["shopping/1-aaaaaaaaaaaa.png"]}).status_code == 422
    r = ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/products", json={**body, "compare_at_price": 250})
    assert r.status_code == 201, r.text
    p1 = r.json()
    assert p1["discount_pct"] == 20
    ctx.p1 = p1["id"]
    # produit à variantes
    r = ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/products", json={
        "title": "Sac en pagne", "price": 120, "status": "active", "images": [upload(ctx)],
        "variants": [{"label": "Petit", "stock": 2}, {"label": "Grand", "price": 150, "stock": 4}]})
    assert r.status_code == 201, r.text
    ctx.p2 = r.json()["id"]
    ctx.v_small, ctx.v_big = [v["id"] for v in r.json()["variants"]]

    # catalogue public
    page = ctx.get("/api/v1/shopping/products", params={"q": "wax"}).json()
    assert page["total"] == 1 and page["items"][0]["title"] == "Robe wax"
    page = ctx.get("/api/v1/shopping/products", params={"category": "mode"}).json()
    assert page["total"] == 1
    page = ctx.get("/api/v1/shopping/products", params={"sort": "price_desc", "min_price": 100, "max_price": 130}).json()
    assert [i["title"] for i in page["items"]] == ["Sac en pagne"]
    detail = ctx.get(f"/api/v1/shopping/products/{ctx.p2}").json()
    assert detail["price"] == 120 and len(detail["variants"]) == 2 and detail["shop"]["slug"] == "chez-mama-nephi"
    home = ctx.get("/api/v1/shopping/home").json()
    assert home["stats"]["products"] == 2 and home["newest"]


def checkout_body(ctx, items, **kw):
    body = {"items": items, "delivery_mode": "agency_pickup", "agency_id": ctx.agency_id, "recipient_name": "Jean Kabongo",
            "recipient_phone": "0961112233", "method": "mtn_momo", "phone": "096 1112233", "currency": "ZMW"}
    body.update(kw)
    return body


def test_quote_and_checkout_validation(ctx):
    as_(ctx, "buyer")
    items = [{"product_id": ctx.p1, "quantity": 2}, {"product_id": ctx.p2, "variant_id": ctx.v_big, "quantity": 1}]
    q = ctx.post("/api/v1/shopping/cart/quote", json={"items": items, "agency_id": ctx.agency_id}).json()
    assert q["total"] == 200 * 2 + 150 + 15
    assert "commission_amount" not in q["orders"][0]
    # variante obligatoire, stock, agence
    assert ctx.post("/api/v1/shopping/cart/quote", json={"items": [{"product_id": ctx.p2, "quantity": 1}], "agency_id": ctx.agency_id}).status_code == 422
    assert ctx.post("/api/v1/shopping/cart/quote", json={"items": [{"product_id": ctx.p1, "quantity": 99}], "agency_id": ctx.agency_id}).status_code == 409
    assert ctx.post("/api/v1/shopping/cart/quote", json={"items": items}).status_code == 422
    assert ctx.post("/api/v1/shopping/cart/quote", json={"items": items, "agency_id": ctx.agency_id, "coupon_code": "NOPE"}).status_code == 422
    # opérateur / numéro
    assert ctx.post("/api/v1/shopping/checkout", json=checkout_body(ctx, items, phone="0971112233")).status_code == 422
    assert ctx.post("/api/v1/shopping/checkout", json=checkout_body(ctx, items, phone="12")).status_code == 422
    assert ctx.post("/api/v1/shopping/checkout", json=checkout_body(ctx, items, delivery_mode="home_delivery")).status_code == 422
    # on ne peut pas acheter chez soi
    as_(ctx, "seller")
    assert ctx.post("/api/v1/shopping/checkout", json=checkout_body(ctx, items)).status_code == 422


def test_full_order_flow_with_escrow_and_commission(ctx):
    as_(ctx, "seller")
    code_r = ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/coupons", json={"code": "bienvenue", "percent": 10})
    assert code_r.status_code == 201 and code_r.json()["code"] == "BIENVENUE"

    as_(ctx, "buyer")
    items = [{"product_id": ctx.p1, "quantity": 2}, {"product_id": ctx.p2, "variant_id": ctx.v_big, "quantity": 1}]
    r = ctx.post("/api/v1/shopping/checkout", json=checkout_body(ctx, items, coupon_code="bienvenue"))
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["status"] == "paid" and data["simulated"] is True and len(data["orders"]) == 1
    order = data["orders"][0]
    # sous-total 550, remise 10 % = 55, livraison 15 → 510
    assert (order["subtotal"], order["discount"], order["delivery_fee"], order["total"]) == (550, 55, 15, 510)
    assert order["escrow_status"] == "held" and order["status"] == "paid"
    assert order["commission_amount"] is None  # invisible pour l'acheteur
    ctx.code = order["code"]

    # stock décrémenté
    assert ctx.get(f"/api/v1/shopping/products/{ctx.p1}").json()["stock"] == 3
    big = [v for v in ctx.get(f"/api/v1/shopping/products/{ctx.p2}").json()["variants"] if v["id"] == ctx.v_big][0]
    assert big["stock"] == 3

    # le vendeur voit la commission (8 % de 495 = 39.60) et son net
    as_(ctx, "seller")
    seller_orders = ctx.get(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/orders").json()
    o = seller_orders[0]
    assert o["commission_amount"] == 39.6 and o["seller_net"] == 455.4
    w = ctx.get(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/wallet").json()
    assert w["available"] == 0 and w["pending"] == 455.4

    # expédition : accepter puis confier à l'agence → colis Lukondo
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/orders/{ctx.code}/accept").json()["status"] == "processing"
    shipped = ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/orders/{ctx.code}/ship", json={}).json()
    assert shipped["status"] == "shipped" and shipped["tracking_code"].startswith("HS-")
    ctx.tracking = shipped["tracking_code"]

    # suivi public : bon code + 4 derniers chiffres du destinataire
    as_(ctx, "buyer")
    assert ctx.get(f"/api/v1/shopping/track/{ctx.code}", params={"phone": "0000"}).status_code == 404
    t = ctx.get(f"/api/v1/shopping/track/{ctx.tracking}", params={"phone": "2233"}).json()
    assert t["code"] == ctx.code and t["recipient_first_name"] == "Jean" and len(t["events"]) >= 3

    # agence : reçu → en transit → disponible → retiré
    as_(ctx, "agent")
    me = ctx.get("/api/v1/shopping/agency/me").json()
    assert me["name"] == "Lukondo Lusaka"
    assert len(ctx.get("/api/v1/shopping/agency/orders").json()) == 1
    for st, status_after in (("received", "shipped"), ("in_transit", "shipped"), ("available", "shipped"), ("picked_up", "delivered")):
        r = ctx.post(f"/api/v1/shopping/agency/orders/{ctx.code}/status", json={"status": st})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == status_after
    assert ctx.post(f"/api/v1/shopping/agency/orders/{ctx.code}/status", json={"status": "bogus"}).status_code == 422

    # acheteur : avis impossible avant livraison confirmée? (livré → possible), confirmation → fonds libérés
    as_(ctx, "buyer")
    mine = ctx.get(f"/api/v1/shopping/me/orders/{ctx.code}").json()
    assert mine["status"] == "delivered" and mine["can_confirm"] and mine["can_dispute"] and not mine["can_cancel"]
    done = ctx.post(f"/api/v1/shopping/me/orders/{ctx.code}/confirm").json()
    assert done["status"] == "completed" and done["escrow_status"] == "released"
    assert ctx.post(f"/api/v1/shopping/me/orders/{ctx.code}/confirm").status_code == 409

    # avis (un seul par article, note 1-5)
    rv = {"order_code": ctx.code, "product_id": ctx.p1, "rating": 5, "comment": "Superbe tissu"}
    assert ctx.post("/api/v1/shopping/reviews", json={**rv, "rating": 9}).status_code == 422
    assert ctx.post("/api/v1/shopping/reviews", json=rv).status_code == 201
    assert ctx.post("/api/v1/shopping/reviews", json=rv).status_code == 409
    d = ctx.get(f"/api/v1/shopping/products/{ctx.p1}").json()
    assert d["rating_count"] == 1 and d["rating_avg"] == 5
    assert ctx.get(f"/api/v1/shopping/products/{ctx.p1}/reviews").json()[0]["author_name"] == "Buyer"

    # solde disponible et retrait
    as_(ctx, "seller")
    w = ctx.get(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/wallet").json()
    assert w["available"] == 455.4 and w["pending"] == 0
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/payouts", json={"amount": 9999, "operator": "mtn_momo", "phone": "0961112233"}).status_code == 422
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/payouts", json={"amount": 100, "operator": "mtn_momo", "phone": "0971112233"}).status_code == 422
    r = ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/payouts", json={"amount": 400, "operator": "mtn_momo", "phone": "0961112233"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert ctx.get(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/wallet").json()["available"] == 55.4
    as_(ctx, "admin")
    assert ctx.patch(f"/api/v1/shopping/admin/payouts/{pid}", json={"status": "paid"}).json()["status"] == "paid"
    assert ctx.patch(f"/api/v1/shopping/admin/payouts/{pid}", json={"status": "paid"}).status_code == 409
    ov = ctx.get("/api/v1/shopping/admin/overview").json()
    assert ov["commission"] == 39.6 and ov["gmv"] >= 510 and ov["escrow_held"] == 0


def test_cancel_restocks_and_dispute_resolution(ctx):
    as_(ctx, "buyer")
    r = ctx.post("/api/v1/shopping/checkout", json=checkout_body(ctx, [{"product_id": ctx.p1, "quantity": 1}], method="airtel_money", phone="0971234567"))
    assert r.status_code == 201, r.text
    code = r.json()["orders"][0]["code"]
    stock = ctx.get(f"/api/v1/shopping/products/{ctx.p1}").json()["stock"]
    r = ctx.post(f"/api/v1/shopping/me/orders/{code}/cancel", json={"reason": "Changement d'avis"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["escrow_status"] == "refunded"
    assert ctx.get(f"/api/v1/shopping/products/{ctx.p1}").json()["stock"] == stock + 1

    # litige : expédié → litige → l'admin rembourse
    r = ctx.post("/api/v1/shopping/checkout", json=checkout_body(ctx, [{"product_id": ctx.p2, "variant_id": ctx.v_small, "quantity": 1}], delivery_mode="home_delivery", address="Plot 12, Kabulonga", method="zamtel_money", phone="0951234567"))
    assert r.status_code == 201, r.text
    o = r.json()["orders"][0]
    assert o["delivery_fee"] == 40
    code = o["code"]
    assert ctx.post(f"/api/v1/shopping/me/orders/{code}/dispute", json={"reason": "Non reçu"}).status_code == 409  # pas encore expédié
    as_(ctx, "seller")
    ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/orders/{code}/ship", json={})
    assert ctx.post(f"/api/v1/shopping/seller/shops/{ctx.shop_id}/orders/{code}/cancel", json={}).status_code == 409
    as_(ctx, "buyer")
    r = ctx.post(f"/api/v1/shopping/me/orders/{code}/dispute", json={"reason": "Non reçu", "note": "Rien reçu après 10 jours"})
    assert r.status_code == 200 and r.json()["status"] == "disputed"
    as_(ctx, "admin")
    assert ctx.get("/api/v1/shopping/admin/overview").json()["disputes_open"] == 1
    r = ctx.post(f"/api/v1/shopping/admin/orders/{code}/resolve", json={"decision": "refund", "note": "Colis introuvable"})
    assert r.status_code == 200 and r.json()["status"] == "refunded"
    assert ctx.post(f"/api/v1/shopping/admin/orders/{code}/resolve", json={"decision": "refund"}).status_code == 409


def test_favorites_settings_and_commission_override(ctx):
    as_(ctx, "buyer")
    assert ctx.post(f"/api/v1/shopping/me/favorites/{ctx.p1}").status_code == 204
    assert ctx.post(f"/api/v1/shopping/me/favorites/{ctx.p1}").status_code == 204  # idempotent
    favs = ctx.get("/api/v1/shopping/me/favorites").json()
    assert len(favs) == 1 and favs[0]["is_favorite"]
    assert ctx.delete(f"/api/v1/shopping/me/favorites/{ctx.p1}").status_code == 204
    assert ctx.get("/api/v1/shopping/me/favorites").json() == []

    as_(ctx, "admin")
    s = ctx.put("/api/v1/shopping/admin/settings", json={"commission_rate": 10, "free_shipping_threshold": 300}).json()
    assert s["commission_rate"] == "10.0"
    ctx.patch(f"/api/v1/shopping/admin/shops/{ctx.shop_id}", json={"status": "approved", "commission_rate": 5})
    as_(ctx, "buyer")
    q = ctx.post("/api/v1/shopping/cart/quote", json={"items": [{"product_id": ctx.p1, "quantity": 2}], "agency_id": ctx.agency_id}).json()
    assert q["orders"][0]["delivery_fee"] == 0  # livraison offerte au-delà du seuil
    as_(ctx, "admin")
    ctx.put("/api/v1/shopping/admin/settings", json={"commission_rate": 8, "free_shipping_threshold": 0})
    ctx.patch(f"/api/v1/shopping/admin/shops/{ctx.shop_id}", json={"status": "suspended", "reason": "Test"})
    assert ctx.get("/api/v1/shopping/shops/chez-mama-nephi").status_code == 404
    as_(ctx, "buyer")
    assert ctx.post("/api/v1/shopping/cart/quote", json={"items": [{"product_id": ctx.p1, "quantity": 1}], "agency_id": ctx.agency_id}).status_code == 422
