import math
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.crossborder import services as geo
from app.crossborder.models import Country
from app.money.models import MoneyRate, MoneyTransfer

# Valeurs de départ À VALIDER (frais, plafonds) — exprimées en USD.
FEE_PCT = 3.0
MIN_FEE_USD = 0.5
MIN_USD = 2.0
MAX_USD = 1000.0
DAILY_MAX_USD = 2000.0
REQUEST_TTL_DAYS = 7
CORRIDOR = {"ZM", "CD"}
OPERATORS = {
    "ZM": {"mtn": "MTN MoMo", "airtel": "Airtel Money", "zamtel": "Zamtel Kwacha"},
    "CD": {"mpesa": "M-Pesa", "airtel": "Airtel Money", "orange": "Orange Money", "africell": "Africell Money"},
}


def new_code() -> str:
    return "HM-" + secrets.token_hex(4).upper()


def check_corridor(frm: str, to: str) -> None:
    frm, to = frm.upper(), to.upper()
    if frm == to or frm not in CORRIDOR or to not in CORRIDOR:
        raise HTTPException(status_code=422, detail="Pour l'instant : entre la Zambie et la RD Congo.")


def check_operator(country: str, operator: str) -> None:
    if operator not in OPERATORS[country.upper()]:
        raise HTTPException(status_code=422, detail="Opérateur non pris en charge dans ce pays.")


def _usd(session: Session, amount: float, currency: str) -> float:
    return geo.convert(session, amount, currency, "USD", with_margin=False)


def _currency(session: Session, country: str) -> str:
    c = session.get(Country, country.upper())
    if c is None:
        geo.ensure_seed(session)
        c = session.get(Country, country.upper())
    return c.currency


def _fee(session: Session, amount: float, currency: str) -> float:
    min_fee = geo.convert(session, MIN_FEE_USD, "USD", currency, with_margin=False)
    return geo.round_nice(max(amount * FEE_PCT / 100, min_fee), currency)


def _check_limits(session: Session, amount: float, currency: str) -> None:
    usd = _usd(session, amount, currency)
    if usd < MIN_USD:
        raise HTTPException(status_code=422, detail=f"Montant minimum : l'équivalent de {MIN_USD:g} USD.")
    if usd > MAX_USD:
        raise HTTPException(status_code=422, detail=f"Montant maximum par opération : l'équivalent de {MAX_USD:g} USD.")


def market_rate(session: Session, frm: str, to: str) -> float:
    """Taux du marché pour 1 unité payée (marge de la devise reçue déduite). Sert de référence et de valeur par défaut."""
    cur_from, cur_to = _currency(session, frm), _currency(session, to)
    if cur_from == cur_to:
        return 1.0
    rf, rt = geo.rate_of(session, cur_from), geo.rate_of(session, cur_to)
    return rt.per_usd / rf.per_usd * (1 - rt.margin_pct / 100)


def override_rate(session: Session, frm: str, to: str, kind: str):
    row = session.get(MoneyRate, (frm.upper(), to.upper()))
    v = (row.send_rate if kind == "send" else row.withdraw_rate) if row else None
    return v if v and v > 0 else None


def corridor_rates(session: Session) -> dict:
    out = {}
    for a, b in (("ZM", "CD"), ("CD", "ZM")):
        m = market_rate(session, a, b)
        out[f"{a}>{b}"] = {"market": m, "send": override_rate(session, a, b, "send") or m, "withdraw": override_rate(session, a, b, "withdraw") or m,
                           "send_custom": override_rate(session, a, b, "send") is not None, "withdraw_custom": override_rate(session, a, b, "withdraw") is not None,
                           "send_currency": _currency(session, a), "receive_currency": _currency(session, b)}
    return out


