import json
import secrets
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from decimal import Decimal as D

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.crossborder import services as geo
from app.crossborder.models import Country
from app.money import engine as E
from app.money import pricing as P
from sqlalchemy import update
from app.money.models import MoneyQuote, MoneyRate, MoneySettings, MoneyTransfer
from app.models import User

# Valeurs de départ À VALIDER (frais, plafonds) — exprimées en USD.
FEE_PCT = 3.0
TARGET_MARGIN_PCT = 1.0
MIN_FEE_USD = 0.5
MIN_USD = 2.0
MAX_USD = 1000.0
DAILY_MAX_USD = 2000.0
# Paramètres de départ FICTIFS (à remplacer par les valeurs contractuelles / validées) :
FEE_PCT_CZ = 4.0
MARGIN_ZC_PCT = 1.5
MARGIN_CZ_PCT = 1.5
MIN_FEE_ZMW = 10.0
REQUEST_TTL_DAYS = 7
CORRIDOR = {"ZM", "CD"}
OPERATORS = {
    "ZM": {"mtn": "MTN MoMo", "airtel": "Airtel Money", "zamtel": "Zamtel Kwacha"},
    "CD": {"airtel": "Airtel Money", "orange": "Orange Money"},
}

import logging
log = logging.getLogger(__name__)


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
    """Frais, marges et plafonds en vigueur : ligne réglée dans l'admin, sinon valeurs par défaut (fictives, à valider)."""
    r = session.get(MoneySettings, 1)
    if r is None:
        return {"fee_pct": FEE_PCT, "fee_pct_cz": FEE_PCT_CZ, "margin_zc_pct": MARGIN_ZC_PCT, "margin_cz_pct": MARGIN_CZ_PCT, "min_fee_zmw": MIN_FEE_ZMW,
                "target_margin_pct": TARGET_MARGIN_PCT, "min_fee_usd": MIN_FEE_USD, "min_usd": MIN_USD, "max_usd": MAX_USD, "daily_max_usd": DAILY_MAX_USD, "review_all": True, "fictive": True}
    return {"fee_pct": r.fee_pct, "fee_pct_cz": r.fee_pct_cz, "margin_zc_pct": r.margin_zc_pct, "margin_cz_pct": r.margin_cz_pct, "min_fee_zmw": r.min_fee_zmw,
            "target_margin_pct": r.target_margin_pct, "min_fee_usd": r.min_fee_usd, "min_usd": r.min_usd, "max_usd": r.max_usd, "daily_max_usd": r.daily_max_usd, "review_all": r.review_all, "fictive": False}


def direction_of(frm: str, to: str) -> str:
    """« zc » = Zambie → RDC (payeur en ZMW), « cz » = RDC → Zambie (payeur en USD). Même pays : le sens est celui du pays du payeur."""
    return "zc" if frm.upper() == "ZM" else "cz"


def market_mid(session: Session) -> D:
    """Taux du marché : ZMW pour 1 USD (sans aucune marge)."""
    return E.d(geo.rate_of(session, "ZMW").per_usd) / E.d(geo.rate_of(session, "USD").per_usd)


def override_rate(session: Session, frm: str, to: str, kind: str):
    row = session.get(MoneyRate, (frm.upper(), to.upper()))
    v = (row.send_rate if kind == "send" else row.withdraw_rate) if row else None
    return v if v and v > 0 else None


def build_params(session: Session, frm: str = "", to: str = "", kind: str = "send") -> E.Params:
    """Paramètres du moteur. Un taux fixé par l'admin / l'agent (en unités reçues pour 1 payée) remplace le taux calculé de son sens :
    K_zc = ⌈1/taux⌉ et K_cz = ⌊taux⌋ à 4 décimales (toujours défavorable au client)."""
    cfg = get_settings(session)
    k_zc = k_cz = None
    if frm and to and frm.upper() != to.upper():
        v = override_rate(session, frm, to, kind)
        if v:
            if frm.upper() == "ZM":
                k_zc = E.ceil_to(1 / E.d(v), E.Q4)
            else:
                k_cz = E.floor_to(E.d(v), E.Q4)
    pct = lambda x: E.d(x) / 100  # noqa: E731
    return E.Params(M=market_mid(session), m_zc=pct(cfg["margin_zc_pct"]), m_cz=pct(cfg["margin_cz_pct"]), p_zc=pct(cfg["fee_pct"]), p_cz=pct(cfg["fee_pct_cz"]),
                    fmin_zc=E.d(cfg["min_fee_zmw"]), fmin_cz=E.d(cfg["min_fee_usd"]), K_zc_fixed=k_zc, K_cz_fixed=k_cz,
                    min_usd=E.d(cfg["min_usd"]), max_usd=E.d(cfg["max_usd"]))


