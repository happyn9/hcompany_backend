from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, or_, select

from app.crossborder import services as geo
from app.database import get_session
from app.deps import get_current_user
from app.models import User
from app.money import services as svc
from app.money.models import MoneyTransfer
from app.money.provider import get_provider

router = APIRouter(prefix="/api/v1/money", tags=["money"])


def _read(t: MoneyTransfer, viewer_id: int) -> dict:
    role = "requester" if (t.kind == "request" and t.user_id == viewer_id) else ("payer" if t.payer_user_id == viewer_id or (t.kind == "send" and t.user_id == viewer_id) else "other")
    return {"code": t.code, "kind": t.kind, "role": role, "status": t.status, "from_country": t.from_country, "to_country": t.to_country,
            "send_currency": t.send_currency, "send_amount": t.send_amount, "fee": t.fee, "total_paid": t.total_paid,
            "receive_currency": t.receive_currency, "receive_amount": t.receive_amount, "rate": t.rate, "counterpart_name": t.counterpart_name,
            "counterpart_phone": t.counterpart_phone, "counterpart_operator": t.counterpart_operator or "", "note": t.note, "failure_reason": t.failure_reason, "created_at": t.created_at.isoformat(),
            "expires_at": t.expires_at.isoformat() if t.expires_at else None, "simulated": t.provider == "simulated"}


def _require_verified(user: User) -> None:
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Vérifiez d'abord votre e-mail pour utiliser H-Money.")


@router.get("/corridors")
def corridors(session: Session = Depends(get_session)):
    geo.ensure_seed(session)
    cfg = svc.get_settings(session)
    from app.money import pricing as P
    fees = P.all_fees(session)

    def ops(country):
        cheapest = {d: (P.enabled_ops(session, country, d) or [None])[0] for d in ("in", "out")}
        rows = []
        for key, label in svc.OPERATORS[country].items():
            i, o = fees.get((country, key, "in")), fees.get((country, key, "out"))
            rows.append({"key": key, "label": label, "pay": bool(i and i.enabled), "receive": bool(o and o.enabled),
                         "cheapest_receive": bool(o and o.enabled and cheapest["out"] and cheapest["out"].operator == key and len({x.pct for x in P.enabled_ops(session, country, "out")}) > 1),
                         "code": P.PAWAPAY_CODES.get((country, key))})
        return rows
    return {"countries": ["ZM", "CD"], "operators": {k: ops(k) for k in svc.OPERATORS},
            "limits_usd": {"min": cfg["min_usd"], "max": cfg["max_usd"], "daily": cfg["daily_max_usd"]}, "fee_pct": cfg["fee_pct"], "min_fee_usd": cfg["min_fee_usd"], "dial_codes": svc.DIAL,
            "currencies": {c: svc._currency(session, c) for c in ("ZM", "CD")}, "rates": svc.corridor_rates(session), "simulated": get_provider().simulated}


@router.get("/quote")
def quote(amount: float = Query(gt=0, le=10_000_000), source: str = Query(alias="from", min_length=2, max_length=2),
          target: str = Query(alias="to", min_length=2, max_length=2), mode: str = Query(default="send", pattern="^(send|receive)$"),
          with_fee: bool = True, pay_op: str = "", ben_op: str = "", session: Session = Depends(get_session)):
    """mode=send : le payeur envoie `amount`. mode=receive : le bénéficiaire doit recevoir `amount`."""
    q = svc.quote_send(session, source, target, amount, with_fee, pay_op, ben_op) if mode == "send" else svc.quote_receive(session, source, target, amount, pay_op, ben_op)
    q.pop("provider_cost", None)  # le coût interne de l'agrégateur n'est jamais montré au client
    return q