def quote_send(session: Session, frm: str, to: str, amount: float, with_fee: bool = True) -> dict:
    """Le payeur saisit `amount` (dans sa devise).
    with_fee=True : les frais s'ajoutent (il paie amount + frais, le bénéficiaire reçoit la conversion de `amount`).
    with_fee=False : les frais sont retirés de `amount` (il paie exactement `amount`, le bénéficiaire reçoit la conversion de amount − frais)."""
    check_corridor(frm, to)
    cur_from, cur_to = _currency(session, frm), _currency(session, to)
    _check_limits(session, amount, cur_from)
    fee = _fee(session, amount, cur_from)
    entered = amount
    if not with_fee:
        amount = round(amount - fee, 2)
        if amount <= 0:
            raise HTTPException(status_code=422, detail="Le montant est trop petit pour couvrir les frais.")
    custom = override_rate(session, frm, to, "send") if cur_from != cur_to else None
    if custom:  # taux d'envoi fixé par l'admin / l'agent : arrondi vers le bas, le bénéficiaire ne reçoit jamais plus que calculé
        receive = math.floor(amount * custom * 100) / 100
    else:
        margin = geo.rate_of(session, cur_to).margin_pct
        raw = geo.convert(session, amount, cur_from, cur_to, with_margin=False)
        receive = geo.round_nice(raw * (1 - margin / 100), cur_to) if cur_from != cur_to else amount
    if cur_to == "CDF":
        receive = float(math.floor(receive / 50) * 50)  # jamais plus que ce qui est calculé
    return {"from_country": frm.upper(), "to_country": to.upper(), "send_currency": cur_from, "send_amount": round(amount, 2), "fee": fee,
            "total_paid": round(amount + fee, 2) if with_fee else round(entered, 2), "fee_mode": "added" if with_fee else "deducted",
            "receive_currency": cur_to, "receive_amount": receive, "rate": round(receive / amount, 6) if amount else 0}


def quote_receive(session: Session, payer_country: str, receiver_country: str, receive_amount: float) -> dict:
    """Pour une DEMANDE : le demandeur doit recevoir exactement `receive_amount` ; on calcule ce que le payeur débourse."""
    check_corridor(payer_country, receiver_country)
    cur_pay, cur_recv = _currency(session, payer_country), _currency(session, receiver_country)
    _check_limits(session, receive_amount, cur_recv)
    custom = override_rate(session, payer_country, receiver_country, "withdraw") if cur_pay != cur_recv else None
    if cur_pay == cur_recv:
        send = float(receive_amount)
    elif custom:  # taux de retrait fixé : le payeur paie ce qu'il faut pour que le demandeur reçoive exactement le montant
        send = float(math.ceil(receive_amount / custom * 100) / 100)
    else:
        margin = geo.rate_of(session, cur_recv).margin_pct
        per = geo.rate_of(session, cur_recv).per_usd
        send = receive_amount * geo.rate_of(session, cur_pay).per_usd / (per * (1 - margin / 100))
        send = float(math.ceil(send * 100) / 100)
    fee = _fee(session, send, cur_pay)
    return {"from_country": payer_country.upper(), "to_country": receiver_country.upper(), "send_currency": cur_pay, "send_amount": round(send, 2), "fee": fee,
            "total_paid": round(send + fee, 2), "receive_currency": cur_recv, "receive_amount": round(receive_amount, 2),
            "rate": round(receive_amount / send, 6) if send else 0}


def check_daily(session: Session, user_id: int, amount_usd: float) -> None:
    since = datetime.utcnow() - timedelta(days=1)
    rows = session.exec(select(MoneyTransfer).where(MoneyTransfer.payer_user_id == user_id, MoneyTransfer.created_at >= since,
                                                    MoneyTransfer.status.in_(["collected", "under_review", "completed"]))).all()
    spent = sum(_usd(session, r.send_amount, r.send_currency) for r in rows)
    if spent + amount_usd > DAILY_MAX_USD:
        raise HTTPException(status_code=429, detail="Plafond journalier atteint. Réessayez demain.")


def usd_of(session: Session, amount: float, currency: str) -> float:
    return _usd(session, amount, currency)