def market_rate(session: Session, frm: str, to: str) -> float:
    """Taux client calculé du sens (unités reçues pour 1 payée), SANS taux imposé. Sert de référence à l'admin."""
    if _currency(session, frm) == _currency(session, to):
        return 1.0
    p = build_params(session)
    d = direction_of(frm, to)
    return float(1 / p.K(d)) if d == "zc" else float(p.K(d))


def corridor_rates(session: Session) -> dict:
    out = {}
    for a, b in (("ZM", "CD"), ("CD", "ZM")):
        m = market_rate(session, a, b)
        out[f"{a}>{b}"] = {"market": m, "send": override_rate(session, a, b, "send") or m, "withdraw": override_rate(session, a, b, "withdraw") or m,
                           "send_custom": override_rate(session, a, b, "send") is not None, "withdraw_custom": override_rate(session, a, b, "withdraw") is not None,
                           "send_currency": _currency(session, a), "receive_currency": _currency(session, b)}
    return out


def _provider_cost(session: Session, frm: str, to: str, pay_op: str, ben_op: str, q: dict) -> D:
    """Ce que l'agrégateur nous coûte, dans la devise du payeur : encaissement du total T + versement de R (converti au taux du marché)."""
    fin, fout = P.get_fee(session, frm, pay_op, "in"), P.get_fee(session, to, ben_op, "out")
    c_in = E.d(P.cost_local(fin, float(q["T"]))) if fin else D(0)
    c_out = E.d(P.cost_local(fout, float(q["R"]))) if fout else D(0)
    if q["pay_currency"] != q["receive_currency"]:
        c_out = c_out * q["M"] if q["direction"] == "zc" else c_out / q["M"]
    return c_in + c_out


def net_estimate(q: dict, cost: D) -> D:
    """Résultat net estimé = frais + écart de change − coûts de l'agrégateur (dans la devise du payeur)."""
    if q["pay_currency"] == q["receive_currency"]:
        fx = D(0)
    else:
        fx = q["S"] - q["R"] * q["M"] if q["direction"] == "zc" else q["S"] - q["R"] / q["M"]
    return q["F"] + fx - cost


def _finish(session: Session, frm: str, to: str, q: dict, pay_op: str, ben_op: str) -> dict:
    """Ajoute opérateurs, coût et net au résultat du moteur. Protection : on refuse une opération qui ferait perdre de l'argent."""
    cost = _provider_cost(session, frm, to, pay_op, ben_op, q)
    net = net_estimate(q, cost)
    if net < 0:
        # Détail réservé aux journaux serveur (Render) : aide l'admin à voir pourquoi un trajet est refusé. Aucune donnée personnelle.
        log.warning("money.margin_guard refus %s>%s dir=%s pay_op=%s ben_op=%s S=%s R=%s F=%s M=%s cout_agregateur=%s net=%s taux_impose=%s",
                    frm.upper(), to.upper(), q["direction"], pay_op, ben_op, q["S"], q["R"], q["F"], q["M"], cost, net,
                    (override_rate(session, frm, to, "send"), override_rate(session, frm, to, "withdraw")))
        raise HTTPException(status_code=422, detail="Ce montant n'est pas disponible avec cette combinaison d'opérateurs pour le moment.")
    target = E.d(get_settings(session)["target_margin_pct"]) / 100
    q.update({"from_country": frm.upper(), "to_country": to.upper(), "pay_operator": pay_op, "receive_operator": ben_op, "provider_cost": cost, "net": net,
              "low_margin": net < q["S"] * target})
    return q


