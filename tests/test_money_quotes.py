from tests.idem_helper import with_idem
"""Étape 3 : devis persistants (usage unique, expiration), montants entiers, demandes de type A et B."""
import os
import tempfile
from datetime import datetime, timedelta

os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'q.db')}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.money.models import MoneyQuote, MoneySettings, MoneyTransfer  # noqa: E402

M = "/api/v1/money"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key in ("qa", "qb", "qc"):
            u = User(email=f"{key}@qt.test", full_name=key.upper(), role=UserRole.client, is_verified=True)
            s.add(u); s.commit(); s.refresh(u); ids[key] = u.id
    st = {"as": "qa"}

    def cur():
        with Session(engine) as s:
            return s.get(User, ids[st["as"]])
    app.dependency_overrides[get_current_user] = cur
    with TestClient(app) as client:
        with_idem(client)
        client.st = st
        yield client
    app.dependency_overrides.clear()


QB = {"from_country": "ZM", "to_country": "CD", "amount": 500, "pay_operator": "mtn", "beneficiary_operator": "orange"}


def send_body(qid="", **kw):
    b = {"from_country": "ZM", "to_country": "CD", "amount": 500, "beneficiary_name": "Maman", "beneficiary_phone": "+243 81 234 5678", "beneficiary_operator": "orange",
         "pay_phone": "0961112233", "pay_operator": "mtn", "quote_id": qid}
    b.update(kw)
    return b


def row(code):
    with Session(engine) as s:
        return s.exec(select(MoneyTransfer).where(MoneyTransfer.code == code)).one()


def test_quote_is_persisted_with_integer_amounts(c):
    q = c.post(f"{M}/quotes", json=QB).json()
    assert q["quote_id"] and q["send_amount"] == 500.0 and q["fee"] == 15.0 and q["total_paid"] == 515.0 and q["receive_amount"] == 19.7 and q["client_rate"] == 25.375
    with Session(engine) as s:
        r = s.get(MoneyQuote, q["quote_id"])
        assert (r.send_minor, r.fee_minor, r.total_minor, r.receive_minor) == (50000, 1500, 51500, 1970)
        assert all(isinstance(x, int) for x in (r.send_minor, r.fee_minor, r.total_minor, r.receive_minor)) and r.status == "open" and r.rate_k == "25.3750"


def test_transfer_uses_stored_quote_even_if_rates_change(c):
    q = c.post(f"{M}/quotes", json=QB).json()
    with Session(engine) as s:  # entre le récapitulatif et la confirmation, l'admin change frais et marge
        old = s.get(MoneySettings, 1)
        if old:
            s.delete(old); s.commit()
        s.add(MoneySettings(id=1, fee_pct=9, fee_pct_cz=9, margin_zc_pct=5, margin_cz_pct=5, min_fee_zmw=10, min_fee_usd=0.5, min_usd=2, max_usd=1000, daily_max_usd=2000)); s.commit()
    try:
        t = c.post(f"{M}/transfers", json=send_body(q["quote_id"])).json()
        assert (t["send_amount"], t["fee"], t["total_paid"], t["receive_amount"]) == (500.0, 15.0, 515.0, 19.7)  # les valeurs confirmées, pas les nouvelles
        r = row(t["code"])
        assert (r.send_minor, r.fee_minor, r.total_minor, r.receive_minor, r.quote_id, r.rate_k) == (50000, 1500, 51500, 1970, q["quote_id"], "25.3750")
        assert r.total_paid == r.total_minor / 100 and r.receive_amount == r.receive_minor / 100  # miroir float = entiers / 100
        # un nouveau devis, lui, reflète les nouveaux réglages
        assert c.post(f"{M}/quotes", json=QB).json()["fee"] == 45.0
    finally:
        with Session(engine) as s:
            s.delete(s.get(MoneySettings, 1)); s.commit()


def test_quote_single_use_expiry_owner_and_match(c):
    q = c.post(f"{M}/quotes", json=QB).json()
    assert c.post(f"{M}/transfers", json=send_body(q["quote_id"])).status_code == 201
    assert c.post(f"{M}/transfers", json=send_body(q["quote_id"])).status_code == 409          # déjà servi : pas de double opération
    q2 = c.post(f"{M}/quotes", json=QB).json()
    c.st["as"] = "qb"
    assert c.post(f"{M}/transfers", json=send_body(q2["quote_id"])).status_code == 404         # devis d'un autre utilisateur
    c.st["as"] = "qa"
    assert c.post(f"{M}/transfers", json=send_body(q2["quote_id"], pay_operator="airtel")).status_code == 422  # opérateur différent du devis
    with Session(engine) as s:
        r = s.get(MoneyQuote, q2["quote_id"]); r.expires_at = datetime.utcnow() - timedelta(seconds=1); s.add(r); s.commit()
    assert c.post(f"{M}/transfers", json=send_body(q2["quote_id"])).status_code == 409         # expiré
    assert c.post(f"{M}/transfers", json=send_body("inconnu")).status_code == 404


