"""H-Money : devis, envoi ZM→CD, demande CD→ZM, échecs et remboursement, limites."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "money.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402

M = "/api/v1/money"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key, ver in (("ana", True), ("jean", True), ("ghost", False)):
            u = User(email=f"{key}@mn.test", full_name=key.title(), role=UserRole.client, is_verified=ver)
            s.add(u); s.commit(); s.refresh(u); ids[key] = u.id
    st = {"as": "ana"}
    def cur():
        with Session(engine) as s:
            return s.get(User, ids[st["as"]])
    app.dependency_overrides[get_current_user] = cur
    with TestClient(app) as client:
        client.st = st
        yield client
    app.dependency_overrides.clear()


def send_body(**kw):
    b = {"from_country": "ZM", "to_country": "CD", "amount": 500, "beneficiary_name": "Maman Kabila", "beneficiary_phone": "+243 81 234 5678",
         "beneficiary_operator": "mpesa", "pay_phone": "0961112233", "pay_operator": "mtn"}
    b.update(kw)
    return b


def test_corridors_and_quote(c):
    r = c.get(f"{M}/corridors").json()
    assert r["simulated"] is True and r["currencies"] == {"ZM": "ZMW", "CD": "USD"}
    q = c.get(f"{M}/quote", params={"amount": 500, "from": "ZM", "to": "CD"}).json()
    assert q["send_currency"] == "ZMW" and q["receive_currency"] == "USD" and q["receive_amount"] == 20.0  # 500 ZMW / 25
    assert q["fee"] == 15.0 and q["total_paid"] == 515.0
    # mode « il doit recevoir 20 USD » : on retrouve 500 ZMW
    q2 = c.get(f"{M}/quote", params={"amount": 20, "from": "ZM", "to": "CD", "mode": "receive"}).json()
    assert q2["send_amount"] == 500.0 and q2["receive_amount"] == 20.0
    assert c.get(f"{M}/quote", params={"amount": 5, "from": "ZM", "to": "ZM"}).status_code == 422
    assert c.get(f"{M}/quote", params={"amount": 1, "from": "ZM", "to": "CD"}).status_code == 422  # sous le minimum
    assert c.get(f"{M}/quote", params={"amount": 90000, "from": "ZM", "to": "CD"}).status_code == 422  # au-dessus du plafond


def test_send_completes(c):
    r = c.post(f"{M}/transfers", json=send_body())
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["status"] == "completed" and t["receive_amount"] == 20.0 and t["total_paid"] == 515.0 and t["role"] == "payer"
    assert t["counterpart_phone"] == "243812345678" and t["simulated"] is True
    assert c.post(f"{M}/transfers", json=send_body(beneficiary_operator="zamtel")).status_code == 422  # opérateur d'un autre pays
    assert c.post(f"{M}/transfers", json=send_body(from_country="FR")).status_code == 422
    assert len(c.get(f"{M}/transfers").json()) == 1


def test_failures(c):
    # versement impossible → remboursé
    r = c.post(f"{M}/transfers", json=send_body(beneficiary_phone="243810000000")).json()
    assert r["status"] == "refunded" and "remboursé" in r["failure_reason"]
    # paiement refusé → rien n'est envoyé
    r = c.post(f"{M}/transfers", json=send_body(pay_phone="0961119999")).json()
    assert r["status"] == "cancelled"
    # e-mail non vérifié
    c.st["as"] = "ghost"
    assert c.post(f"{M}/transfers", json=send_body()).status_code == 403
    c.st["as"] = "ana"


def test_request_flow(c):
    # Ana (Lusaka) demande 20 USD à Jean… mais ici c'est l'inverse : Jean est au Congo et doit payer en USD ; Ana reçoit en ZMW
    c.st["as"] = "ana"
    r = c.post(f"{M}/requests", json={"payer_country": "CD", "receiver_country": "ZM", "amount": 250, "receive_phone": "0961112233",
                                     "receive_operator": "mtn", "payer_name": "Jean", "note": "Loyer"})
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "awaiting_payer" and req["role"] == "requester" and req["receive_currency"] == "ZMW"
    code = req["code"]
    c.st["as"] = "jean"
    v = c.get(f"{M}/requests/{code}").json()
    assert v["asker_name"] == "Ana" and v["quote"]["send_currency"] == "USD" and v["quote"]["send_amount"] == 10.0 and v["quote"]["receive_amount"] == 250.0
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243819999999", "pay_operator": "mtn"}).status_code == 422  # opérateur zambien
    # paiement refusé : la demande reste ouverte
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243819999999", "pay_operator": "mpesa"}).status_code == 402
    assert c.get(f"{M}/requests/{code}").json()["status"] == "awaiting_payer"
    ok = c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243811112222", "pay_operator": "mpesa"})
    assert ok.status_code == 200 and ok.json()["status"] == "completed" and ok.json()["role"] == "payer"
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243811112222", "pay_operator": "mpesa"}).status_code == 409
    # côté demandeur : même opération, vue « requester »
    c.st["as"] = "ana"
    mine = {t["code"]: t for t in c.get(f"{M}/transfers").json()}
    assert mine[code]["role"] == "requester" and mine[code]["status"] == "completed"


def test_request_decline_and_self_pay(c):
    c.st["as"] = "ana"
    code = c.post(f"{M}/requests", json={"payer_country": "CD", "receiver_country": "ZM", "amount": 100, "receive_phone": "0961112233",
                                         "receive_operator": "airtel", "payer_name": "Jean"}).json()["code"]
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "0961112233", "pay_operator": "mpesa"}).status_code == 422  # on ne se paie pas soi-même
    c.st["as"] = "jean"
    assert c.post(f"{M}/requests/{code}/decline").json()["status"] == "declined"
    assert c.post(f"{M}/requests/{code}/decline").status_code == 409
    assert c.get(f"{M}/requests/HM-INCONNU").status_code == 404


def test_send_and_withdraw_rates_per_direction(c):
    """Taux d'envoi (Envoyer) et de retrait (Demander) distincts, dans les deux sens ; revient au marché avec reset."""
    from app.money import services as svc
    from app.money.admin import CorridorRateIn, _apply_corridor_rate
    from app.models import User
    with Session(engine) as s:
        admin = s.exec(select(User)).first()
        base = svc.quote_send(s, "ZM", "CD", 100)
        m = svc.market_rate(s, "ZM", "CD")
        _apply_corridor_rate(s, admin, CorridorRateIn(from_country="ZM", to_country="CD", send_rate=m * 0.9, withdraw_rate=m * 1.1), 0.5)
        q = svc.quote_send(s, "ZM", "CD", 100)
        assert q["receive_amount"] < base["receive_amount"]  # taux d'envoi plus bas : le bénéficiaire reçoit moins
        r = svc.quote_receive(s, "ZM", "CD", 10)
        assert r["receive_amount"] == 10 and r["send_amount"] > 0
        # le sens inverse n'est pas touché
        assert svc.override_rate(s, "CD", "ZM", "send") is None
        with pytest.raises(Exception):
            _apply_corridor_rate(s, admin, CorridorRateIn(from_country="ZM", to_country="CD", send_rate=m * 3), 0.5)
        _apply_corridor_rate(s, admin, CorridorRateIn(from_country="ZM", to_country="CD", reset=True), 0.5)
        assert svc.quote_send(s, "ZM", "CD", 100) == base