def _engine_call(fn, *a):
    try:
        return fn(*a)
    except E.EngineError as e:
        raise HTTPException(status_code=422, detail=str(e))


def _ops(session: Session, frm: str, to: str, pay_op: str, ben_op: str):
    return pay_op or P.default_operator(session, frm, "in"), ben_op or P.default_operator(session, to, "out")


def _domestic(p: E.Params, direction: str, S: D) -> dict:
    """Facture ou demande dans le pays du payeur : pas de change (K = 1), frais selon le pays."""
    cur = E.CURRENCY[direction][0]
    F = E.fee(p, direction, S)
    return {"direction": direction, "mode": "request", "request_type": "A", "pay_currency": cur, "receive_currency": cur, "S": S, "F": F, "T": S + F, "R": S,
            "K": D(1), "M": p.M, "fee_pct": p.fee_params(direction)[0], "margin": D(0)}


def core_send(session: Session, frm: str, to: str, amount, with_fee: bool = True, pay_op: str = "", ben_op: str = "") -> dict:
    """Le payeur saisit `amount` (dans sa devise). with_fee=True : les frais s'ajoutent. with_fee=False : ils sont retirés (il paie exactement `amount`)."""
    check_corridor(frm, to)
    p, direction = build_params(session, frm, to, "send"), direction_of(frm, to)
    pay_op, ben_op = _ops(session, frm, to, pay_op, ben_op)
    q = _engine_call(E.quote_added if with_fee else E.quote_deducted, p, direction, E.d(amount))
    return _finish(session, frm, to, q, pay_op, ben_op)


def core_request(session: Session, payer_country: str, receiver_country: str, request_type: str, amount, pay_op: str = "", ben_op: str = "", domestic: bool = False) -> dict:
    """Demande / facture. Type A : le bénéficiaire reçoit EXACTEMENT `amount` (devise reçue). Type B : le payeur paie EXACTEMENT `amount` (hors frais).
    Les frais s'ajoutent toujours. Le montant reçu est celui du devis : il n'est jamais recalculé au versement."""
    check_corridor(payer_country, receiver_country, domestic)
    direction = direction_of(payer_country, receiver_country)
    p = build_params(session, payer_country, receiver_country, "withdraw")
    pay_op, ben_op = _ops(session, payer_country, receiver_country, pay_op, ben_op)
    if _currency(session, payer_country) == _currency(session, receiver_country):
        if request_type == "B":
            raise HTTPException(status_code=422, detail="Une demande dans le même pays est toujours de type A.")
        S = E.d(amount)
        try:
            E.check_limits(p, direction, S)
        except E.EngineError as e:
            raise HTTPException(status_code=422, detail=str(e))
        q = _domestic(p, direction, S)
    else:
        q = _engine_call(E.quote_request, p, direction, request_type, E.d(amount))
    return _finish(session, payer_country, receiver_country, q, pay_op, ben_op)


def api_quote(q: dict) -> dict:
    """Vue JSON d'un devis (les clés historiques sont conservées ; les montants sont des nombres à 2 décimales)."""
    f = lambda x: float(x)  # noqa: E731
    S, R = q["S"], q["R"]
    return {"from_country": q["from_country"], "to_country": q["to_country"], "send_currency": q["pay_currency"], "send_amount": f(S), "fee": f(q["F"]),
            "total_paid": f(q["T"]), "fee_mode": {"added": "added", "deducted": "deducted"}.get(q["mode"], "added"), "pay_operator": q["pay_operator"],
            "receive_operator": q["receive_operator"], "receive_currency": q["receive_currency"], "receive_amount": f(R), "rate": round(f(R / S), 6) if S else 0,
            "request_type": q["request_type"], "client_rate": f(q["K"]), "provider_cost": round(f(q["provider_cost"]), 2)}


def quote_send(session: Session, frm: str, to: str, amount: float, with_fee: bool = True, pay_op: str = "", ben_op: str = "") -> dict:
    return api_quote(core_send(session, frm, to, amount, with_fee, pay_op, ben_op))


