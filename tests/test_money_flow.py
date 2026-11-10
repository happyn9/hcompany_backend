"""Étapes 4, 5 et 9 : grand livre, réserves, idempotence, webhooks, états atomiques ; doublons, échecs, remboursements, statuts inconnus, concurrence.
Fournisseur SIMULÉ uniquement (aucun vrai appel). Numéros de test — collecte : 9999 refusée, 5555 en attente, 6666 inconnue ; versement : 0000 refusé, 7777 en attente, 8888 inconnu."""
import json
import os
import tempfile
import threading
import uuid

os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'flow.db')}")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ["MONEY_WEBHOOK_SECRET"] = "test-secret-not-real"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import engine  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.money import flow, ledger  # noqa: E402
from app.money.models import LedgerEntry, MoneyIdempotency, MoneyProviderOp, MoneySettings, MoneyTransfer, ReserveHold  # noqa: E402
from app.money.provider import sign  # noqa: E402

settings.money_webhook_secret = "test-secret-not-real"
M = "/api/v1/money"
Q = {"from_country": "ZM", "to_country": "CD", "amount": 500, "pay_operator": "mtn", "beneficiary_operator": "orange"}


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        u = User(email="flow@fl.test", full_name="Flow", role=UserRole.client, is_verified=True)
        s.add(u); s.commit(); s.refresh(u); uid = u.id
    app.dependency_overrides[get_current_user] = lambda: Session(engine).get(User, uid)
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def gate(request):
    """Par défaut le contrôle manuel est ACTIF (comme en production) ; les tests marqués `auto` le désactivent."""
    auto = "auto" in request.keywords
    with Session(engine) as s:
        old = s.get(MoneySettings, 1)
        if old:
            s.delete(old); s.commit()
        if auto:
            s.add(MoneySettings(id=1, fee_pct=3, fee_pct_cz=4, margin_zc_pct=1.5, margin_cz_pct=1.5, min_fee_zmw=10, min_fee_usd=0.5, min_usd=2, max_usd=1000, daily_max_usd=1e9, review_all=False)); s.commit()
        else:
            s.add(MoneySettings(id=1, fee_pct=3, fee_pct_cz=4, margin_zc_pct=1.5, margin_cz_pct=1.5, min_fee_zmw=10, min_fee_usd=0.5, min_usd=2, max_usd=1000, daily_max_usd=1e9, review_all=True)); s.commit()
    yield
    with Session(engine) as s:  # ne laisse aucun réglage derrière soi (base partagée entre fichiers de test)
        old = s.get(MoneySettings, 1)
        if old:
            s.delete(old); s.commit()


pytest.mark.auto = pytest.mark.auto if hasattr(pytest.mark, "auto") else None
auto = pytest.mark.auto


def send(c, pay_phone="0961112233", ben_phone="+243 81 234 5678", key=None, amount=500):
    q = c.post(f"{M}/quotes", json={**Q, "amount": amount}).json()
    r = c.post(f"{M}/transfers", headers={"Idempotency-Key": key or uuid.uuid4().hex},
               json={"from_country": "ZM", "to_country": "CD", "amount": amount, "beneficiary_name": "Maman", "beneficiary_phone": ben_phone, "beneficiary_operator": "orange",
                     "pay_phone": pay_phone, "pay_operator": "mtn", "quote_id": q["quote_id"]})
    assert r.status_code == 201, r.text
    return r.json()


def tr(code):
    with Session(engine) as s:
        return s.exec(select(MoneyTransfer).where(MoneyTransfer.code == code)).one()


def ops(code, kind=None):
    with Session(engine) as s:
        q = select(MoneyProviderOp).where(MoneyProviderOp.transfer_code == code)
        if kind:
            q = q.where(MoneyProviderOp.kind == kind)
        return s.exec(q).all()


def entries(code):
    with Session(engine) as s:
        return s.exec(select(LedgerEntry).where(LedgerEntry.transfer_code == code)).all()


