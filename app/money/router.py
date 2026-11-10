from datetime import datetime, timedelta
from decimal import Decimal as D
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlmodel import Session, or_, select

from app.crossborder import services as geo
from app.database import get_session
from app.deps import get_current_user
from app.models import User
from app.money import engine as E
from app.money import flow, idem, ledger
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
            "expires_at": t.expires_at.isoformat() if t.expires_at else None, "simulated": t.provider == "simulated", "stage": flow.stage_of(t), "verify_needed": t.verify_needed, "request_type": t.request_type,
            "requested_amount": t.requested_minor / 100 if t.requested_minor else None, "requested_currency": t.requested_currency}


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
            "limits_usd": {"min": cfg["min_usd"], "max": cfg["max_usd"], "daily": cfg["daily_max_usd"]}, "fee_pct": cfg["fee_pct"], "fee_pct_cz": cfg["fee_pct_cz"], "min_fee_zmw": cfg["min_fee_zmw"], "fictive_params": cfg["fictive"], "min_fee_usd": cfg["min_fee_usd"], "dial_codes": svc.DIAL,
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
    quote_id: str = Field(default="", max_length=64)  # devis confirmé à l'écran récapitulatif (sinon un devis est calculé et conservé ici)


def finalize_review(session: Session, t: MoneyTransfer, approve: bool, reason: str = "") -> None:
    """Décision d'un agent / de l'admin sur une opération « under_review » : verser (une seule fois) ou refuser et rembourser (voir flow.decide_review)."""
    flow.decide_review(session, t, approve, reason)


class QuoteIn(BaseModel):
    from_country: str = Field(min_length=2, max_length=2)
    to_country: str = Field(min_length=2, max_length=2)
    amount: float = Field(gt=0, le=10_000_000)
    with_fee: bool = True
    pay_operator: str = ""
    beneficiary_operator: str = ""


