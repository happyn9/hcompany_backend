"""Factures H-Money (émission, paiement domestique et transfrontalier, annulation) + registre des services."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "inv.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.money.invoices import record_service_payment  # noqa: E402

M = "/api/v1/money"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key, role in (("seller", UserRole.client), ("buyer", UserRole.client), ("boss", UserRole.admin)):
            u = User(email=f"{key}@inv.test", full_name=key.title(), role=role, is_verified=True)
            s.add(u); s.commit(); s.refresh(u); ids[key] = u.id
    st = {"as": "seller", "ids": ids}
    def cur():
        with Session(engine) as s:
            return s.get(User, ids[st["as"]])
    app.dependency_overrides[get_current_user] = cur
    with TestClient(app) as client:
        client.st = st
        yield client
    app.dependency_overrides.clear()


def body(**kw):
    b = {"client_name": "Acheteur", "client_email": "buyer@inv.test", "client_country": "ZM", "receive_country": "ZM", "receive_phone": "0971234567",
         "receive_operator": "airtel", "items": [{"label": "Maillots", "qty": 2, "unit_price": 150}, {"label": "Livraison", "qty": 1, "unit_price": 50}]}
    b.update(kw)
    return b


def test_create_total_and_listing(c):
    c.st["as"] = "seller"
    r = c.post(f"{M}/invoices", json=body())
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["total"] == 350 and inv["status"] == "open" and inv["role"] == "issuer" and inv["code"].startswith("INV-")
    assert any(i["code"] == inv["code"] for i in c.get(f"{M}/invoices").json())
    c.st["as"] = "buyer"  # le client voit la facture par son e-mail
    assert any(i["code"] == inv["code"] and i["role"] == "client" for i in c.get(f"{M}/invoices").json())
    v = c.get(f"{M}/invoices/{inv['code']}").json()
    assert v["quote"]["receive_amount"] == 350 and v["quote"]["total_paid"] >= 350


def test_pay_domestic_and_cross_border(c):
    c.st["as"] = "seller"
    inv = c.post(f"{M}/invoices", json=body()).json()
    c.st["as"] = "buyer"
    r = c.post(f"{M}/invoices/{inv['code']}/pay", json={"pay_phone": "0961234567", "pay_operator": "mtn"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"
    assert c.post(f"{M}/invoices/{inv['code']}/pay", json={"pay_phone": "0961234567", "pay_operator": "mtn"}).status_code == 409
    c.st["as"] = "seller"  # facture RDC → payée depuis la Zambie
    inv2 = c.post(f"{M}/invoices", json=body(client_country="ZM", receive_country="CD", receive_operator="orange", receive_phone="0891234567")).json()
    c.st["as"] = "buyer"
    assert c.post(f"{M}/invoices/{inv2['code']}/pay", json={"pay_phone": "0961234567", "pay_operator": "mtn"}).status_code == 200


def test_cannot_pay_own_and_cancel_rules(c):
    c.st["as"] = "seller"
    inv = c.post(f"{M}/invoices", json=body()).json()
    assert c.post(f"{M}/invoices/{inv['code']}/pay", json={"pay_phone": "0961234567", "pay_operator": "mtn"}).status_code == 422
    c.st["as"] = "buyer"
    assert c.post(f"{M}/invoices/{inv['code']}/cancel").status_code == 403
    c.st["as"] = "seller"
    assert c.post(f"{M}/invoices/{inv['code']}/cancel").json()["status"] == "cancelled"
    c.st["as"] = "buyer"
    assert c.post(f"{M}/invoices/{inv['code']}/pay", json={"pay_phone": "0961234567", "pay_operator": "mtn"}).status_code == 409


def test_validation(c):
    c.st["as"] = "seller"
    assert c.post(f"{M}/invoices", json=body(items=[])).status_code == 422
    assert c.post(f"{M}/invoices", json=body(receive_operator="nope")).status_code == 422
    assert c.get(f"{M}/invoices/INV-NOPE").status_code == 404


def test_service_ledger(c):
    with Session(engine) as s:
        row = record_service_payment(s, service="lodge", ref="BK-1", payer_user_id=c.st["ids"]["buyer"], payee_user_id=c.st["ids"]["seller"], currency="ZMW", gross=1000, commission_pct=10)
        assert row.commission == 100 and row.net_to_payee == 900
        record_service_payment(s, service="shopping", ref="OR-1", payer_user_id=c.st["ids"]["buyer"], payee_user_id=c.st["ids"]["seller"], currency="ZMW", gross=200, commission_pct=5)
        with pytest.raises(Exception):
            record_service_payment(s, service="x", ref="y", payer_user_id=1, payee_user_id=None, currency="ZMW", gross=0, commission_pct=5)
    c.st["as"] = "seller"
    e = c.get(f"{M}/earnings").json()
    lodge = next(x for x in e["summary"] if x["service"] == "lodge")
    assert lodge["gross"] == 1000 and lodge["commission"] == 100 and lodge["net"] == 900
    c.st["as"] = "buyer"
    assert c.get(f"{M}/admin/service-revenue").status_code in (401, 403)
    c.st["as"] = "boss"
    rev = c.get(f"{M}/admin/service-revenue")
    assert rev.status_code == 200 and {r["service"] for r in rev.json()} >= {"lodge", "shopping"}


def test_find_clients_masked_and_targeted_invoice(c):
    c.st["as"] = "seller"
    assert c.get(f"{M}/invoices/clients", params={"q": "bu"}).json() == []  # trop court
    r = c.get(f"{M}/invoices/clients", params={"q": "buyer"}).json()
    assert len(r) == 1 and r[0]["name"] == "Buyer" and "buyer@inv.test" not in str(r) and "•" in r[0]["email"]
    inv = c.post(f"{M}/invoices", json=body(client_email="", client_name="", client_user_id=r[0]["id"], client_country="CD", receive_operator="mtn")).json()
    assert inv["client_email"] == "buyer@inv.test"
    c.st["as"] = "buyer"
    assert any(i["code"] == inv["code"] and i["role"] == "client" for i in c.get(f"{M}/invoices").json())


def test_cd_operators_same_fees_and_no_cdf(c):
    cor = c.get(f"{M}/corridors").json()
    assert [o["key"] for o in cor["operators"]["CD"]] == ["airtel", "orange"]
    assert not any(o["cheapest_receive"] for o in cor["operators"]["CD"])
    assert {o["key"] for o in cor["operators"]["ZM"] if o["receive"]} == {"mtn", "airtel", "zamtel"}
    a = c.get(f"{M}/quote", params={"amount": 50, "from": "ZM", "to": "CD", "ben_op": "airtel"}).json()
    o = c.get(f"{M}/quote", params={"amount": 50, "from": "ZM", "to": "CD", "ben_op": "orange"}).json()
    assert a["fee"] == o["fee"] and a["receive_amount"] == o["receive_amount"]
    assert c.get(f"{M}/change", params={"amount": 10, "from": "USD", "to": "CDF"}).status_code == 422


def test_profile_first_transaction_only_fills_empty(c):
    with Session(engine) as s:
        u = User(email="fresh@inv.test", is_verified=True); s.add(u); s.commit(); s.refresh(u); c.st["ids"]["fresh"] = u.id
    c.st["as"] = "fresh"
    r = c.post(f"{M}/profile", json={"full_name": "Fresh Client", "phone": "0971234599", "country": "ZM"}).json()
    assert r["full_name"] == "Fresh Client" and r["phone"] == "+260971234599"
    r2 = c.post(f"{M}/profile", json={"full_name": "Autre", "phone": "0977777777", "country": "ZM"}).json()
    assert r2["full_name"] == "Fresh Client" and r2["phone"] == "+260971234599"