def acc(code):
    out = {}
    for e in entries(code):
        out[e.account] = out.get(e.account, 0) + e.debit_minor - e.credit_minor
    return out


def approve(code, ok=True, reason=""):
    with Session(engine) as s:
        return flow.decide_review(s, s.exec(select(MoneyTransfer).where(MoneyTransfer.code == code)).one(), ok, reason)


# ------------------------------------------------------------------ chemin nominal et grand livre
@auto
def test_happy_path_auto_payout_and_ledger(c):
    t = send(c)
    assert t["status"] == "completed" and t["stage"] == "success"
    a = acc(t["code"])
    # J1 : collecte de 515,00 ZMW ; J2 : produits = frais 15,00 + marge FX (500 − 19,70 × 25 = 7,50) ; versement 19,70 USD
    assert a["DUE_ZMW"] == 0 and a["REV_FRAIS_ZMW"] == -1500 and a["REV_FX_ZMW"] == -750
    assert a["PRV_ZMW"] == 51500 - a["CHARGE_COLLECTE_ZMW"] and a["CHARGE_COLLECTE_ZMW"] > 0          # collecte 515,00 moins le coût estimé de l'agrégateur
    assert a["CONV_ZMW"] == -(50000 - 750) and a["CONV_USD"] == 1970                                   # pont de change : 19,70 USD ↔ 492,50 ZMW au taux du marché
    assert a["PRV_USD"] == -(1970 + a["CHARGE_VERS_USD"])                                              # versement + coût estimé sortent du solde USD
    payout = ops(t["code"], "payout")
    assert len(payout) == 1 and payout[0].amount_minor == 1970 and payout[0].currency == "USD" and payout[0].status == "completed"  # montant FIGÉ du devis
    with Session(engine) as s:
        assert ledger.trial_balance(s)["balanced"]
        assert s.exec(select(ReserveHold).where(ReserveHold.transfer_code == t["code"])).one().status == "released"


def test_review_gate_then_approve_pays_once(c):
    t = send(c)
    assert t["status"] == "under_review" and t["stage"] == "collected" and not ops(t["code"], "payout")
    approve(t["code"])
    assert tr(t["code"]).status == "completed" and len(ops(t["code"], "payout")) == 1
    with pytest.raises(Exception):  # deuxième décision : refusée (409), pas de second versement
        approve(t["code"])
    assert len(ops(t["code"], "payout")) == 1 and acc(t["code"])["REV_FRAIS_ZMW"] == -1500


def test_reject_after_review_refunds_and_nets_to_zero(c):
    t = send(c)
    approve(t["code"], False, "Doute")
    r = tr(t["code"])
    assert r.status == "rejected" and len(ops(t["code"], "refund")) == 1 and not ops(t["code"], "payout")
    a = acc(t["code"])
    assert a["PRV_ZMW"] == 0 and a["DUE_ZMW"] == 0 and "REV_FRAIS_ZMW" not in a       # aucun produit reconnu sur une opération remboursée


# ------------------------------------------------------------------ échecs
def test_collection_refused_no_money_no_entries(c):
    t = send(c, pay_phone="0969999999"[:6] + "9999")
    assert t["status"] == "cancelled" and t["stage"] == "failed" and not entries(t["code"]) and not ops(t["code"], "payout")
    with Session(engine) as s:
        assert s.exec(select(ReserveHold).where(ReserveHold.transfer_code == t["code"])).one().status == "released"


@auto
def test_payout_confirmed_failure_refunds_payer(c):
    t = send(c, ben_phone="+243 81 230 0000")
    r = tr(t["code"])
    assert r.status == "refunded"
    assert len(ops(t["code"], "payout")) == 1 and len(ops(t["code"], "refund")) == 1 and ops(t["code"], "refund")[0].amount_minor == 51500
    a = acc(t["code"])
    assert a["PRV_ZMW"] == 0 and a["DUE_ZMW"] == 0 and not any(k.startswith("REV_") for k in a)