@router.get("/quote/compare")
def quote_compare(amount: float = Query(gt=0, le=10_000_000), source: str = Query(alias="from", min_length=2, max_length=2),
                  target: str = Query(alias="to", min_length=2, max_length=2), with_fee: bool = True, pay_op: str = "", session: Session = Depends(get_session)):
    """Pour le sélecteur d'opérateur : ce que recevrait le bénéficiaire (et les frais) chez chaque opérateur disponible."""
    from app.money import pricing as P
    rows = []
    for f in P.enabled_ops(session, target.upper(), "out"):
        q = svc.quote_send(session, source, target, amount, with_fee, pay_op, f.operator)
        rows.append({"operator": f.operator, "fee": q["fee"], "total_paid": q["total_paid"], "receive_amount": q["receive_amount"], "receive_currency": q["receive_currency"], "send_currency": q["send_currency"]})
    return rows


class SendIn(BaseModel):
    to_country: str = Field(min_length=2, max_length=2)
    from_country: str = Field(min_length=2, max_length=2)
    amount: float = Field(gt=0, le=10_000_000)
    with_fee: bool = True  # True : les frais s'ajoutent au montant ; False : ils sont retirés du montant saisi
    beneficiary_name: str = Field(min_length=2, max_length=120)
    beneficiary_phone: str = Field(min_length=6, max_length=24)
    beneficiary_operator: str
    pay_phone: str = Field(min_length=6, max_length=24)
    pay_operator: str
    note: str = Field(default="", max_length=200)


def _run_payment(session: Session, t: MoneyTransfer, payer_country: str) -> None:
    """Encaisse chez le payeur et GARDE l'argent : le versement n'a lieu qu'après contrôle d'un agent ou de l'admin (statut « under_review »)."""
    prov = get_provider()
    c = prov.collect(country=payer_country, currency=t.send_currency, amount=t.total_paid, phone=t.pay_phone, operator=t.pay_operator, reference=t.code)
    if not c.ok:
        t.status, t.failure_reason = "cancelled", c.reason
        return
    t.status, t.provider_ref = "under_review", c.ref
    t.review_note = ""


def finalize_review(session: Session, t: MoneyTransfer, approve: bool, reason: str = "") -> None:
    """Décision d'un agent / de l'admin sur une opération « under_review » : verser le bénéficiaire, ou rembourser le payeur."""
    if t.status != "under_review":
        raise HTTPException(status_code=409, detail="Cette opération n'est pas en attente de contrôle.")
    prov = get_provider()
    if approve:
        p = prov.payout(country=t.to_country, currency=t.receive_currency, amount=t.receive_amount, phone=t.counterpart_phone, operator=t.counterpart_operator, reference=t.code)
        if p.ok:
            t.status = "completed"
            return
        prov.refund(ref=t.provider_ref, amount=t.total_paid, currency=t.send_currency)
        t.status, t.failure_reason = "refunded", p.reason + " Le payeur a été remboursé."
        return
    prov.refund(ref=t.provider_ref, amount=t.total_paid, currency=t.send_currency)
    t.status, t.failure_reason = "rejected", (reason or "Refusée après contrôle.") + " Le payeur a été remboursé."