def test_request_type_a_fixes_exact_receive_amount(c):
    c.st["as"] = "qa"   # demandeur en RDC : veut RECEVOIR exactement 100 USD ; le payeur est en Zambie (A-ZC)
    r = c.post(f"{M}/requests", json={"payer_country": "ZM", "receiver_country": "CD", "request_type": "A", "amount": 100, "receive_phone": "0812345678", "receive_operator": "orange"})
    assert r.status_code == 201, r.text
    code = r.json()["code"]
    t = row(code)
    assert (t.request_type, t.requested_minor, t.requested_currency, t.amount_side, t.receive_minor) == ("A", 10000, "USD", "receive", 10000)
    c.st["as"] = "qb"
    q = c.post(f"{M}/requests/{code}/quote", json={"pay_operator": "mtn"}).json()
    assert q["receive_amount"] == 100.0 and q["send_amount"] == 2537.5 and q["fee"] == 76.13 and q["total_paid"] == 2613.63 and q["request_type"] == "A"
    ok = c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "0961112233", "pay_operator": "mtn", "quote_id": q["quote_id"]})
    assert ok.status_code == 200, ok.text
    t = row(code)
    assert t.receive_minor == 10000 and t.total_minor == 261363 and t.quote_id == q["quote_id"]  # le versement sera de 100,00 USD pile
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "0961112233", "pay_operator": "mtn"}).status_code == 409


def test_request_type_b_fixes_exact_payer_amount(c):
    c.st["as"] = "qa"   # demandeur en Zambie ; le payeur congolais paie EXACTEMENT 100 USD (hors frais) (B-CZ)
    r = c.post(f"{M}/requests", json={"payer_country": "CD", "receiver_country": "ZM", "request_type": "B", "amount": 100, "receive_phone": "0961112233", "receive_operator": "airtel"})
    assert r.status_code == 201, r.text
    code = r.json()["code"]
    t = row(code)
    assert (t.request_type, t.requested_minor, t.requested_currency, t.amount_side) == ("B", 10000, "USD", "pay")
    c.st["as"] = "qc"
    q = c.post(f"{M}/requests/{code}/quote", json={"pay_operator": "orange"}).json()
    assert q["send_amount"] == 100.0 and q["fee"] == 4.0 and q["total_paid"] == 104.0 and q["receive_amount"] == 2462.5 and q["request_type"] == "B"  # 100 + 4 = 104 ; le créateur reçoit la conversion
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "0811112222", "pay_operator": "orange", "quote_id": q["quote_id"]}).status_code == 200
    t = row(code)
    assert (t.send_minor, t.fee_minor, t.total_minor, t.receive_minor) == (10000, 400, 10400, 246250)


def test_usd_shortcut_follows_type_mapping(c):
    c.st["as"] = "qa"
    a = c.post(f"{M}/requests", json={"payer_country": "ZM", "receiver_country": "CD", "amount_usd": 40, "receive_phone": "0812345678", "receive_operator": "orange"}).json()
    b = c.post(f"{M}/requests", json={"payer_country": "CD", "receiver_country": "ZM", "amount_usd": 40, "receive_phone": "0961112233", "receive_operator": "airtel"}).json()
    assert row(a["code"]).request_type == "A" and row(b["code"]).request_type == "B"
    bad = c.post(f"{M}/requests", json={"payer_country": "ZM", "receiver_country": "CD", "request_type": "Z", "amount": 40, "receive_phone": "0812345678", "receive_operator": "orange"})
    assert bad.status_code == 422


def test_invoice_is_type_a(c):
    c.st["as"] = "qa"
    r = c.post(f"{M}/invoices", json={"client_name": "Client", "client_email": "qb@qt.test", "client_country": "CD", "receive_country": "ZM", "receive_phone": "0961112233",
                                      "receive_operator": "airtel", "items": [{"label": "x", "qty": 2, "unit_price": 150.25}]})
    assert r.status_code == 201, r.text
    t = row(r.json()["transfer_code"])
    assert (t.request_type, t.requested_minor, t.requested_currency, t.amount_side, t.receive_minor) == ("A", 30050, "ZMW", "receive", 30050)