# ------------------------------------------------------------------ attente et statuts inconnus
def test_collection_pending_then_confirmed_via_webhook_flow(c):
    t = send(c, pay_phone="0961115555")
    assert t["status"] == "collecting" and t["stage"] == "pending_network" and not entries(t["code"])
    assert c.get(f"{M}/transfers/{t['code']}?refresh=true").json()["status"] == "collecting"      # le fournisseur n'a pas encore tranché
    r = c.post(f"{M}/sim/{t['code']}/completed").json()                                          # le payeur valide chez son opérateur (simulation)
    assert r["status"] == "under_review" and set(acc(t["code"])) == {"PRV_ZMW", "DUE_ZMW"}


def test_collection_pending_then_declined_by_payer(c):
    t = send(c, pay_phone="0961115555")
    r = c.post(f"{M}/sim/{t['code']}/failed").json()
    assert r["status"] == "cancelled" and not entries(t["code"])


def test_unknown_collection_status_never_refunds_or_pays(c):
    t = send(c, pay_phone="0961116666")
    assert t["status"] == "collecting" and t["verify_needed"] is True
    for _ in range(3):
        r = c.get(f"{M}/transfers/{t['code']}?refresh=true").json()
        assert r["status"] == "collecting" and r["verify_needed"] is True
    assert not ops(t["code"], "refund") and not ops(t["code"], "payout") and not entries(t["code"])
    assert len(ops(t["code"], "collect")) == 1                                                      # pas de seconde collecte
    r = c.post(f"{M}/sim/{t['code']}/completed").json()                                           # le fournisseur finit par confirmer
    assert r["status"] == "under_review" and r["verify_needed"] is False


@auto
def test_unknown_payout_status_is_never_retried_or_refunded(c):
    t = send(c, ben_phone="+243 81 230 8888")
    assert t["status"] == "payout_pending" and t["verify_needed"] is True
    for _ in range(3):
        flow_t = c.get(f"{M}/transfers/{t['code']}?refresh=true").json()
        assert flow_t["status"] == "payout_pending"
    assert len(ops(t["code"], "payout")) == 1 and not ops(t["code"], "refund")
    assert "REV_FRAIS_ZMW" not in acc(t["code"])                                                    # aucun produit reconnu tant que le versement n'est pas confirmé
    r = c.post(f"{M}/sim/{t['code']}/completed").json()
    assert r["status"] == "completed" and acc(t["code"])["REV_FRAIS_ZMW"] == -1500


@auto
def test_pending_payout_failure_confirmed_later_refunds(c):
    t = send(c, ben_phone="+243 81 230 7777")
    assert t["status"] == "payout_pending" and t["stage"] == "payout_in_progress"
    r = c.post(f"{M}/sim/{t['code']}/failed").json()
    assert r["status"] == "refunded" and len(ops(t["code"], "refund")) == 1


# ------------------------------------------------------------------ webhooks
def hook(c, op_id, kind_key="depositId", status="COMPLETED", sig=None, secret="test-secret-not-real"):
    raw = json.dumps({kind_key: op_id, "status": status}).encode()
    return c.post(f"{M}/webhooks/provider", content=raw, headers={"x-hcompany-signature": sig if sig is not None else sign(secret, raw), "content-type": "application/json"})