def quote_receive(session: Session, payer_country: str, receiver_country: str, receive_amount: float, pay_op: str = "", ben_op: str = "", domestic: bool = False,
                  request_type: str = "A") -> dict:
    return api_quote(core_request(session, payer_country, receiver_country, request_type, receive_amount, pay_op, ben_op, domestic))


# --- Devis persistants -------------------------------------------------------------------------------------
QUOTE_TTL = timedelta(minutes=10)


def persist_quote(session: Session, user_id: int, core: dict, kind: str) -> MoneyQuote:
    """Enregistre le devis confirmé (montants ENTIERS en unités mineures + taux utilisés). Plus rien n'est recalculé ensuite."""
    qr = MoneyQuote(id=uuid.uuid4().hex, user_id=user_id, kind=kind, direction=core["direction"], mode=core["mode"], request_type=core["request_type"],
                    from_country=core["from_country"], to_country=core["to_country"], pay_currency=core["pay_currency"], receive_currency=core["receive_currency"],
                    send_minor=E.to_minor(core["S"]), fee_minor=E.to_minor(core["F"]), total_minor=E.to_minor(core["T"]), receive_minor=E.to_minor(core["R"]),
                    rate_k=str(core["K"].quantize(E.Q4)), market_mid=str(core["M"]), fee_pct=str(core["fee_pct"]), margin=str(core["margin"]),
                    pay_operator=core["pay_operator"], receive_operator=core["receive_operator"],
                    provider_cost_minor=E.to_minor(E.ceil_to(core["provider_cost"])), net_minor=E.to_minor(E.floor_to(core["net"])),
                    params_json=json.dumps({k: str(core[k]) for k in ("S", "F", "T", "R", "K", "M", "fee_pct", "margin")}),
                    expires_at=datetime.utcnow() + QUOTE_TTL)
    session.add(qr); session.commit(); session.refresh(qr)
    return qr


def api_from_quote(qr: MoneyQuote) -> dict:
    """Vue JSON d'un devis persisté (montants lus des entiers : aucune conversion de float en calcul)."""
    S, R = E.from_minor(qr.send_minor), E.from_minor(qr.receive_minor)
    return {"quote_id": qr.id, "expires_at": qr.expires_at.isoformat(), "from_country": qr.from_country, "to_country": qr.to_country, "send_currency": qr.pay_currency,
            "send_amount": float(S), "fee": float(E.from_minor(qr.fee_minor)), "total_paid": float(E.from_minor(qr.total_minor)),
            "fee_mode": "deducted" if qr.mode == "deducted" else "added", "pay_operator": qr.pay_operator, "receive_operator": qr.receive_operator,
            "receive_currency": qr.receive_currency, "receive_amount": float(R), "rate": round(float(R / S), 6) if S else 0, "request_type": qr.request_type,
            "client_rate": float(D(qr.rate_k))}


def get_quote(session: Session, quote_id: str, user_id: int, kind: str) -> MoneyQuote:
    """Devis utilisable : appartient au payeur, du bon type, encore ouvert et non expiré."""
    qr = session.get(MoneyQuote, quote_id or "")
    if qr is None or qr.user_id != user_id or qr.kind != kind:
        raise HTTPException(status_code=404, detail="Devis introuvable. Refaites le calcul.")
    if qr.status != "open" or qr.expires_at < datetime.utcnow():
        raise HTTPException(status_code=409, detail="Ce devis a expiré ou a déjà servi. Refaites le calcul.")
    return qr


def consume_quote(session: Session, qr: MoneyQuote, code: str) -> None:
    """Un devis ne sert qu'une fois : comparaison-échange atomique open → used (deux requêtes simultanées : une seule gagne)."""
    won = session.exec(update(MoneyQuote).where(MoneyQuote.id == qr.id, MoneyQuote.status == "open").values(status="used", transfer_code=code)).rowcount
    session.commit()
    if won != 1:
        raise HTTPException(status_code=409, detail="Ce devis a déjà servi. Refaites le calcul.")


