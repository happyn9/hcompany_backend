"""H-Shopping : commission incluse dans le prix (le vendeur saisit ce qu'il reçoit)."""
import io
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "markup.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.admin_security import require_admin_confirmed  # noqa: E402
from app.deps import get_current_admin, get_current_partner, get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerApplication, PartnerModule, PartnerStatus, User, UserRole  # noqa: E402
from app.shopping.services import gross_up, seed_shopping  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
SP = "/api/v1/shopping/seller"


@pytest.fixture(scope="module")
def ctx():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key, role in (("admin", UserRole.admin), ("seller", UserRole.client), ("buyer", UserRole.client), ("agent", UserRole.partner)):
            u = User(email=f"{key}@mk.test", full_name=key, role=role, is_verified=True)
            s.add(u); s.commit(); s.refresh(u); ids[key] = u.id
        pa = PartnerApplication(company="Lk", contact_name="A", email="agent@mk.test", category="Transport", status=PartnerStatus.approved, user_id=ids["agent"])
        s.add(pa); s.commit(); s.refresh(pa)
        s.add(PartnerModule(user_id=ids["seller"], module="shopping")); s.commit()
        seed_shopping(s)
        pid = pa.id
    st = {"as": "seller"}
    def cur():
        with Session(engine) as s:
            return s.get(User, ids[st["as"]])
    def adm():
        with Session(engine) as s:
            return s.get(User, ids["admin"])
    def par():
        with Session(engine) as s:
            return s.get(PartnerApplication, pid)
    app.dependency_overrides[get_current_user] = cur
    app.dependency_overrides[get_optional_user] = cur
    app.dependency_overrides[get_current_admin] = adm
    app.dependency_overrides[require_admin_confirmed] = adm
    app.dependency_overrides[get_current_partner] = par
    with TestClient(app) as c:
        c.st, c.pid = st, pid
        yield c
    app.dependency_overrides.clear()


def test_gross_up_math():
    assert gross_up(92, 8) == 100.0
    assert gross_up(100, 0) == 100.0
    assert gross_up(50, 8) == 54.35  # arrondi au centime supérieur : jamais en dessous de ce que le vendeur veut


def test_markup_flow(ctx):
    c = ctx
    c.st["as"] = "admin"
    ag = c.post("/api/v1/shopping/admin/agencies", json={"partner_application_id": c.pid, "name": "Lk", "city": "Lusaka", "address": "x", "pickup_fee": 10}).json()
    sh_id = None
    c.st["as"] = "seller"
    sh = c.post(f"{SP}/shops", json={"name": "Boutique MK", "city": "Lusaka"}).json()
    sh_id = sh["id"]
    c.st["as"] = "admin"
    c.patch(f"/api/v1/shopping/admin/shops/{sh_id}", json={"status": "approved"})
    img = None
    c.st["as"] = "seller"
    img = c.post(f"{SP}/uploads", files={"file": ("a.png", io.BytesIO(PNG), "image/png")}).json()["path"]

    # mode historique (par défaut) : le prix saisi est le prix client, la commission est retenue
    pv = c.get(f"{SP}/shops/{sh_id}/price-preview", params={"price": 100}).json()
    assert pv["mode"] == "deduct" and pv["client_price"] == 100 and pv["seller_price"] == 92

    # on bascule en commission incluse
    c.st["as"] = "admin"
    assert c.put("/api/v1/shopping/admin/settings", json={"commission_mode": "markup"}).json()["commission_mode"] == "markup"
    assert c.put("/api/v1/shopping/admin/settings", json={"commission_mode": "n'importe"}).status_code == 422
    c.st["as"] = "seller"
    pv = c.get(f"{SP}/shops/{sh_id}/price-preview", params={"price": 92}).json()
    assert pv == {"mode": "markup", "seller_price": 92, "client_price": 100.0, "commission_rate": 8.0, "commission_amount": 8.0}

    body = {"title": "Pagne premium", "price": 92, "stock": 5, "status": "active", "images": [img],
            "variants": [{"label": "S", "stock": 2}, {"label": "L", "price": 138, "stock": 3}]}
    p = c.post(f"{SP}/shops/{sh_id}/products", json=body).json()
    assert p["price"] == 92 and p["client_price"] == 100.0 and p["commission_included"] is True  # le vendeur voit SON prix
    assert [v["price"] for v in p["variants"]] == [92, 138]
    # aller-retour d'édition : pas de cumul de commission
    again = c.put(f"{SP}/products/{p['id']}", json={**body, "variants": [{"id": v["id"], "label": v["label"], "price": (138 if v["label"] == "L" else None), "stock": v["stock"]} for v in p["variants"]]}).json()
    assert again["price"] == 92 and again["client_price"] == 100.0

    # l'acheteur voit le prix tout compris, sans trace de commission
    c.st["as"] = "buyer"
    pub = c.get(f"/api/v1/shopping/products/{p['id']}").json()
    assert pub["price"] == 100.0 and "client_price" not in pub and "seller_price" not in pub
    assert sorted(v["price"] for v in pub["variants"]) == [100.0, 150.0]
    big = next(v for v in pub["variants"] if v["price"] == 150.0)
    q = c.post("/api/v1/shopping/cart/quote", json={"items": [{"product_id": p["id"], "variant_id": big["id"], "quantity": 2}], "agency_id": ag["id"]}).json()
    assert q["orders"][0]["subtotal"] == 300.0 and q["total"] == 310.0
    assert "_su" not in q["orders"][0]["lines"][0] and "seller_price" not in str(q)

    # commande réelle : le vendeur reçoit exactement 2 × 138 = 276
    r = c.post("/api/v1/shopping/checkout", json={"items": [{"product_id": p["id"], "variant_id": big["id"], "quantity": 2}], "delivery_mode": "agency_pickup",
              "agency_id": ag["id"], "recipient_name": "Jean K", "recipient_phone": "0961112233", "method": "mtn_momo", "phone": "096 1112233", "currency": "ZMW"})
    assert r.status_code == 201, r.text
    c.st["as"] = "seller"
    o = c.get(f"{SP}/shops/{sh_id}/orders").json()[0]
    assert o["seller_net"] == 276.0 and o["commission_amount"] == 24.0

    # changer le taux plus tard n'affecte pas un prix déjà publié (taux figé)
    c.st["as"] = "admin"
    c.put("/api/v1/shopping/admin/settings", json={"commission_rate": 20})
    c.st["as"] = "seller"
    assert c.get(f"{SP}/products/{p['id']}").json()["client_price"] == 100.0
    # modification rapide du prix : recalcul au taux figé
    assert c.patch(f"{SP}/products/{p['id']}", json={"price": 46}).json()["client_price"] == 50.0
