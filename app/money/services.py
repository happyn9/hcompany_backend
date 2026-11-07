import math
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.crossborder import services as geo
from app.crossborder.models import Country
from app.money import pricing as P
from app.money.models import MoneyRate, MoneySettings, MoneyTransfer

# Valeurs de départ À VALIDER (frais, plafonds) — exprimées en USD.
FEE_PCT = 3.0
TARGET_MARGIN_PCT = 1.0
MIN_FEE_USD = 0.5
MIN_USD = 2.0
MAX_USD = 1000.0
DAILY_MAX_USD = 2000.0
REQUEST_TTL_DAYS = 7
CORRIDOR = {"ZM", "CD"}
OPERATORS = {
    "ZM": {"mtn": "MTN MoMo", "airtel": "Airtel Money", "zamtel": "Zamtel Kwacha"},
    "CD": {"airtel": "Airtel Money", "orange": "Orange Money"},
}


DIAL = {"ZM": "260", "CD": "243"}


def normalize_phone(raw: str, country: str) -> str:
    """Numéro mobile du pays `country` au format international sans « + » (ex. 260961112233).
    Accepte : +260 96 111 2233, 00260…, 260961112233, 0961112233, 961112233. Refuse l'indicatif d'un autre pays."""
    country = country.upper()
    dial = DIAL[country]
    raw = (raw or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    intl = raw.startswith("+") or digits.startswith("00")
    if digits.startswith("00"):
        digits = digits[2:]
    other = next(d for k, d in DIAL.items() if k != country)
    if intl or (len(digits) == 12 and digits.startswith((dial, other))):
        if digits.startswith(other):
            raise HTTPException(status_code=422, detail=f"Ce numéro a l'indicatif +{other} : un numéro {country} commence par +{dial}.")
        if not digits.startswith(dial):
            raise HTTPException(status_code=422, detail=f"Indicatif non pris en charge : un numéro {country} commence par +{dial}.")
        national = digits[len(dial):]
    elif digits.startswith("0"):
        national = digits[1:]
    else:
        national = digits
    if len(national) != 9 or national[0] == "0":
        raise HTTPException(status_code=422, detail=f"Numéro invalide : +{dial} suivi de 9 chiffres attendu.")
    return dial + national


def new_code() -> str:
    return "HM-" + secrets.token_hex(4).upper()


def check_corridor(frm: str, to: str, domestic: bool = False) -> None:
    frm, to = frm.upper(), to.upper()
    if (frm == to and not domestic) or frm not in CORRIDOR or to not in CORRIDOR:
        raise HTTPException(status_code=422, detail="Pour l'instant : entre la Zambie et la RD Congo.")


def check_operator(session: Session, country: str, operator: str, direction: str) -> None:
    """direction : « in » (le payeur paie avec cet opérateur) ou « out » (le bénéficiaire reçoit chez cet opérateur)."""
    fee = P.get_fee(session, country, operator, direction) if country.upper() in OPERATORS else None
    if fee is None or operator not in OPERATORS[country.upper()]:
        raise HTTPException(status_code=422, detail="Opérateur non pris en charge dans ce pays.")
    if not fee.enabled:
        raise HTTPException(status_code=422, detail=f"{OPERATORS[country.upper()][operator]} n'est pas disponible pour {'payer' if direction == 'in' else 'recevoir'} dans ce pays.")


def _usd(session: Session, amount: float, currency: str) -> float:
    return geo.convert(session, amount, currency, "USD", with_margin=False)


def _currency(session: Session, country: str) -> str:
    c = session.get(Country, country.upper())
    if c is None:
        geo.ensure_seed(session)
        c = session.get(Country, country.upper())
    return c.currency


def get_settings(session: Session) -> dict:
    """Frais et plafonds en vigueur : ligne réglée dans l'admin, sinon valeurs par défaut."""
    r = session.get(MoneySettings, 1)
    if r is None:
        return {"fee_pct": FEE_PCT, "target_margin_pct": TARGET_MARGIN_PCT, "min_fee_usd": MIN_FEE_USD, "min_usd": MIN_USD, "max_usd": MAX_USD, "daily_max_usd": DAILY_MAX_USD}
    return {"fee_pct": r.fee_pct, "target_margin_pct": r.target_margin_pct, "min_fee_usd": r.min_fee_usd, "min_usd": r.min_usd, "max_usd": r.max_usd, "daily_max_usd": r.daily_max_usd}


def _fee(session: Session, amount: float, currency: str) -> float:
    cfg = get_settings(session)
    min_fee = geo.convert(session, cfg["min_fee_usd"], "USD", currency, with_margin=False)
    return geo.round_nice(max(amount * cfg["fee_pct"] / 100, min_fee), currency)


def _check_limits(session: Session, amount: float, currency: str) -> None:
    usd, cfg = _usd(session, amount, currency), get_settings(session)
    if usd < cfg["min_usd"]:
        raise HTTPException(status_code=422, detail=f"Montant minimum : l'équivalent de {cfg['min_usd']:g} USD.")
    if usd > cfg["max_usd"]:
        raise HTTPException(status_code=422, detail=f"Montant maximum par opération : l'équivalent de {cfg['max_usd']:g} USD.")


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


def _provider_cost(session: Session, frm: str, to: str, pay_op: str, ben_op: str, paid: float, receive: float, cur_from: str, cur_to: str) -> float:
    """Ce que l'agrégateur nous coûte pour cette opération, dans la devise du payeur : encaissement chez lui + versement chez le bénéficiaire."""
    fin, fout = P.get_fee(session, frm, pay_op, "in"), P.get_fee(session, to, ben_op, "out")
    cost = P.cost_local(fin, paid) if fin else 0.0
    out = P.cost_local(fout, receive) if fout else 0.0
    return cost + (out if cur_to == cur_from else geo.convert(session, out, cur_to, cur_from, with_margin=False))


def _receive_for(session: Session, frm: str, to: str, send: float, cur_from: str, cur_to: str) -> float:
    custom = override_rate(session, frm, to, "send") if cur_from != cur_to else None
    if custom:  # taux d'envoi fixé par l'admin / l'agent : arrondi vers le bas, le bénéficiaire ne reçoit jamais plus que calculé
        receive = math.floor(send * custom * 100) / 100
    else:
        margin = geo.rate_of(session, cur_to).margin_pct
        raw = geo.convert(session, send, cur_from, cur_to, with_margin=False)
        receive = geo.round_nice(raw * (1 - margin / 100), cur_to) if cur_from != cur_to else send
    if cur_to == "CDF":
        receive = float(math.floor(receive / 50) * 50)
    return receive


def quote_send(session: Session, frm: str, to: str, amount: float, with_fee: bool = True, pay_op: str = "", ben_op: str = "") -> dict:
    """Le payeur saisit `amount` (dans sa devise).
    with_fee=True : les frais s'ajoutent (il paie amount + frais, le bénéficiaire reçoit la conversion de `amount`).
    with_fee=False : les frais sont retirés de `amount` (il paie exactement `amount`, le bénéficiaire reçoit la conversion de amount − frais).
    Les frais couvrent TOUJOURS le coût de l'agrégateur pour les opérateurs choisis + la marge nette cible (réglages admin)."""
    check_corridor(frm, to)
    cur_from, cur_to = _currency(session, frm), _currency(session, to)
    _check_limits(session, amount, cur_from)
    pay_op, ben_op = pay_op or P.default_operator(session, frm, "in"), ben_op or P.default_operator(session, to, "out")
    base, target = _fee(session, amount, cur_from), get_settings(session)["target_margin_pct"]
    fee, cost = base, 0.0
    for _ in range(6):  # le coût dépend du montant payé, qui dépend des frais : on itère jusqu'à stabilité
        send = amount if with_fee else round(amount - fee, 2)
        if send <= 0:
            raise HTTPException(status_code=422, detail="Le montant est trop petit pour couvrir les frais.")
        receive = _receive_for(session, frm, to, send, cur_from, cur_to)
        paid = round(send + fee, 2) if with_fee else round(amount, 2)
        cost = _provider_cost(session, frm, to, pay_op, ben_op, paid, receive, cur_from, cur_to)
        new = P.round_up(max(base, cost + send * target / 100), cur_from)
        if new == fee:
            break
        fee = new
    return {"from_country": frm.upper(), "to_country": to.upper(), "send_currency": cur_from, "send_amount": round(send, 2), "fee": fee,
            "total_paid": paid, "fee_mode": "added" if with_fee else "deducted", "pay_operator": pay_op, "receive_operator": ben_op,
            "receive_currency": cur_to, "receive_amount": receive, "rate": round(receive / send, 6) if send else 0, "provider_cost": round(cost, 2)}


def quote_receive(session: Session, payer_country: str, receiver_country: str, receive_amount: float, pay_op: str = "", ben_op: str = "", domestic: bool = False) -> dict:
    """Pour une DEMANDE : le demandeur doit recevoir exactement `receive_amount` ; on calcule ce que le payeur débourse."""
    check_corridor(payer_country, receiver_country, domestic)
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
    pay_op, ben_op = pay_op or P.default_operator(session, payer_country, "in"), ben_op or P.default_operator(session, receiver_country, "out")
    base, target = _fee(session, send, cur_pay), get_settings(session)["target_margin_pct"]
    fee, cost = base, 0.0
    for _ in range(6):
        cost = _provider_cost(session, payer_country, receiver_country, pay_op, ben_op, send + fee, receive_amount, cur_pay, cur_recv)
        new = P.round_up(max(base, cost + send * target / 100), cur_pay)
        if new == fee:
            break
        fee = new
    return {"from_country": payer_country.upper(), "to_country": receiver_country.upper(), "send_currency": cur_pay, "send_amount": round(send, 2), "fee": fee,
            "total_paid": round(send + fee, 2), "receive_currency": cur_recv, "receive_amount": round(receive_amount, 2), "pay_operator": pay_op,
            "receive_operator": ben_op, "rate": round(receive_amount / send, 6) if send else 0, "provider_cost": round(cost, 2)}


def check_daily(session: Session, user_id: int, amount_usd: float) -> None:
    since = datetime.utcnow() - timedelta(days=1)
    rows = session.exec(select(MoneyTransfer).where(MoneyTransfer.payer_user_id == user_id, MoneyTransfer.created_at >= since,
                                                    MoneyTransfer.status.in_(["collected", "under_review", "completed"]))).all()
    spent = sum(_usd(session, r.send_amount, r.send_currency) for r in rows)
    if spent + amount_usd > get_settings(session)["daily_max_usd"]:
        raise HTTPException(status_code=429, detail="Plafond journalier atteint. Réessayez demain.")


def usd_of(session: Session, amount: float, currency: str) -> float:
    return _usd(session, amount, currency)


CHANGE_CURRENCIES = ("USD", "ZMW")


def currency_of(session: Session, country: str) -> str:
    return _currency(session, country)


def change_quote(session: Session, amount: float, source: str, target: str) -> dict:
    """Devis de change : taux du marché moins la marge H-Money de la devise reçue (le dollar n'a pas de marge)."""
    s, t = source.upper(), target.upper()
    if s not in CHANGE_CURRENCIES or t not in CHANGE_CURRENCIES or s == t or "USD" not in (s, t):
        raise HTTPException(status_code=422, detail="Le change se fait entre le dollar (USD) et le kwacha (ZMW).")
    rs = geo.rate_of(session, s) if s != "USD" else None
    rt = geo.rate_of(session, t) if t != "USD" else None
    per_s, per_t = (rs.per_usd if rs else 1.0), (rt.per_usd if rt else 1.0)
    margin = rt.margin_pct if rt else 0.0
    mid = per_t / per_s
    rate = mid * (1 - margin / 100)
    out = geo.round_nice(amount * rate, t) if t != "USD" else round(amount * rate, 2)
    return {"from": s, "to": t, "amount": round(amount, 2), "mid_rate": round(mid, 6), "rate": round(rate, 6), "margin_pct": margin, "receive": out, "usd_value": round(amount / per_s, 2)}