def apply_quote(t: MoneyTransfer, qr: MoneyQuote) -> None:
    """Recopie le devis dans l'opération (entiers = vérité ; floats = miroir d'affichage)."""
    t.quote_id, t.rate_k = qr.id, qr.rate_k
    t.send_minor, t.fee_minor, t.total_minor, t.receive_minor = qr.send_minor, qr.fee_minor, qr.total_minor, qr.receive_minor
    t.send_currency, t.receive_currency = qr.pay_currency, qr.receive_currency
    t.send_amount, t.fee, t.total_paid, t.receive_amount = float(E.from_minor(qr.send_minor)), float(E.from_minor(qr.fee_minor)), float(E.from_minor(qr.total_minor)), float(E.from_minor(qr.receive_minor))
    t.rate = round(t.receive_amount / t.send_amount, 6) if t.send_amount else 0
    t.provider_cost = float(E.from_minor(qr.provider_cost_minor))
    t.request_type = qr.request_type


def request_amount(t: MoneyTransfer) -> tuple[str, D]:
    """(type, montant demandé) d'une demande : type A → montant dans la devise REÇUE ; type B → montant dans la devise PAYÉE.
    Les anciennes demandes (avant les types) sont de type A."""
    if t.request_type and t.requested_minor:
        return t.request_type, E.from_minor(t.requested_minor)
    return "A", E.d(t.receive_amount)


def core_for_request(session: Session, t: MoneyTransfer, pay_op: str = "") -> dict:
    """Devis du payeur pour une demande existante (type, montant et sens du montant lus de la demande, jamais de la saisie du payeur)."""
    rtype, amount = request_amount(t)
    ben_op = t.provider_ref.split("|", 1)[1] if "|" in t.provider_ref else ""
    return core_request(session, t.from_country, t.to_country, rtype, amount, pay_op, ben_op, domestic=t.from_country == t.to_country)


# --- Plafond journalier : verrou atomique ------------------------------------------------------------
_USER_LOCKS: dict = {}
_USER_LOCKS_GUARD = threading.Lock()
# Statuts qui ne comptent PAS dans le plafond (argent jamais encaissé, ou rendu au payeur).
NOT_COUNTED = ("cancelled", "refunded", "rejected", "declined", "expired", "awaiting_payer", "failed", "collection_failed")


def _lock_of(user_id: int) -> threading.Lock:
    with _USER_LOCKS_GUARD:
        return _USER_LOCKS.setdefault(user_id, threading.Lock())


@contextmanager
def daily_guard(session: Session, user_id: int):
    """Section critique par payeur : vérification du plafond ET insertion de l'opération (statut « created », comptée) se font sous le même verrou,
    donc deux requêtes parallèles ne peuvent pas passer le plafond ensemble. Verrou de processus (threading) + SELECT … FOR UPDATE sur la ligne
    de l'utilisateur (PostgreSQL : verrou entre processus/instances ; ignoré par SQLite). À utiliser ainsi :
        with daily_guard(session, uid): check_daily(...); session.add(t); session.commit()"""
    lock = _lock_of(user_id)
    lock.acquire()
    try:
        session.exec(select(User.id).where(User.id == user_id).with_for_update()).first()
        yield
    finally:
        lock.release()


def spent_usd_24h(session: Session, user_id: int) -> D:
    since = datetime.utcnow() - timedelta(days=1)
    rows = session.exec(select(MoneyTransfer).where(MoneyTransfer.payer_user_id == user_id, MoneyTransfer.created_at >= since,
                                                    MoneyTransfer.status.not_in(NOT_COUNTED))).all()
    M = market_mid(session)
    return sum((E.d(r.send_amount) / M if r.send_currency == "ZMW" else E.d(r.send_amount) for r in rows), D(0))


def check_daily(session: Session, user_id: int, amount_usd: float) -> None:
    """À appeler DANS `daily_guard`. Compte aussi les opérations en cours (created, collecting…)."""
    if spent_usd_24h(session, user_id) + E.d(amount_usd) > E.d(get_settings(session)["daily_max_usd"]):
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