def test_webhook_signature_replay_and_never_trust_body(c):
    t = send(c, pay_phone="0961115555")
    op = ops(t["code"], "collect")[0]
    assert hook(c, op.id, sig="deadbeef").status_code == 401                                        # signature invalide
    assert hook(c, op.id, secret="autre-secret").status_code == 401
    assert c.post(f"{M}/webhooks/provider", content=b"{}", headers={"content-type": "application/json"}).status_code == 401  # pas de signature
    r = hook(c, op.id)                                                                              # signature OK mais le fournisseur ne confirme pas : rien n'est appliqué
    assert r.status_code == 200 and r.json()["status"] == "pending" and tr(t["code"]).status == "collecting" and not entries(t["code"])
    with Session(engine) as s:
        o = s.get(MoneyProviderOp, op.id); o.sim_status = "completed"; s.add(o); s.commit()         # l'opérateur confirme réellement
    assert hook(c, op.id, status="SUCCESS-BIS").status_code == 200 and tr(t["code"]).status == "under_review"
    n = len(entries(t["code"]))
    assert hook(c, op.id, status="SUCCESS-BIS").json().get("duplicate") is True                      # rejeu du même événement
    assert hook(c, op.id, status="COMPLETED").status_code == 200                                    # autre libellé : rejoué sans double effet
    assert len(entries(t["code"])) == n and len(ops(t["code"], "collect")) == 1
    assert hook(c, "inconnu-xyz").json().get("ignored")
    assert c.post(f"{M}/webhooks/provider", content=b"pas du json", headers={"x-hcompany-signature": "x"}).status_code == 422


# ------------------------------------------------------------------ idempotence
def test_idempotency_replay_conflict_and_missing_key(c):
    q = c.post(f"{M}/quotes", json=Q).json()
    body = {"from_country": "ZM", "to_country": "CD", "amount": 500, "beneficiary_name": "Maman", "beneficiary_phone": "+243 81 234 5678", "beneficiary_operator": "orange",
            "pay_phone": "0961112233", "pay_operator": "mtn", "quote_id": q["quote_id"]}
    k = uuid.uuid4().hex
    a = c.post(f"{M}/transfers", json=body, headers={"Idempotency-Key": k})
    b = c.post(f"{M}/transfers", json=body, headers={"Idempotency-Key": k})                           # double clic / nouvel essai réseau
    assert a.status_code == 201 and b.status_code == 201 and a.json()["code"] == b.json()["code"]
    with Session(engine) as s:
        assert len(s.exec(select(MoneyTransfer).where(MoneyTransfer.quote_id == q["quote_id"])).all()) == 1
    assert c.post(f"{M}/transfers", json={**body, "beneficiary_name": "Autre"}, headers={"Idempotency-Key": k}).status_code == 422
    assert c.post(f"{M}/transfers", json=body).status_code == 400                                     # clé obligatoire
    assert c.post(f"{M}/transfers", json=body, headers={"Idempotency-Key": "court"}).status_code == 400


def test_parallel_identical_requests_create_one_transfer(c):
    q = c.post(f"{M}/quotes", json=Q).json()
    body = {"from_country": "ZM", "to_country": "CD", "amount": 500, "beneficiary_name": "Maman", "beneficiary_phone": "+243 81 234 5678", "beneficiary_operator": "orange",
            "pay_phone": "0961112233", "pay_operator": "mtn", "quote_id": q["quote_id"]}
    k, codes, statuses = uuid.uuid4().hex, [], []
    barrier = threading.Barrier(6)

    def go():
        barrier.wait(10)
        r = c.post(f"{M}/transfers", json=body, headers={"Idempotency-Key": k})
        statuses.append(r.status_code)
        if r.status_code == 201:
            codes.append(r.json()["code"])
    ts = [threading.Thread(target=go) for _ in range(6)]
    [x.start() for x in ts]; [x.join(30) for x in ts]
    with Session(engine) as s:
        assert len(s.exec(select(MoneyTransfer).where(MoneyTransfer.quote_id == q["quote_id"])).all()) == 1   # UNE seule opération, UNE seule collecte
    assert set(codes) <= {codes[0]} and statuses.count(201) >= 1 and all(x in (201, 409) for x in statuses), statuses