@router.post("/quotes", status_code=201)
def create_quote(payload: QuoteIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Récapitulatif confirmé : le devis est CONSERVÉ (montants entiers, taux, frais) pendant 10 minutes et ne sert qu'une fois."""
    _require_verified(user)
    core = svc.core_send(session, payload.from_country, payload.to_country, payload.amount, payload.with_fee, payload.pay_operator, payload.beneficiary_operator)
    return svc.api_from_quote(svc.persist_quote(session, user.id, core, "send"))


@router.post("/transfers", status_code=201)
def send(payload: SendIn, session: Session = Depends(get_session), user: User = Depends(get_current_user), idempotency_key: str = Header(default="", alias="Idempotency-Key")):
    _require_verified(user)
    return idem.run(session, user.id, "transfer", idempotency_key, payload.model_dump(), lambda: _send(payload, session, user), 201)


def _send(payload: SendIn, session: Session, user: User) -> dict:
    frm, to = payload.from_country.upper(), payload.to_country.upper()
    svc.check_operator(session, frm, payload.pay_operator, "in")
    svc.check_operator(session, to, payload.beneficiary_operator, "out")
    if payload.quote_id:  # le devis confirmé fait foi : on ne recalcule rien
        qr = svc.get_quote(session, payload.quote_id, user.id, "send")
        if (qr.from_country, qr.to_country, qr.pay_operator, qr.receive_operator) != (frm, to, payload.pay_operator, payload.beneficiary_operator):
            raise HTTPException(status_code=422, detail="Le devis ne correspond pas à cette opération. Refaites le calcul.")
    else:
        qr = svc.persist_quote(session, user.id, svc.core_send(session, frm, to, payload.amount, payload.with_fee, payload.pay_operator, payload.beneficiary_operator), "send")
    t = MoneyTransfer(code=svc.new_code(), kind="send", user_id=user.id, payer_user_id=user.id, from_country=frm, to_country=to,
                      counterpart_name=payload.beneficiary_name.strip(), counterpart_phone=svc.normalize_phone(payload.beneficiary_phone, to),
                      counterpart_operator=payload.beneficiary_operator, pay_phone=svc.normalize_phone(payload.pay_phone, frm),
                      pay_operator=payload.pay_operator, note=payload.note.strip(), provider=get_provider().name,
                      amount_side="pay_total" if qr.mode == "deducted" else "pay_base", receive_currency=qr.receive_currency)
    svc.apply_quote(t, qr)
    with svc.daily_guard(session, user.id):  # plafond vérifié ET opération enregistrée (comptée) sous le même verrou
        svc.check_daily(session, user.id, svc.usd_of(session, t.send_amount, t.send_currency))
        svc.consume_quote(session, qr, t.code)
        session.add(t); session.commit()
    flow.start_collection(session, t)
    return _read(t, user.id)


class RequestIn(BaseModel):
    payer_country: str = Field(min_length=2, max_length=2)
    receiver_country: str = Field(min_length=2, max_length=2)
    request_type: str = Field(default="", pattern="^(|A|B)$")  # A : le bénéficiaire reçoit EXACTEMENT le montant ; B : le payeur paie EXACTEMENT le montant
    amount: Optional[float] = Field(default=None, gt=0, le=10_000_000)  # montant de type A (devise reçue) ou de type B (devise payée) selon request_type
    amount_usd: Optional[float] = Field(default=None, gt=0, le=1_000_000)  # raccourci en dollars : Zambie→RDC = type A (le Congolais reçoit exactement X USD) ; RDC→Zambie = type B
    receive_phone: str = Field(min_length=6, max_length=24)
    receive_operator: str
    payer_name: str = Field(default="", max_length=120)
    payer_phone: str = Field(default="", max_length=24)
    note: str = Field(default="", max_length=200)


def new_request_row(session: Session, user: User, pc: str, rc: str, rtype: str, amount: D, receive_phone: str, receive_operator: str, payer_name: str,
                    payer_phone: str, note: str, expires: datetime, code: str = "") -> MoneyTransfer:
    """Crée une demande (A ou B) : le type, le montant demandé et SA DEVISE sont enregistrés explicitement. Pour le type A le montant reçu est figé ici."""
    core = svc.core_request(session, pc, rc, rtype, amount, "", receive_operator, domestic=pc == rc)  # valide limites, opérateur et rentabilité
    t = MoneyTransfer(code=code or svc.new_code(), kind="request", user_id=user.id, from_country=pc, to_country=rc, send_currency=core["pay_currency"],
                      receive_currency=core["receive_currency"], receive_amount=float(core["R"]), receive_minor=E.to_minor(core["R"]) if rtype == "A" else 0,
                      request_type=rtype, requested_minor=E.to_minor(amount), requested_currency=core["receive_currency"] if rtype == "A" else core["pay_currency"],
                      amount_side="receive" if rtype == "A" else "pay",
                      counterpart_name=payer_name.strip() or "Proche", counterpart_phone=svc.normalize_phone(payer_phone, pc) if payer_phone else "",
                      pay_phone="", pay_operator="", note=note.strip(), status="awaiting_payer", provider=get_provider().name, expires_at=expires)
    t.provider_ref = f"{svc.normalize_phone(receive_phone, rc)}|{receive_operator}"  # destination du versement, jusqu'au paiement
    return t


@router.post("/requests", status_code=201)
def request_money(payload: RequestIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _require_verified(user)
    pc, rc = payload.payer_country.upper(), payload.receiver_country.upper()
    svc.check_operator(session, rc, payload.receive_operator, "out")
    if payload.amount_usd is not None:
        rtype, amount = ("A" if rc == "CD" else "B") if pc != rc else "A", E.d(payload.amount_usd)
    elif payload.amount is not None:
        rtype, amount = payload.request_type or "A", E.d(payload.amount)
    else:
        raise HTTPException(status_code=422, detail="Indiquez le montant.")
    t = new_request_row(session, user, pc, rc, rtype, amount, payload.receive_phone, payload.receive_operator, payload.payer_name, payload.payer_phone, payload.note,
                        datetime.utcnow() + timedelta(days=svc.REQUEST_TTL_DAYS))
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
    """Aperçu pour la personne sollicitée : combien elle paierait, dans sa devise (selon l'opérateur choisi). Simple aperçu : rien n'est conservé."""
    t = _get_request(session, code)
    q = svc.api_quote(svc.core_for_request(session, t, pay_op))
    q.pop("provider_cost", None)
    asker = session.get(User, t.user_id)
    return {**_read(t, user.id), "asker_name": (asker.full_name if asker else "") or "Un proche", "quote": q}


class PayIn(BaseModel):
    pay_phone: str = Field(min_length=6, max_length=24)
    pay_operator: str
    quote_id: str = Field(default="", max_length=64)


class PayQuoteIn(BaseModel):
    pay_operator: str


@router.post("/requests/{code}/quote", status_code=201)
def request_quote(code: str, payload: PayQuoteIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Récapitulatif du payeur confirmé et CONSERVÉ (10 min, usage unique)."""
    _require_verified(user)
    t = _get_request(session, code)
    if t.status != "awaiting_payer":
        raise HTTPException(status_code=409, detail="Cette demande n'est plus en attente.")
    svc.check_operator(session, t.from_country, payload.pay_operator, "in")
    qr = svc.persist_quote(session, user.id, svc.core_for_request(session, t, payload.pay_operator), "request")
    return svc.api_from_quote(qr)


@router.post("/requests/{code}/pay")
def pay_request(code: str, payload: PayIn, session: Session = Depends(get_session), user: User = Depends(get_current_user), idempotency_key: str = Header(default="", alias="Idempotency-Key")):
    _require_verified(user)
    return idem.run(session, user.id, f"pay:{code.upper()}", idempotency_key, payload.model_dump(), lambda: _pay_request(code, payload, session, user), 200)


def _pay_request(code: str, payload: PayIn, session: Session, user: User) -> dict:
    t = _get_request(session, code)
    if t.status != "awaiting_payer":
        raise HTTPException(status_code=409, detail="Cette demande n'est plus en attente.")
    if t.user_id == user.id:
        raise HTTPException(status_code=422, detail="Vous ne pouvez pas payer votre propre demande.")
    svc.check_operator(session, t.from_country, payload.pay_operator, "in")
    dest_phone, dest_op = t.provider_ref.split("|", 1)
    if payload.quote_id:
        qr = svc.get_quote(session, payload.quote_id, user.id, "request")
        if (qr.from_country, qr.to_country, qr.pay_operator, qr.receive_operator) != (t.from_country, t.to_country, payload.pay_operator, dest_op):
            raise HTTPException(status_code=422, detail="Le devis ne correspond pas à cette demande. Refaites le calcul.")
    else:
        qr = svc.persist_quote(session, user.id, svc.core_for_request(session, t, payload.pay_operator), "request")
    if qr.request_type == "A" and t.receive_minor and qr.receive_minor != t.receive_minor:
        raise HTTPException(status_code=409, detail="Le montant à recevoir a changé. Refaites le calcul.")  # le type A garantit le montant exact
    with svc.daily_guard(session, user.id):
        svc.check_daily(session, user.id, svc.usd_of(session, E.from_minor(qr.send_minor), qr.pay_currency))
        svc.consume_quote(session, qr, t.code)
        # prise de la demande par comparaison-échange : un seul payeur peut la saisir (pas de double collecte)
        won = session.exec(update(MoneyTransfer).where(MoneyTransfer.id == t.id, MoneyTransfer.status == "awaiting_payer").values(status="created", payer_user_id=user.id)).rowcount
        session.commit()
        if won != 1:
            raise HTTPException(status_code=409, detail="Cette demande n'est plus en attente.")
    session.refresh(t)
    svc.apply_quote(t, qr)
    t.request_type = qr.request_type
    t.pay_phone, t.pay_operator = svc.normalize_phone(payload.pay_phone, t.from_country), payload.pay_operator
    t.counterpart_phone, t.counterpart_operator = dest_phone, dest_op  # versement vers le demandeur
    flow.start_collection(session, t)
    if t.status == "awaiting_payer":  # paiement refusé : la demande reste ouverte pour un nouvel essai
        raise HTTPException(status_code=402, detail=t.failure_reason or "Paiement refusé.")
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


# --- Suivi, vérification, webhook, simulation ------------------------------------------------------

@router.get("/transfers/{code}")
def transfer_status(code: str, refresh: bool = False, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Suivi d'une opération pour l'écran d'état. `refresh=true` interroge le fournisseur pour les opérations en attente."""
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == code.upper())).first()
    if not t or user.id not in (t.user_id, t.payer_user_id):
        raise HTTPException(status_code=404, detail="Opération introuvable.")
    if refresh and t.status in ("collecting", "payout_pending", "refund_pending"):
        flow.sync_transfer(session, t)
    return _read(t, user.id)


@router.post("/webhooks/provider")
async def provider_webhook(request: Request, session: Session = Depends(get_session)):
    """Notification du fournisseur : signature HMAC vérifiée, rejeu ignoré, statut revérifié auprès du fournisseur avant toute écriture."""
    raw = await request.body()
    try:
        import json
        body = json.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(status_code=422, detail="Corps illisible.")
    return flow.handle_callback(session, raw, request.headers, body)


@router.post("/sim/{code}/{outcome}")
def simulate_outcome(code: str, outcome: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """RÉSERVÉ AU FOURNISSEUR SIMULÉ (bac à sable de démonstration) : joue le résultat d'une opération en attente, comme le ferait l'opérateur (completed | failed).
    N'existe pas avec un vrai fournisseur. Aucun PIN n'est demandé ici : avec un vrai fournisseur, c'est l'interface de l'opérateur qui le collecte."""
    if not get_provider().simulated:
        raise HTTPException(status_code=404, detail="Introuvable.")
    if outcome not in ("completed", "failed"):
        raise HTTPException(status_code=422, detail="Résultat inconnu.")
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == code.upper())).first()
    if not t or user.id not in (t.user_id, t.payer_user_id):
        raise HTTPException(status_code=404, detail="Opération introuvable.")
    op = session.exec(select(flow.MoneyProviderOp).where(flow.MoneyProviderOp.transfer_code == t.code, flow.MoneyProviderOp.status.in_(flow.OP_OPEN))).first()
    if not op:
        raise HTTPException(status_code=409, detail="Aucune opération en attente.")
    op.sim_status = outcome
    session.add(op); session.commit()
    flow.sync_transfer(session, t)
    return _read(t, user.id)
