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
         "beneficiary_operator": "orange", "pay_phone": "0961112233", "pay_operator": "mtn"}
    b.update(kw)
    return b


def test_corridors_and_quote(c):
    r = c.get(f"{M}/corridors").json()
    assert r["simulated"] is True and r["currencies"] == {"ZM": "ZMW", "CD": "USD"}
    q = c.get(f"{M}/quote", params={"amount": 500, "from": "ZM", "to": "CD"}).json()
    assert q["send_currency"] == "ZMW" and q["receive_currency"] == "USD" and q["receive_amount"] == 20.0  # 500 ZMW / 25
    assert q["fee"] == 22.53 and q["total_paid"] == 522.53  # opérateur congolais par défaut (Airtel = Orange, même tarif) + 1 % de marge nette
    # mode « il doit recevoir 20 USD » : on retrouve 500 ZMW
    q2 = c.get(f"{M}/quote", params={"amount": 20, "from": "ZM", "to": "CD", "mode": "receive"}).json()
    assert q2["send_amount"] == 500.0 and q2["receive_amount"] == 20.0
    assert c.get(f"{M}/quote", params={"amount": 5, "from": "ZM", "to": "ZM"}).status_code == 422
    assert c.get(f"{M}/quote", params={"amount": 1, "from": "ZM", "to": "CD"}).status_code == 422  # sous le minimum
    assert c.get(f"{M}/quote", params={"amount": 90000, "from": "ZM", "to": "CD"}).status_code == 422  # au-dessus du plafond


def review(code, approve=True, reason=""):
    """Décision d'un agent / de l'admin (la logique métier est la même que celle des routes de contrôle)."""
    from app.money.models import MoneyTransfer
    from app.money.router import finalize_review
    with Session(engine) as s:
        t = s.exec(select(MoneyTransfer).where(MoneyTransfer.code == code)).one()
        finalize_review(s, t, approve, reason)
        s.add(t); s.commit(); s.refresh(t)
        return t.status


def test_send_completes(c):
    r = c.post(f"{M}/transfers", json=send_body())
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["status"] == "under_review" and t["receive_amount"] == 20.0 and t["total_paid"] == 522.53 and t["role"] == "payer"  # argent gardé, en attente de contrôle
    assert review(t["code"]) == "completed"
    assert t["counterpart_phone"] == "243812345678" and t["simulated"] is True
    assert c.post(f"{M}/transfers", json=send_body(beneficiary_operator="zamtel")).status_code == 422  # opérateur d'un autre pays
    assert c.post(f"{M}/transfers", json=send_body(from_country="FR")).status_code == 422
    assert len(c.get(f"{M}/transfers").json()) >= 1


def test_failures(c):
    # versement impossible → remboursé
    r = c.post(f"{M}/transfers", json=send_body(beneficiary_phone="243810000000")).json()
    assert r["status"] == "under_review"
    assert review(r["code"]) == "refunded"  # le versement échoue au moment de la confirmation → le payeur est remboursé
    # refus par l'agent : remboursé aussi
    r2 = c.post(f"{M}/transfers", json=send_body()).json()
    assert review(r2["code"], False, "Montant inhabituel") == "rejected"
    import pytest as _p
    with _p.raises(Exception):
        review(r2["code"])  # une opération déjà décidée ne se rejoue pas
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
                                     "receive_operator": "airtel", "payer_name": "Jean", "note": "Loyer"})
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "awaiting_payer" and req["role"] == "requester" and req["receive_currency"] == "ZMW"
    code = req["code"]
    c.st["as"] = "jean"
    v = c.get(f"{M}/requests/{code}").json()
    assert v["asker_name"] == "Ana" and v["quote"]["send_currency"] == "USD" and v["quote"]["send_amount"] == 10.0 and v["quote"]["receive_amount"] == 250.0
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243819999999", "pay_operator": "mtn"}).status_code == 422  # opérateur zambien
    # paiement refusé : la demande reste ouverte
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243819999999", "pay_operator": "orange"}).status_code == 402
    assert c.get(f"{M}/requests/{code}").json()["status"] == "awaiting_payer"
    ok = c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243811112222", "pay_operator": "orange"})
    assert ok.status_code == 200 and ok.json()["status"] == "under_review" and ok.json()["role"] == "payer"
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "243811112222", "pay_operator": "orange"}).status_code == 409
    # côté demandeur : même opération, vue « requester »
    c.st["as"] = "ana"
    mine = {t["code"]: t for t in c.get(f"{M}/transfers").json()}
    assert mine[code]["role"] == "requester" and mine[code]["status"] == "under_review"
    assert review(code) == "completed"