# ------------------------------------------------------------------ concurrence sur la machine d'états
def test_concurrent_approvals_pay_exactly_once(c):
    t = send(c)
    results = []
    barrier = threading.Barrier(8)

    def go():
        with Session(engine) as s:
            barrier.wait(10)
            try:
                flow.decide_review(s, s.exec(select(MoneyTransfer).where(MoneyTransfer.code == t["code"])).one(), True)
                results.append("ok")
            except Exception as e:  # noqa: BLE001
                results.append(type(e).__name__)
    ts = [threading.Thread(target=go) for _ in range(8)]
    [x.start() for x in ts]; [x.join(30) for x in ts]
    assert len(ops(t["code"], "payout")) == 1                                                       # un seul versement chez le fournisseur
    assert len([e for e in entries(t["code"]) if e.account == "REV_FRAIS_ZMW"]) == 1                # un seul journal J2
    assert tr(t["code"]).status == "completed"


def test_concurrent_webhook_and_poll_apply_once(c):
    t = send(c, pay_phone="0961115555")
    op = ops(t["code"], "collect")[0]
    with Session(engine) as s:
        o = s.get(MoneyProviderOp, op.id); o.sim_status = "completed"; s.add(o); s.commit()
    barrier = threading.Barrier(6)

    def go(i):
        barrier.wait(10)
        if i % 2:
            hook(c, op.id, status=f"S{i}")
        else:
            with Session(engine) as s:
                flow.sync_transfer(s, s.exec(select(MoneyTransfer).where(MoneyTransfer.code == t["code"])).one())
    ts = [threading.Thread(target=go, args=(i,)) for i in range(6)]
    [x.start() for x in ts]; [x.join(30) for x in ts]
    assert tr(t["code"]).status == "under_review"
    assert len([e for e in entries(t["code"]) if e.account == "DUE_ZMW"]) == 1 and len(ops(t["code"], "collect")) == 1


# ------------------------------------------------------------------ réserves
def test_reserve_enforcement_pause_and_topup(c, monkeypatch):
    monkeypatch.setattr(flow, "reserves_enforced", lambda: True)
    with Session(engine) as s:
        base = ledger.available(s, "USD")
        j1_before = len(s.exec(select(LedgerEntry).where(LedgerEntry.account == "PRV_USD", LedgerEntry.kind == "J1")).all())
    q = c.post(f"{M}/quotes", json=Q).json()
    body = {"from_country": "ZM", "to_country": "CD", "amount": 500, "beneficiary_name": "Maman", "beneficiary_phone": "+243 81 234 5678", "beneficiary_operator": "orange",
            "pay_phone": "0961112233", "pay_operator": "mtn", "quote_id": q["quote_id"]}
    r = c.post(f"{M}/transfers", json=body, headers={"Idempotency-Key": uuid.uuid4().hex})
    assert r.status_code == 503 and base < ledger.hold_needed(1970, 0)                              # aucune réserve en USD : on n'encaisse pas
    with Session(engine) as s:
        assert len(s.exec(select(LedgerEntry).where(LedgerEntry.account == "PRV_USD", LedgerEntry.kind == "J1")).all()) == j1_before
        ledger.post_reserve(s, "USD", 1_000_000_00, 1, "apport de test"); s.commit()
        assert ledger.available(s, "USD") == base + 1_000_000_00
    q2 = c.post(f"{M}/quotes", json=Q).json()
    r = c.post(f"{M}/transfers", json={**body, "quote_id": q2["quote_id"]}, headers={"Idempotency-Key": uuid.uuid4().hex})
    assert r.status_code == 201, r.text
    with Session(engine) as s:  # la réserve du versement est bloquée tant qu'il n'est pas fait : 19,70 + 5 % = 20,69
        assert ledger.active_holds(s, "USD") >= ledger.hold_needed(1970, 0) >= 2069


def test_hold_includes_cost_and_safety_margin():
    assert ledger.hold_needed(1970, 43) == 1970 + 43 + 99                                          # 5 % de 19,70 = 0,985 → 0,99


def test_unbalanced_journal_is_refused():
    with Session(engine) as s:
        with pytest.raises(ledger.LedgerError):
            ledger._post(s, "X:BAD", "TEST", "", [("PRV_ZMW", "ZMW", 100, 0, ""), ("DUE_ZMW", "ZMW", 0, 99, "")])
        s.rollback()