@router.post("/transfers", status_code=201)
def send(payload: SendIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _require_verified(user)
    frm, to = payload.from_country.upper(), payload.to_country.upper()
    svc.check_operator(session, frm, payload.pay_operator, "in")
    svc.check_operator(session, to, payload.beneficiary_operator, "out")
    q = svc.quote_send(session, frm, to, payload.amount, payload.with_fee, payload.pay_operator, payload.beneficiary_operator)
    svc.check_daily(session, user.id, svc.usd_of(session, q["send_amount"], q["send_currency"]))
    t = MoneyTransfer(code=svc.new_code(), kind="send", user_id=user.id, payer_user_id=user.id, from_country=frm, to_country=to,
                      send_currency=q["send_currency"], send_amount=q["send_amount"], fee=q["fee"], total_paid=q["total_paid"],
                      receive_currency=q["receive_currency"], receive_amount=q["receive_amount"], rate=q["rate"],
                      counterpart_name=payload.beneficiary_name.strip(), counterpart_phone=svc.normalize_phone(payload.beneficiary_phone, to),
                      counterpart_operator=payload.beneficiary_operator, pay_phone=svc.normalize_phone(payload.pay_phone, frm),
                      pay_operator=payload.pay_operator, note=payload.note.strip(), provider=get_provider().name, provider_cost=q["provider_cost"])
    _run_payment(session, t, frm)
    t.updated_at = datetime.utcnow()
    session.add(t); session.commit(); session.refresh(t)
    return _read(t, user.id)


class RequestIn(BaseModel):
    payer_country: str = Field(min_length=2, max_length=2)
    receiver_country: str = Field(min_length=2, max_length=2)
    amount: Optional[float] = Field(default=None, gt=0, le=10_000_000)  # (ancien) montant dans la devise de réception
    amount_usd: Optional[float] = Field(default=None, gt=0, le=1_000_000)  # ce que vous voulez RECEVOIR, toujours saisi en dollars
    receive_phone: str = Field(min_length=6, max_length=24)
    receive_operator: str
    payer_name: str = Field(default="", max_length=120)
    payer_phone: str = Field(default="", max_length=24)
    note: str = Field(default="", max_length=200)


@router.post("/requests", status_code=201)
def request_money(payload: RequestIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _require_verified(user)
    pc, rc = payload.payer_country.upper(), payload.receiver_country.upper()
    svc.check_operator(session, rc, payload.receive_operator, "out")
    if payload.amount_usd is not None:  # saisie en dollars ; conversion au taux du marché dans la devise de réception
        amount = svc.geo.convert(session, payload.amount_usd, "USD", svc.currency_of(session, rc), with_margin=False)
    elif payload.amount is not None:
        amount = payload.amount
    else:
        raise HTTPException(status_code=422, detail="Indiquez le montant en dollars.")
    q = svc.quote_receive(session, pc, rc, amount, "", payload.receive_operator)
    t = MoneyTransfer(code=svc.new_code(), kind="request", user_id=user.id, from_country=pc, to_country=rc, send_currency=q["send_currency"],
                      receive_currency=q["receive_currency"], receive_amount=q["receive_amount"],
                      counterpart_name=payload.payer_name.strip() or "Proche", counterpart_phone=svc.normalize_phone(payload.payer_phone, pc) if payload.payer_phone else "",
                      # le numéro de réception du demandeur est conservé dans pay_phone/pay_operator côté « receveur »
                      pay_phone="", pay_operator="", note=payload.note.strip(), status="awaiting_payer", provider=get_provider().name,
                      expires_at=datetime.utcnow() + timedelta(days=svc.REQUEST_TTL_DAYS))
    t.provider_ref = f"{svc.normalize_phone(payload.receive_phone, rc)}|{payload.receive_operator}"  # destination du versement, jusqu'au paiement
    session.add(t); session.commit(); session.refresh(t)
    return _read(t, user.id)


def _get_request(session: Session, code: str) -> MoneyTransfer:
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == code.upper(), MoneyTransfer.kind == "request")).first()
    if not t:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    if t.status == "awaiting_payer" and t.expires_at and t.expires_at < datetime.utcnow():
        t.status = "expired"; session.add(t); session.commit()
    return t