def test_request_decline_and_self_pay(c):
    c.st["as"] = "ana"
    code = c.post(f"{M}/requests", json={"payer_country": "CD", "receiver_country": "ZM", "amount": 100, "receive_phone": "0961112233",
                                         "receive_operator": "airtel", "payer_name": "Jean"}).json()["code"]
    assert c.post(f"{M}/requests/{code}/pay", json={"pay_phone": "0961112233", "pay_operator": "orange"}).status_code == 422  # on ne se paie pas soi-même
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


def test_fee_included_or_deducted(c):
    """Case « avec frais » : cochée, les frais s'ajoutent ; décochée, ils sont retirés du montant saisi."""
    added = c.get(f"{M}/quote", params={"amount": 500, "from": "ZM", "to": "CD", "with_fee": "true"}).json()
    assert added["total_paid"] == 522.53 and added["receive_amount"] == 20.0 and added["fee_mode"] == "added"
    ded = c.get(f"{M}/quote", params={"amount": 500, "from": "ZM", "to": "CD", "with_fee": "false"}).json()
    assert ded["total_paid"] == 500.0 and ded["fee_mode"] == "deducted" and ded["fee"] >= 15.0
    assert ded["send_amount"] == round(500 - ded["fee"], 2) and ded["receive_amount"] == round(ded["send_amount"] / 25, 1) - (0 if round(ded["send_amount"] / 25, 2) == round(ded["send_amount"] / 25, 1) else 0) or abs(ded["receive_amount"] - ded["send_amount"] / 25) < 0.05
    t = c.post(f"{M}/transfers", json=send_body(with_fee=False)).json()
    assert t["total_paid"] == 500.0 and t["receive_amount"] == ded["receive_amount"]


def test_phone_indicators(c):
    from fastapi import HTTPException
    from app.money import services as svc
    n = svc.normalize_phone
    for raw in ("0961112233", "961112233", "+260 96 111 2233", "00260961112233", "260961112233"):
        assert n(raw, "ZM") == "260961112233"
    assert n("+243 81 234 5678", "CD") == "243812345678" and n("0812345678", "CD") == "243812345678"
    for raw, country in (("+243812345678", "ZM"), ("260961112233", "CD"), ("+33612345678", "ZM"), ("12345", "ZM")):
        with pytest.raises(HTTPException):
            n(raw, country)
    # via l'API : un numéro congolais pour un bénéficiaire zambien est refusé
    assert c.post(f"{M}/transfers", json=send_body(from_country="CD", to_country="ZM", beneficiary_operator="mtn", beneficiary_phone="+243812345678",
                                                   pay_operator="orange", pay_phone="0812345678", amount=20000)).status_code == 422


def test_fee_deducted_shows_beneficiary_less(c):
    """Décochée : le payeur paie exactement le montant saisi ; frais retirés ; le bénéficiaire reçoit moins que case cochée."""
    on = c.get(f"{M}/quote", params={"amount": 300, "from": "ZM", "to": "CD", "with_fee": "true"}).json()
    off = c.get(f"{M}/quote", params={"amount": 300, "from": "ZM", "to": "CD", "with_fee": "false"}).json()
    assert off["total_paid"] == 300 and off["send_amount"] == round(300 - off["fee"], 2)
    assert on["total_paid"] == round(300 + on["fee"], 2) and on["send_amount"] == 300 and off["receive_amount"] < on["receive_amount"]


def test_operator_pricing_never_loses_money(c):
    """Pour chaque couple d'opérateurs et chaque montant, les frais couvrent le coût de l'agrégateur + la marge cible."""
    from sqlmodel import Session
    from app.money import pricing as P, services as svc
    with Session(engine) as s:
        for amount in (60, 140, 400, 900, 2500, 4800, 9000):
            for with_fee in (True, False):
                for pay in ("mtn", "airtel", "zamtel"):
                    for ben in ("orange", "airtel"):
                        q = svc.quote_send(s, "ZM", "CD", amount, with_fee, pay, ben)
                        assert q["fee"] - q["provider_cost"] >= q["send_amount"] * 1.0 / 100 - 0.02, (amount, with_fee, pay, ben, q)
                # sens inverse : le payeur est au Congo, le bénéficiaire en Zambie (Airtel seulement)
                q = svc.quote_send(s, "CD", "ZM", amount / 20, with_fee, "orange", "airtel")
                assert q["fee"] - q["provider_cost"] >= q["send_amount"] * 1.0 / 100 - 0.5, (amount, q)
        # Orange et Airtel (RDC) : exactement les mêmes frais, aucun opérateur n'est favorisé
        o, a = svc.quote_send(s, "ZM", "CD", 500, True, "airtel", "orange"), svc.quote_send(s, "ZM", "CD", 500, True, "airtel", "airtel")
        assert o["fee"] == a["fee"] and o["receive_amount"] == a["receive_amount"]
        assert P.cost_local(P.get_fee(s, "ZM", "airtel", "in"), 100) == 0.5 + 1.0   # < 150,01 ZMW : 0,5 + 1 %
        assert P.cost_local(P.get_fee(s, "ZM", "airtel", "in"), 6000) == 5.5 + 60.0  # > 5 000,01 ZMW : 5,5 + 1 %


