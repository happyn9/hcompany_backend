"""Factures H-Money + registre des paiements de services.

Facture = une demande H-Money (même contrôle, mêmes frais, même séquestre) + le détail des lignes.
Le client la règle depuis le lien /money/facture/{code} ; il peut être dans le même pays que l'émetteur."""
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.deps import get_current_admin, get_current_user
from app.models import User
from app.money import services as svc
from app.money.models import Invoice, MoneyTransfer, ServicePayment
from app.money.provider import get_provider
from app.money import router as mr

router = APIRouter(prefix="/api/v1/money/invoices", tags=["money-invoices"])
ledger_router = APIRouter(prefix="/api/v1/money", tags=["money-ledger"])


class Line(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    qty: float = Field(default=1, gt=0, le=100000)
    unit_price: float = Field(gt=0, le=10_000_000)


class InvoiceIn(BaseModel):
    client_name: str = Field(default="", max_length=120)
    client_email: str = Field(default="", max_length=160)
    client_phone: str = Field(default="", max_length=24)
    client_user_id: Optional[int] = None  # client trouvé dans le système (recherche) : la facture apparaît dans son compte
    client_country: str = Field(min_length=2, max_length=2)  # pays où le client paiera
    receive_country: str = Field(min_length=2, max_length=2)  # pays de l'émetteur
    receive_phone: str = Field(min_length=6, max_length=24)
    receive_operator: str
    items: list[Line] = Field(min_length=1, max_length=30)
    note: str = Field(default="", max_length=300)
    due_days: int = Field(default=14, ge=1, le=90)


def _safe_phone(raw: str, country: str) -> str:
    try:
        return svc.normalize_phone(raw, country) if raw else ""
    except HTTPException:
        return ""  # le numéro d'un client trouvé dans le système peut être d'un autre format : on ne bloque pas la facture


def _mask_email(e: str) -> str:
    n, _, d = (e or "").partition("@")
    return (n[:2] + "•••@" + d) if d else ""


def _mask_phone(p: str) -> str:
    d = "".join(c for c in (p or "") if c.isdigit())
    return ("+" + d[:3] + " ••• ••" + d[-2:]) if len(d) >= 8 else ""


def _status(inv: Invoice, t: Optional[MoneyTransfer]) -> str:
    if inv.cancelled or (t and t.status == "cancelled"):
        return "cancelled"
    if not t:
        return "open"
    if t.status in ("under_review", "completed"):
        return "paid"
    if t.status in ("refunded", "rejected"):
        return t.status
    if t.status == "expired" or (t.status == "awaiting_payer" and t.expires_at and t.expires_at < datetime.utcnow()):
        return "expired"
    return "declined" if t.status == "declined" else "open"


def _read(session: Session, inv: Invoice, viewer: User) -> dict:
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == inv.transfer_code)).first()
    issuer = session.get(User, inv.user_id)
    mine = inv.user_id == viewer.id
    return {"code": inv.code, "role": "issuer" if mine else "client", "status": _status(inv, t), "issuer_name": (issuer.full_name if issuer else "") or "",
            "client_name": inv.client_name, "client_email": inv.client_email, "client_country": inv.client_country, "currency": inv.currency,
            "items": json.loads(inv.items_json), "total": inv.total, "note": inv.note, "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "transfer_code": inv.transfer_code, "created_at": inv.created_at.isoformat(), "link": f"/money/facture/{inv.code}"}


@router.post("", status_code=201)
def create(payload: InvoiceIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    mr._require_verified(user)
    pc, rc = payload.client_country.upper(), payload.receive_country.upper()
    svc.check_operator(session, rc, payload.receive_operator, "out")
    if payload.client_user_id:
        target = session.get(User, payload.client_user_id)
        if not target or not target.is_active or target.id == user.id:
            raise HTTPException(status_code=422, detail="Client introuvable.")
        payload.client_email = target.email or payload.client_email
        payload.client_phone = target.phone or payload.client_phone
        payload.client_name = payload.client_name or target.full_name or "Client"
    if len(payload.client_name.strip()) < 2:
        raise HTTPException(status_code=422, detail="Indiquez le nom du client.")
    total = round(sum(l.qty * l.unit_price for l in payload.items), 2)
    q = svc.quote_receive(session, pc, rc, total, "", payload.receive_operator, domestic=True)
    code = svc.new_code().replace("HM-", "INV-")
    t = MoneyTransfer(code=svc.new_code(), kind="request", user_id=user.id, from_country=pc, to_country=rc, send_currency=q["send_currency"],
                      receive_currency=q["receive_currency"], receive_amount=q["receive_amount"], counterpart_name=payload.client_name.strip(),
                      counterpart_phone=_safe_phone(payload.client_phone, pc), note=f"Facture {code}",
                      status="awaiting_payer", provider=get_provider().name, expires_at=datetime.utcnow() + timedelta(days=payload.due_days))
    t.provider_ref = f"{svc.normalize_phone(payload.receive_phone, rc)}|{payload.receive_operator}"
    inv = Invoice(code=code, user_id=user.id, client_name=payload.client_name.strip(), client_email=payload.client_email.strip().lower(),
                  client_phone=payload.client_phone, client_country=pc, currency=q["receive_currency"],
                  items_json=json.dumps([l.model_dump() for l in payload.items]), total=total, note=payload.note.strip(),
                  due_date=t.expires_at, transfer_code=t.code)
    session.add(t); session.add(inv); session.commit(); session.refresh(inv)
    return _read(session, inv, user)


@router.get("/clients")
def find_clients(q: str = "", session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Cherche un client déjà inscrit (nom, e-mail ou téléphone). Résultats limités et masqués : on ne révèle jamais un contact complet."""
    mr._require_verified(user)
    q = (q or "").strip()
    if len(q) < 3:
        return []
    like = f"%{q.lower()}%"
    digits = "".join(c for c in q if c.isdigit())
    conds = [func.lower(User.full_name).like(like), func.lower(User.email).like(like)]
    if len(digits) >= 5:
        conds.append(User.phone.like(f"%{digits[-9:]}%"))
    rows = session.exec(select(User).where(User.is_active == True, User.id != user.id, or_(*conds)).limit(6)).all()  # noqa: E712
    return [{"id": u.id, "name": u.full_name or "Client H-Company", "email": _mask_email(u.email), "phone": _mask_phone(u.phone or "")} for u in rows]


@router.get("")
def mine(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Factures émises par moi + factures à mon nom (e-mail du compte) ou déjà payées par moi."""
    paid_codes = list(session.exec(select(MoneyTransfer.code).where(MoneyTransfer.payer_user_id == user.id)).all())
    rows = session.exec(select(Invoice).where(or_(Invoice.user_id == user.id, Invoice.client_email == (user.email or "").lower(), *([Invoice.client_phone == user.phone] if user.phone else []), Invoice.transfer_code.in_(paid_codes or [""])))
                        .order_by(Invoice.created_at.desc()).limit(200)).all()
    return [_read(session, i, user) for i in rows]


def _get(session: Session, code: str) -> Invoice:
    inv = session.exec(select(Invoice).where(Invoice.code == code.upper())).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    return inv


@router.get("/{code}")
def view(code: str, pay_op: str = "", session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    inv = _get(session, code)
    out = _read(session, inv, user)
    if out["status"] == "open":
        t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == inv.transfer_code)).first()
        q = svc.quote_receive(session, t.from_country, t.to_country, t.receive_amount, pay_op, t.provider_ref.split("|", 1)[1], domestic=t.from_country == t.to_country)
        q.pop("provider_cost", None)
        out["quote"] = q
    return out


class PayIn(BaseModel):
    pay_phone: str = Field(min_length=6, max_length=24)
    pay_operator: str


@router.post("/{code}/pay")
def pay(code: str, payload: PayIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    inv = _get(session, code)
    if inv.cancelled:
        raise HTTPException(status_code=409, detail="Cette facture a été annulée.")
    mr.pay_request(inv.transfer_code, mr.PayIn(pay_phone=payload.pay_phone, pay_operator=payload.pay_operator), session, user)
    session.refresh(inv)
    return _read(session, inv, user)


@router.post("/{code}/cancel")
def cancel(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    inv = _get(session, code)
    if inv.user_id != user.id:
        raise HTTPException(status_code=403, detail="Seul l'émetteur peut annuler.")
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == inv.transfer_code)).first()
    if t and t.status != "awaiting_payer":
        raise HTTPException(status_code=409, detail="Cette facture est déjà réglée ou clôturée.")
    inv.cancelled = True
    if t:
        t.status = "cancelled"; session.add(t)
    session.add(inv); session.commit()
    return _read(session, inv, user)


# ---------- Registre des paiements de services ----------

def record_service_payment(session: Session, *, service: str, ref: str, payer_user_id: int, payee_user_id: Optional[int], currency: str,
                           gross: float, commission_pct: float, transfer_ref: str = "", note: str = "") -> ServicePayment:
    """À appeler par chaque service (Shopping, Logement, Transport, Colis…) quand un client le règle via H-Money.
    Le brut est le chiffre d'affaires ; la commission est le bénéfice H-Company ; le reste revient au prestataire une fois le service rendu."""
    if gross <= 0 or not 0 <= commission_pct <= 100:
        raise HTTPException(status_code=422, detail="Montant ou commission invalide.")
    commission = round(gross * commission_pct / 100, 2)
    row = ServicePayment(service=service, ref=ref, payer_user_id=payer_user_id, payee_user_id=payee_user_id, currency=currency, gross=round(gross, 2),
                         commission=commission, net_to_payee=round(gross - commission, 2), transfer_ref=transfer_ref, note=note)
    session.add(row); session.commit(); session.refresh(row)
    return row


def _sp(r: ServicePayment) -> dict:
    return {"id": r.id, "service": r.service, "ref": r.ref, "currency": r.currency, "gross": r.gross, "commission": r.commission,
            "net_to_payee": r.net_to_payee, "status": r.status, "created_at": r.created_at.isoformat()}


@ledger_router.get("/earnings")
def my_earnings(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Revenus d'un prestataire (hôte, vendeur, agence…) : ce qu'il a encaissé via H-Money, par service."""
    rows = session.exec(select(ServicePayment).where(ServicePayment.payee_user_id == user.id).order_by(ServicePayment.created_at.desc()).limit(200)).all()
    by: dict = {}
    for r in rows:
        if r.status == "refunded":
            continue
        k = (r.service, r.currency)
        a = by.setdefault(k, {"service": r.service, "currency": r.currency, "gross": 0.0, "commission": 0.0, "net": 0.0, "count": 0})
        a["gross"] += r.gross; a["commission"] += r.commission; a["net"] += r.net_to_payee; a["count"] += 1
    return {"summary": [{**a, "gross": round(a["gross"], 2), "commission": round(a["commission"], 2), "net": round(a["net"], 2)} for a in by.values()], "items": [_sp(r) for r in rows]}


@ledger_router.get("/admin/service-revenue")
def admin_revenue(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    """Chiffre d'affaires et bénéfice H-Company par service."""
    rows = session.exec(select(ServicePayment.service, ServicePayment.currency, func.count(), func.sum(ServicePayment.gross), func.sum(ServicePayment.commission))
                        .where(ServicePayment.status != "refunded").group_by(ServicePayment.service, ServicePayment.currency)).all()
    return [{"service": s, "currency": c, "count": n, "gross": round(g or 0, 2), "profit": round(p or 0, 2)} for s, c, n, g, p in rows]