@router.get("/requests/{code}")
def view_request(code: str, pay_op: str = "", session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Aperçu pour la personne sollicitée : combien elle paierait, dans sa devise (selon l'opérateur choisi)."""
    t = _get_request(session, code)
    q = svc.quote_receive(session, t.from_country, t.to_country, t.receive_amount, pay_op, t.provider_ref.split("|", 1)[1] if "|" in t.provider_ref else "", domestic=t.from_country == t.to_country)
    q.pop("provider_cost", None)
    asker = session.get(User, t.user_id)
    return {**_read(t, user.id), "asker_name": (asker.full_name if asker else "") or "Un proche", "quote": q}


class PayIn(BaseModel):
    pay_phone: str = Field(min_length=6, max_length=24)
    pay_operator: str


@router.post("/requests/{code}/pay")
def pay_request(code: str, payload: PayIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _require_verified(user)
    t = _get_request(session, code)
    if t.status != "awaiting_payer":
        raise HTTPException(status_code=409, detail="Cette demande n'est plus en attente.")
    if t.user_id == user.id:
        raise HTTPException(status_code=422, detail="Vous ne pouvez pas payer votre propre demande.")
    svc.check_operator(session, t.from_country, payload.pay_operator, "in")
    q = svc.quote_receive(session, t.from_country, t.to_country, t.receive_amount, payload.pay_operator, t.provider_ref.split("|", 1)[1], domestic=t.from_country == t.to_country)
    svc.check_daily(session, user.id, svc.usd_of(session, q["send_amount"], q["send_currency"]))
    dest_phone, dest_op = t.provider_ref.split("|", 1)
    t.payer_user_id, t.send_amount, t.fee, t.total_paid, t.rate, t.provider_cost = user.id, q["send_amount"], q["fee"], q["total_paid"], q["rate"], q["provider_cost"]
    t.pay_phone, t.pay_operator = svc.normalize_phone(payload.pay_phone, t.from_country), payload.pay_operator
    t.counterpart_phone, t.counterpart_operator = dest_phone, dest_op  # versement vers le demandeur
    _run_payment(session, t, t.from_country)
    if t.status == "cancelled":  # paiement refusé : la demande reste ouverte pour un nouvel essai
        reason, t.status, t.payer_user_id = t.failure_reason, "awaiting_payer", None
        session.add(t); session.commit()
        raise HTTPException(status_code=402, detail=reason or "Paiement refusé.")
    t.updated_at = datetime.utcnow()
    session.add(t); session.commit(); session.refresh(t)
    return _read(t, user.id)


@router.post("/requests/{code}/decline")
def decline_request(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _get_request(session, code)
    if t.status != "awaiting_payer":
        raise HTTPException(status_code=409, detail="Cette demande n'est plus en attente.")
    t.status = "cancelled" if t.user_id == user.id else "declined"
    t.updated_at = datetime.utcnow()
    session.add(t); session.commit()
    return _read(t, user.id)


@router.get("/transfers")
def mine(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(MoneyTransfer).where(or_(MoneyTransfer.user_id == user.id, MoneyTransfer.payer_user_id == user.id))
                        .order_by(MoneyTransfer.created_at.desc()).limit(100)).all()
    return [_read(t, user.id) for t in rows]


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(default="", max_length=24)
    country: str = Field(default="", max_length=2)


@router.post("/profile")
def save_profile(payload: ProfileIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Première opération : on complète le compte (nom, numéro) seulement s'il était vide. Jamais d'écrasement silencieux."""
    changed = {}
    if not (user.full_name or "").strip():
        user.full_name = " ".join(payload.full_name.split()); changed["full_name"] = True
    if payload.phone and not user.phone:
        c = (payload.country or "ZM").upper()
        try:
            ph = "+" + svc.normalize_phone(payload.phone, c if c in svc.DIAL else "ZM")
        except HTTPException:
            ph = ""
        if ph and not session.exec(select(User).where(User.phone == ph, User.id != user.id)).first():
            user.phone = ph; changed["phone"] = True
    session.add(user); session.commit()
    return {"full_name": user.full_name, "phone": user.phone, "saved": list(changed)}


@router.get("/change")
def change(amount: float = Query(gt=0, le=10_000_000), source: str = Query(alias="from", min_length=3, max_length=3), target: str = Query(alias="to", min_length=3, max_length=3),
           session: Session = Depends(get_session)):
    """Change de monnaie en dollars (USD vers ZMW/CDF et inverse) au taux H-Money affiché, marge déduite. Devis : aucun argent ne bouge."""
    return svc.change_quote(session, amount, source, target)