def test_operator_availability_and_compare(c):
    r = c.get(f"{M}/corridors").json()["operators"]
    assert {o["key"] for o in r["ZM"] if o["receive"]} == {"mtn", "airtel", "zamtel"}  # Zambie : MTN, Airtel, Zamtel
    assert {o["key"] for o in r["CD"] if o["receive"]} == {"orange", "airtel"}
    assert [o["key"] for o in r["CD"] if o["cheapest_receive"]] == []  # mêmes frais : pas de « moins cher »
    assert set(r["CD"][i]["key"] for i in range(len(r["CD"]))) == {"airtel", "orange"}  # M-Pesa / Africell ne sont plus proposés
    cmp = c.get(f"{M}/quote/compare", params={"amount": 500, "from": "ZM", "to": "CD"}).json()
    assert [x["operator"] for x in cmp] == ["airtel", "orange"] and cmp[0]["receive_amount"] == cmp[1]["receive_amount"]
    assert "provider_cost" not in c.get(f"{M}/quote", params={"amount": 500, "from": "ZM", "to": "CD"}).json()


def test_pawapay_adapter_with_fake_server():
    import httpx
    from app.money.provider import PawaPayProvider
    calls = []

    def handler(req: httpx.Request):
        calls.append((req.method, req.url.path))
        assert req.headers["authorization"] == "Bearer tok"
        if req.method == "POST":
            import json as j
            b = j.loads(req.content)
            if req.url.path == "/v2/deposits" and b["amount"] == "100.00":
                assert b["currency"] == "ZMW" and b["payer"]["accountDetails"] == {"phoneNumber": "260961112233", "provider": "AIRTEL_OAPI_ZMB"}
            if req.url.path == "/v2/payouts":
                assert b["recipient"]["accountDetails"]["provider"] == "ORANGE_COD"
            if b.get("amount") == "13.00":
                return httpx.Response(200, json={"status": "REJECTED", "failureReason": {"failureCode": "PAYER_NOT_FOUND"}})
            return httpx.Response(200, json={"status": "ACCEPTED"})
        return httpx.Response(200, json={"status": "FOUND", "data": {"status": "COMPLETED" if "deposits" in req.url.path else "FAILED", "failureReason": {"failureCode": "RECIPIENT_NOT_FOUND"}}})

    p = PawaPayProvider("tok", "https://api.sandbox.pawapay.io", 3, transport=httpx.MockTransport(handler), sleep=lambda s: None)
    ok = p.collect(country="ZM", currency="ZMW", amount=100, phone="260961112233", operator="airtel", reference="HM-1")
    assert ok.ok and ok.ref
    bad = p.payout(country="CD", currency="USD", amount=20, phone="243812345678", operator="orange", reference="HM-1")
    assert not bad.ok and "introuvable" in bad.reason
    rej = p.collect(country="ZM", currency="ZMW", amount=13, phone="260961112233", operator="airtel", reference="HM-2")
    assert not rej.ok and "introuvable" in rej.reason
    assert p.refund(ref=ok.ref, amount=100, currency="ZMW").ok


def test_request_in_usd_and_change(c):
    """Demander : le montant se saisit en dollars. Change : devis USD ⇄ ZMW."""
    ch = c.get(f"{M}/change", params={"amount": 100, "from": "USD", "to": "ZMW"})
    assert ch.status_code == 200, ch.text
    j = ch.json()
    assert j["receive"] > 0 and j["rate"] <= j["mid_rate"]
    back = c.get(f"{M}/change", params={"amount": j["receive"], "from": "ZMW", "to": "USD"}).json()
    assert back["receive"] <= 100  # aller-retour : jamais gagnant pour l'utilisateur
    assert c.get(f"{M}/change", params={"amount": 5, "from": "ZMW", "to": "CDF"}).status_code == 422
    assert c.get(f"{M}/change", params={"amount": 5, "from": "EUR", "to": "USD"}).status_code == 422


def test_request_amount_entered_in_usd(c):
    c.st["as"] = "ana"
    r = c.post(f"{M}/requests", json={"payer_country": "CD", "receiver_country": "ZM", "amount_usd": 20, "receive_phone": "0961112233",
                                     "receive_operator": "airtel", "payer_name": "Jean"})
    assert r.status_code == 201, r.text
    zmw = r.json()["receive_amount"]
    usd = c.get(f"{M}/change", params={"amount": zmw, "from": "ZMW", "to": "USD"}).json()["usd_value"]
    assert 19.5 <= usd <= 20.5  # ≈ 20 USD, converti au taux du marché
    assert c.post(f"{M}/requests", json={"payer_country": "CD", "receiver_country": "ZM", "receive_phone": "0961112233", "receive_operator": "airtel", "payer_name": "Jean"}).status_code == 422
