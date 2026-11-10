"""Étape 2 : tests de régression des 4 anomalies financières + invariants du moteur Decimal (aucune base requise sauf le test du plafond)."""
import os
import random
import tempfile
import threading
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'eng.db')}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402

from app.money import engine as E  # noqa: E402

P = E.Params(M=D("25"))
C = D("0.01")


# ---- Anomalie 1 : le montant reçu est arrondi vers le BAS ------------------------------------------------
def test_received_amount_rounds_down():
    q = E.quote_added(P, "zc", D("500"))
    assert q["R"] == D("19.70") and D("500") / q["K"] > q["R"]          # 19,7044… → 19,70 (jamais 19,71)
    q = E.quote_added(P, "cz", D("100"))                                # 100 × 24,625 = 2462,50 exact
    assert q["R"] == D("2462.50")
    q = E.quote_added(P, "cz", D("10.01"))                              # 246.50125 → 246.50
    assert q["R"] == D("246.49")
    # ex-comportement : à partir de 100 le reçu était arrondi à l'entier SUPÉRIEUR (round_nice) : 2462,99 devenait 2463
    assert E.quote_added(P, "cz", D("100.01"))["R"] == D("2462.74")
    assert E.quote_added(P, "cz", D("100.02"))["R"] <= D("100.02") * P.K("cz")


def test_received_never_exceeds_exact_conversion_random():
    rng = random.Random(1)
    for _ in range(3000):
        d = rng.choice(E.DIRECTIONS)
        S = (D(rng.randint(5000, 2_000_000 if d == "zc" else 100_000)) * C)
        try:
            q = E.quote_added(P, d, S)
        except E.EngineError:
            continue
        exact = S / q["K"] if d == "zc" else S * q["K"]
        assert q["R"] <= exact and exact - q["R"] < C


# ---- Anomalie 2 : frais déduits sans écart d'un centime -----------------------------------------------------
def test_deducted_fee_exact_total():
    rng = random.Random(2)
    n = 0
    for _ in range(4000):
        d = rng.choice(E.DIRECTIONS)
        T = D(rng.randint(5000, 1_500_000 if d == "zc" else 90_000)) * C
        try:
            q = E.quote_deducted(P, d, T)
        except E.EngineError:
            continue
        n += 1
        assert q["S"] + q["F"] == T == q["T"]                                   # le total payé est exactement T
        fee_ = E.fee(P, d, q["S"])
        assert fee_ <= q["F"] <= fee_ + C                                     # F = frais exacts, plus au plus 0,01 d'écart
        assert q["S"] + C + E.fee(P, d, q["S"] + C) > T                       # S est maximal : on ne retire jamais trop de frais
    assert n > 3000


def test_deducted_known_values():
    q = E.quote_deducted(P, "zc", D("500"))
    assert (q["S"], q["F"], q["T"]) == (D("485.43"), D("14.57"), D("500"))      # 485,43 + ⌈14,5629⌉... ≤ 500 ; l'ancien code donnait un centime d'écart
    q = E.quote_deducted(P, "zc", D("60"))                                      # sous le seuil du minimum : S = T − F_min
    assert (q["S"], q["F"]) == (D("50"), D("10"))
    with pytest.raises(E.EngineError):
        E.quote_deducted(P, "zc", D("10"))


# ---- Anomalie 3 : marge FX dans les DEUX sens (Zambie → RDC incluse) ------------------------------------------
def test_fx_margin_in_both_directions():
    assert P.K("zc") == D("25.3750") and P.K("cz") == D("24.6250")
    assert P.K("cz") <= P.M <= P.K("zc")
    zc = E.quote_added(P, "zc", D("1000"))
    assert zc["R"] < D("1000") / P.M                                            # avant : 40,00 (aucune marge) ; maintenant 39,40
    cz = E.quote_added(P, "cz", D("100"))
    assert cz["R"] < D("100") * P.M
    # aller-retour sans frais jamais gagnant
    back = E.floor_to(zc["R"] * P.K("cz"))
    assert back < D("1000")


def test_fx_margin_zero_gives_market_rate():
    p0 = E.Params(M=D("25"), m_zc=D(0), m_cz=D(0))
    assert p0.K("zc") == p0.K("cz") == D("25")


# ---- Types de demande ------------------------------------------------------------------------------------------
def test_request_type_a_exact_receive_and_fees_on_top():
    q = E.quote_request(P, "cz", "A", D("250"))                                 # le bénéficiaire reçoit EXACTEMENT 250 ZMW
    assert q["R"] == D("250") and q["S"] == D("10.16") and q["T"] == q["S"] + q["F"]
    assert q["S"] * q["K"] >= D("250")
    q = E.quote_request(P, "zc", "A", D("100"))                                 # 100 USD exactement ; payeur : ⌈100 × 25,375⌉ + frais
    assert q["R"] == D("100") and q["S"] == D("2537.50") and q["F"] == D("76.13") and q["T"] == D("2613.63")


def test_request_type_b_exact_payer_amount():
    q = E.quote_request(P, "cz", "B", D("100"))
    assert q["S"] == D("100") and q["R"] == D("2462.50") and q["T"] == q["S"] + q["F"]
    with pytest.raises(E.EngineError):
        E.quote_request(P, "cz", "C", D("1"))


def test_limits_and_minor_units():
    with pytest.raises(E.EngineError):
        E.quote_added(P, "zc", D("10"))                                          # < 2 USD
    with pytest.raises(E.EngineError):
        E.quote_added(P, "cz", D("5000"))                                        # > 1000 USD
    assert E.to_minor(D("12.34")) == 1234 and E.from_minor(1234) == D("12.34")
    with pytest.raises(E.EngineError):
        E.to_minor(D("1.001"))
    assert E.d(0.1) + E.d(0.2) == D("0.3")                                       # pas de bruit binaire


# ---- Anomalie 4 : plafond journalier sous requêtes parallèles ------------------------------------------------------
def test_daily_cap_holds_under_parallel_requests():
    from sqlmodel import SQLModel, Session
    from fastapi import HTTPException
    from app.database import engine
    from app.models import User, UserRole
    from app.money import services as svc
    from app.money.models import MoneyTransfer
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        u = User(email="cap@eng.test", full_name="Cap", role=UserRole.client, is_verified=True)
        s.add(u); s.commit(); s.refresh(u); uid = u.id
    with Session(engine) as s0:
        svc.market_mid(s0); cap = svc.get_settings(s0)["daily_max_usd"]  # graine des taux faite avant les threads ; 2000 USD
    per = 600.0                                                          # 600 USD × 10 requêtes : au plus 3 passent (3 × 600 ≤ 2000 < 4 × 600)
    ok, refused, errors = [], [], []
    barrier = threading.Barrier(10)

    def attempt(i):
        try:
            with Session(engine) as s:
                barrier.wait(timeout=10)
                with svc.daily_guard(s, uid):
                    try:
                        svc.check_daily(s, uid, per)
                    except HTTPException as e:
                        refused.append(e.status_code); return
                    s.add(MoneyTransfer(code=f"HM-CAP{i}", kind="send", user_id=uid, payer_user_id=uid, from_country="CD", to_country="ZM", send_currency="USD",
                                        send_amount=per, receive_currency="ZMW", status="created"))
                    s.commit(); ok.append(i)
        except Exception as e:  # noqa: BLE001
            errors.append(repr(e))
    ts = [threading.Thread(target=attempt, args=(i,)) for i in range(10)]
    [t.start() for t in ts]; [t.join(30) for t in ts]
    assert not errors, errors
    assert len(ok) == 3 and refused == [429] * 7 and len(ok) * per <= cap