def test_ledger_stays_balanced_and_replay_safe():
    with Session(engine) as s:
        tb = ledger.trial_balance(s)
        assert tb["balanced"] and tb["totals"]["ZMW"]["debit"] == tb["totals"]["ZMW"]["credit"]
        t = s.exec(select(MoneyTransfer).where(MoneyTransfer.status == "completed")).first()
        n = len(s.exec(select(LedgerEntry)).all())
        assert ledger.post_collection(s, t) is False  # J1 rejoué : ignoré, aucune écriture en double
        s.rollback()
        assert len(s.exec(select(LedgerEntry)).all()) == n


def test_admin_ledger_and_reserve_endpoints(c):
    from app.admin_security import require_admin_confirmed
    with Session(engine) as s:
        a = User(email="adm@fl.test", full_name="Adm", role=UserRole.admin, is_verified=True)
        s.add(a); s.commit(); s.refresh(a); aid = a.id
    app.dependency_overrides[require_admin_confirmed] = lambda: Session(engine).get(User, aid)
    try:
        led = c.get(f"{M}/admin/ledger").json()
        assert led["balanced"] is True and set(led["reserves"]) == {"ZMW", "USD"}
        before = led["reserves"]["USD"]["available"]
        r = c.post(f"{M}/admin/reserves", json={"currency": "USD", "amount": 50, "memo": "apport"}).json()
        assert r["reserves"]["USD"]["available"] == before + 5000 and r["balanced"] is True
        assert c.post(f"{M}/admin/reserves", json={"currency": "USD", "amount": -1e9}).status_code == 422       # pas de retrait au-delà du disponible
        assert c.put(f"{M}/admin/reserves/floor", json={"currency": "USD", "floor": 25}).json()["reserves"]["USD"]["floor"] == 2500
        c.put(f"{M}/admin/reserves/floor", json={"currency": "USD", "floor": 0})
        t = send(c, pay_phone="0961116666")
        assert any(i["code"] == t["code"] for i in c.get(f"{M}/admin/to-verify").json()["items"])
        assert c.post(f"{M}/admin/reconcile").json()["checked"] >= 1
    finally:
        app.dependency_overrides.pop(require_admin_confirmed, None)


@auto
def test_request_creator_notified_only_after_confirmation(c):
    """Demande de type A : le créateur est notifié quand le paiement est CONFIRMÉ, puis quand l'argent est effectivement versé — jamais avant."""
    from app.models import Notification
    with Session(engine) as s:
        other = User(email="creator@fl.test", full_name="Creator", role=UserRole.client, is_verified=True)
        s.add(other); s.commit(); s.refresh(other); cid = other.id
    me = c.app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: Session(engine).get(User, cid)
    r = c.post(f"{M}/requests", json={"payer_country": "ZM", "receiver_country": "CD", "request_type": "A", "amount": 30, "receive_phone": "0812345678", "receive_operator": "orange"}).json()
    app.dependency_overrides[get_current_user] = me
    q = c.post(f"{M}/requests/{r['code']}/quote", json={"pay_operator": "mtn"}).json()
    out = c.post(f"{M}/requests/{r['code']}/pay", json={"pay_phone": "0961115555", "pay_operator": "mtn", "quote_id": q["quote_id"]}, headers={"Idempotency-Key": uuid.uuid4().hex}).json()
    assert out["status"] == "collecting"

    def notes():
        with Session(engine) as s:
            return [n.title for n in s.exec(select(Notification).where(Notification.user_id == cid)).all()]
    assert notes() == []                                                                            # rien tant que le fournisseur n'a pas confirmé
    st = c.post(f"{M}/sim/{r['code']}/completed").json()
    assert st["status"] == "completed", st
    assert notes() == ["Paiement confirmé", "Argent reçu"]                                          # confirmation puis versement (contrôle manuel désactivé)
    assert ops(r["code"], "payout")[0].amount_minor == 3000                                         # exactement 30,00 USD
