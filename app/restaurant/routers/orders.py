"""HFood C2 — panier et commandes : devis public, checkout idempotent, suivi client, boîte de réception vendeur."""
import re
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_user
from app.models import User
from app.restaurant import limits as L, orders as od, services as svc
from app.restaurant.limits import limiter
from app.restaurant.models import SELLER_TRANSITIONS, FoodOrder, FoodSubOrder, Restaurant

router = APIRouter(prefix="/api/v1/restaurant", tags=["restaurant-orders"])
KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{8,64}$")


class LineIn(BaseModel):
    item_id: int = Field(ge=1)
    qty: int = Field(ge=1, le=10_000)
    price: Optional[float] = Field(default=None, ge=0, le=10_000_000)  # prix vu par le client : sert UNIQUEMENT à détecter un changement


class VendorIn(BaseModel):
    restaurant_id: int = Field(ge=1)
    fulfilment: Optional[Literal["delivery", "pickup"]] = None
    address: str = Field(default="", max_length=300)
    zone: str = Field(default="", max_length=80)
    note: str = Field(default="", max_length=500)
    lines: list[LineIn] = Field(min_length=1, max_length=L.CART_MAX_LINES)


class CartIn(BaseModel):
    vendors: list[VendorIn] = Field(min_length=1, max_length=L.CART_MAX_VENDORS)


class CheckoutIn(CartIn):
    contact_name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=30)
    note: str = Field(default="", max_length=500)
    accept_price_changes: bool = False

    @field_validator("contact_name", "phone", "note")
    @classmethod
    def _strip(cls, v: str) -> str:
        return " ".join(v.split()) if v else v


@router.post("/cart/quote")
@limiter.limit(lambda: L.RATE_QUOTE)
def quote(request: Request, payload: CartIn, session: Session = Depends(get_session)):
    """Revalide un panier (public, sans connexion) : prix, disponibilité, frais et conditions recalculés par le serveur."""
    return od.build(session, payload.vendors, checkout=False)


@router.post("/orders/checkout", status_code=201)
@limiter.limit(lambda: L.RATE_CHECKOUT)
def checkout(request: Request, payload: CheckoutIn, idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
             session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if not idempotency_key or not KEY_RE.match(idempotency_key):
        raise HTTPException(status_code=422, detail="En-tête Idempotency-Key requis (8 à 64 caractères : lettres, chiffres, - et _).")
    rhash = od.request_hash(payload, sorted(payload.vendors, key=lambda v: v.restaurant_id))

    def _existing() -> Optional[FoodOrder]:
        return session.exec(select(FoodOrder).where(FoodOrder.user_id == user.id, FoodOrder.idempotency_key == idempotency_key)).first()

    def _replay(o: FoodOrder):
        if o.request_hash != rhash:
            raise HTTPException(status_code=409, detail="Cette clé d'idempotence a déjà servi pour une commande différente.")
        return od.order_view(session, o, replayed=True)

    prior = _existing()
    if prior:
        return _replay(prior)
    pending = session.exec(select(func.count(FoodSubOrder.id)).join(FoodOrder, FoodOrder.id == FoodSubOrder.order_id).where(FoodOrder.user_id == user.id, FoodSubOrder.status == "pending")).one()
    if pending >= L.ORDER_MAX_ACTIVE:
        raise HTTPException(status_code=409, detail="Trop de commandes en attente : attendez la réponse des vendeurs ou annulez-en une.")

    view = od.build(session, payload.vendors, checkout=True, accept_price_changes=payload.accept_price_changes)
    if not view["ok"]:
        raise HTTPException(status_code=409, detail={"code": "cart_changed", "message": "Votre panier a changé : vérifiez-le avant de commander.", "cart": view})
    try:
        order = od.create_order(session, user.id, payload, view, idempotency_key, rhash)
        subs = session.exec(select(FoodSubOrder).where(FoodSubOrder.order_id == order.id)).all()
        for s in subs:
            r = session.get(Restaurant, s.restaurant_id)
            owner = session.get(User, r.owner_id) if r else None
            svc.notify(session, r.owner_id if r else None, "Nouvelle commande", f"{order.contact_name} · {s.items_total:g} {order.currency} · {'livraison' if s.fulfilment == 'delivery' else 'retrait'} ({s.code}).", owner.email if owner else None)
        svc.notify(session, user.id, "Commande envoyée", f"{len(subs)} vendeur(s) ont reçu votre commande. Code {order.code}. Le paiement se fait directement avec chaque vendeur.", email=user.email)
        session.commit()
    except IntegrityError:  # deux envois simultanés avec la même clé : le second retombe sur la commande du premier
        session.rollback()
        prior = _existing()
        if prior:
            return _replay(prior)
        raise HTTPException(status_code=409, detail="Commande déjà en cours de création, réessayez.")
    session.refresh(order)
    return od.order_view(session, order)


@router.get("/me/orders")
def my_orders(offset: int = Query(default=0, ge=0), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(FoodOrder).where(FoodOrder.user_id == user.id).order_by(FoodOrder.id.desc()).offset(offset).limit(30)).all()
    return {"orders": [od.order_view(session, o) for o in rows]}


def _mine_order(session: Session, code: str, user: User) -> FoodOrder:
    o = session.exec(select(FoodOrder).where(FoodOrder.code == code)).first()
    if not o or o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return o


@router.get("/me/orders/{code}")
def my_order(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return od.order_view(session, _mine_order(session, code, user))


@router.post("/me/suborders/{code}/cancel")
@limiter.limit(lambda: L.RATE_CANCEL)
def cancel_suborder(request: Request, code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Le client annule SA sous-commande tant que le vendeur n'a pas répondu ; les autres sous-commandes ne sont pas touchées."""
    s = session.exec(select(FoodSubOrder).where(FoodSubOrder.code == code)).first()
    o = session.get(FoodOrder, s.order_id) if s else None
    if not s or not o or o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    res = session.execute(sa_update(FoodSubOrder).where(FoodSubOrder.id == s.id, FoodSubOrder.status == "pending").values(status="cancelled", updated_at=datetime.utcnow()))
    if res.rowcount != 1:
        raise HTTPException(status_code=409, detail="Cette commande a déjà reçu une réponse du vendeur : contactez-le directement.")
    od.cancel_open_proposals(session, s.id, "Commande annulée par le client")
    r = session.get(Restaurant, s.restaurant_id)
    svc.notify(session, r.owner_id if r else None, "Commande annulée", f"Le client a annulé la commande {s.code}.", email=_email(session, r.owner_id if r else None))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s)


def _email(session: Session, user_id: Optional[int]) -> Optional[str]:
    u = session.get(User, user_id) if user_id else None
    return (u.email or None) if u else None


# ───────────────────────── Espace vendeur (boîte de réception minimale ; la suite : phase D) ─────────────────────────

def _seller_sub(session: Session, code: str, user: User) -> tuple[FoodSubOrder, FoodOrder]:
    s = session.exec(select(FoodSubOrder).where(FoodSubOrder.code == code)).first()
    r = session.get(Restaurant, s.restaurant_id) if s else None
    if not s or not r or r.owner_id != user.id:  # 404 (et non 403) : on ne révèle pas l'existence d'une commande d'un autre vendeur
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return s, session.get(FoodOrder, s.order_id)


@router.get("/seller/orders")
def seller_orders(status: Optional[str] = None, offset: int = Query(default=0, ge=0), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    q = select(FoodSubOrder).join(Restaurant, Restaurant.id == FoodSubOrder.restaurant_id).where(Restaurant.owner_id == user.id)
    if status:
        q = q.where(FoodSubOrder.status == status)
    rows = session.exec(q.order_by(FoodSubOrder.id.desc()).offset(offset).limit(50)).all()
    out = []
    for s in rows:
        o = session.get(FoodOrder, s.order_id)
        out.append(od.sub_view(session, s, seller=True, order=o))
    return {"orders": out}


class DecisionIn(BaseModel):
    action: Literal["accept", "decline"]
    reason: str = Field(default="", max_length=300)

    @field_validator("reason")
    @classmethod
    def _r(cls, v: str) -> str:
        return " ".join(v.split())


@router.post("/seller/orders/{code}/decision")
@limiter.limit(lambda: L.RATE_OWNER_ACT)
def seller_decision(request: Request, code: str, payload: DecisionIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Accepter ou refuser UNE sous-commande en attente. Un refus n'affecte aucune autre sous-commande de la même commande."""
    s, o = _seller_sub(session, code, user)
    if payload.action == "decline" and not payload.reason:
        raise HTTPException(status_code=422, detail="Indiquez un motif de refus : le client le recevra.")
    new = "accepted" if payload.action == "accept" else "declined"
    res = session.execute(sa_update(FoodSubOrder).where(FoodSubOrder.id == s.id, FoodSubOrder.status == "pending").values(status=new, decline_reason=payload.reason or None, updated_at=datetime.utcnow()))
    if res.rowcount != 1:
        raise HTTPException(status_code=409, detail="Cette commande n'est plus en attente.")
    if new == "declined":
        od.cancel_open_proposals(session, s.id, "Commande refusée")
    msg = f"{s.restaurant_name} a accepté votre commande ({s.code}). Convenez de la livraison et du paiement directement avec le vendeur." if new == "accepted" else f"{s.restaurant_name} ne peut pas honorer votre commande ({s.code}). Motif : {payload.reason}"
    svc.notify(session, o.user_id, "Commande acceptée" if new == "accepted" else "Commande refusée", msg, email=_email(session, o.user_id))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s, seller=True, order=o)


# ───────────────────────── D1 : suivi de commande et paiement manuel ─────────────────────────

class StatusIn(BaseModel):
    status: Literal["preparing", "ready", "completed", "cancelled"]
    reason: str = Field(default="", max_length=300)

    @field_validator("reason")
    @classmethod
    def _r(cls, v: str) -> str:
        return " ".join(v.split())


_STATUS_MSG = {"preparing": ("Commande en préparation", "{v} prépare votre commande ({c})."), "ready": ("Commande prête", "Votre commande {c} chez {v} est prête. Convenez de la remise ou de la livraison directement avec le vendeur."), "completed": ("Commande terminée", "La commande {c} chez {v} est terminée. Merci !"), "cancelled": ("Commande annulée par le vendeur", "{v} a annulé la commande {c}.")}


@router.post("/seller/orders/{code}/status")
@limiter.limit(lambda: L.RATE_OWNER_ACT)
def seller_status(request: Request, code: str, payload: StatusIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Fait avancer UNE sous-commande acceptée (préparation → prête → terminée) ou l'annule avec un motif. Transition atomique ; les autres vendeurs ne sont pas touchés."""
    s, o = _seller_sub(session, code, user)
    if payload.status == "cancelled" and not payload.reason:
        raise HTTPException(status_code=422, detail="Indiquez un motif d'annulation : le client le recevra.")
    allowed_from = [cur for cur, nxt in SELLER_TRANSITIONS.items() if payload.status in nxt]
    od.expire_due(session, s.id)
    if payload.status in ("ready", "completed") and od.open_proposal(session, s.id):
        raise HTTPException(status_code=409, detail="Une proposition de modification attend la réponse du client : annulez-la ou attendez sa décision.")
    res = session.execute(sa_update(FoodSubOrder).where(FoodSubOrder.id == s.id, FoodSubOrder.status.in_(allowed_from)).values(status=payload.status, status_note=payload.reason or None, updated_at=datetime.utcnow()))
    if res.rowcount != 1:
        raise HTTPException(status_code=409, detail="Ce changement de statut n'est pas possible depuis l'état actuel de la commande.")
    if payload.status == "cancelled":
        od.cancel_open_proposals(session, s.id, "Commande annulée")
    title, body = _STATUS_MSG[payload.status]
    body = body.format(v=s.restaurant_name, c=s.code) + (f" Motif : {payload.reason}" if payload.reason else "")
    svc.notify(session, o.user_id, title, body, email=_email(session, o.user_id))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s, seller=True, order=o)


class PayDeclareIn(BaseModel):
    method: str = Field(default="", max_length=60)
    reference: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=300)

    @field_validator("method", "reference", "note")
    @classmethod
    def _c(cls, v: str) -> str:
        return " ".join(v.split())


@router.post("/me/suborders/{code}/payment")
@limiter.limit(lambda: L.RATE_CANCEL)
def declare_payment(request: Request, code: str, payload: PayDeclareIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Le client DÉCLARE avoir payé le vendeur (paiement manuel, hors HFood). Rien n'est encaissé ni vérifié ici : c'est le vendeur qui confirme."""
    s = session.exec(select(FoodSubOrder).where(FoodSubOrder.code == code)).first()
    o = session.get(FoodOrder, s.order_id) if s else None
    if not s or not o or o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    od.expire_due(session, s.id)
    if od.open_proposal(session, s.id):
        raise HTTPException(status_code=409, detail="Une modification proposée par le vendeur attend votre réponse : acceptez-la ou refusez-la avant de déclarer un paiement.")
    res = session.execute(sa_update(FoodSubOrder).where(FoodSubOrder.id == s.id, FoodSubOrder.payment_status == "unpaid", FoodSubOrder.status.in_(("accepted", "preparing", "ready", "completed"))).values(payment_status="declared", payment_method=payload.method or None, payment_ref=payload.reference or None, payment_note=payload.note or None, updated_at=datetime.utcnow()))
    if res.rowcount != 1:
        raise HTTPException(status_code=409, detail="Le paiement ne peut être déclaré qu'une fois la commande acceptée, et une seule fois.")
    r = session.get(Restaurant, s.restaurant_id)
    svc.notify(session, r.owner_id if r else None, "Paiement déclaré", f"Le client indique avoir payé la commande {s.code}. Vérifiez la réception puis confirmez.", email=_email(session, r.owner_id if r else None))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s)


class PayDecisionIn(BaseModel):
    action: Literal["confirm", "reject"]
    note: str = Field(default="", max_length=300)

    @field_validator("note")
    @classmethod
    def _n(cls, v: str) -> str:
        return " ".join(v.split())


@router.post("/seller/orders/{code}/payment")
@limiter.limit(lambda: L.RATE_OWNER_ACT)
def seller_payment(request: Request, code: str, payload: PayDecisionIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Le vendeur confirme avoir reçu le paiement (ou le conteste : retour à « à régler »). Seule action qui change `payment_status` côté vendeur ; jamais automatique."""
    s, o = _seller_sub(session, code, user)
    if payload.action == "reject" and not payload.note:
        raise HTTPException(status_code=422, detail="Indiquez pourquoi le paiement n'est pas reçu : le client le verra.")
    od.expire_due(session, s.id)
    if payload.action == "confirm" and od.open_proposal(session, s.id):
        raise HTTPException(status_code=409, detail="Une proposition de modification est en attente : le total n'est pas définitif.")
    if payload.action == "confirm":
        frm, to = ("unpaid", "declared"), "confirmed"  # le vendeur peut aussi confirmer un paiement reçu en main propre sans déclaration préalable
    else:
        frm, to = ("declared",), "unpaid"
    res = session.execute(sa_update(FoodSubOrder).where(FoodSubOrder.id == s.id, FoodSubOrder.payment_status.in_(frm), FoodSubOrder.status.in_(("accepted", "preparing", "ready", "completed"))).values(payment_status=to, payment_note=payload.note or s.payment_note, updated_at=datetime.utcnow()))
    if res.rowcount != 1:
        raise HTTPException(status_code=409, detail="Ce changement de paiement n'est pas possible dans l'état actuel.")
    title, body = ("Paiement confirmé", f"{s.restaurant_name} confirme avoir reçu votre paiement ({s.code}).") if to == "confirmed" else ("Paiement non reçu", f"{s.restaurant_name} indique ne pas avoir reçu votre paiement ({s.code}). Motif : {payload.note}")
    svc.notify(session, o.user_id, title, body, email=_email(session, o.user_id))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s, seller=True, order=o)


# ───────────────────────── D2 : propositions de modification ─────────────────────────

class ChangeIn(BaseModel):
    line_id: int = Field(ge=1)
    qty: int = Field(ge=0, le=10_000)  # 0 = retirer la ligne


class ProposalIn(BaseModel):
    message: str = Field(default="", max_length=400)
    changes: list[ChangeIn] = Field(min_length=1, max_length=L.CART_MAX_LINES)

    @field_validator("message")
    @classmethod
    def _m(cls, v: str) -> str:
        return " ".join(v.split())


@router.post("/seller/orders/{code}/proposals", status_code=201)
@limiter.limit(lambda: L.RATE_OWNER_ACT)
def seller_propose(request: Request, code: str, payload: ProposalIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Le vendeur propose de réduire/retirer des lignes. Rien n'est modifié tant que le client n'a pas accepté."""
    s, o = _seller_sub(session, code, user)
    ids = [c.line_id for c in payload.changes]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=422, detail="Une ligne ne peut apparaître qu'une fois.")
    p = od.create_proposal(session, s, {c.line_id: c.qty for c in payload.changes}, payload.message)
    svc.notify(session, o.user_id, "Modification proposée", f"{s.restaurant_name} propose de modifier votre commande {s.code} (nouveau sous-total : {p.items_total_after:g} {o.currency}). Acceptez ou refusez depuis « Mes commandes ».", email=_email(session, o.user_id))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s, seller=True, order=o)


@router.post("/seller/orders/{code}/proposals/cancel")
@limiter.limit(lambda: L.RATE_OWNER_ACT)
def seller_cancel_proposal(request: Request, code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    s, o = _seller_sub(session, code, user)
    res = session.execute(od.sa_update_proposal().where(od.FoodOrderProposal.sub_order_id == s.id, od.FoodOrderProposal.status == "pending").values(status="cancelled", decision_note="Retirée par le vendeur", decided_at=datetime.utcnow()))
    if res.rowcount != 1:
        raise HTTPException(status_code=409, detail="Aucune proposition en attente.")
    svc.notify(session, o.user_id, "Proposition retirée", f"{s.restaurant_name} a retiré sa proposition de modification ({s.code}). Votre commande reste inchangée.", email=_email(session, o.user_id))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s, seller=True, order=o)


class ProposalDecisionIn(BaseModel):
    action: Literal["accept", "decline"]
    note: str = Field(default="", max_length=300)

    @field_validator("note")
    @classmethod
    def _n(cls, v: str) -> str:
        return " ".join(v.split())


@router.post("/me/suborders/{code}/proposals/{pid}/decision")
@limiter.limit(lambda: L.RATE_CANCEL)
def decide_proposal(request: Request, code: str, pid: int, payload: ProposalDecisionIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Le client accepte (la commande est alors modifiée, totaux recalculés par le serveur) ou refuse (la commande reste inchangée). Décision unique et atomique."""
    s = session.exec(select(FoodSubOrder).where(FoodSubOrder.code == code)).first()
    o = session.get(FoodOrder, s.order_id) if s else None
    p = session.get(od.FoodOrderProposal, pid)
    if not s or not o or o.user_id != user.id or not p or p.sub_order_id != s.id:
        raise HTTPException(status_code=404, detail="Proposition introuvable.")
    od.expire_due(session, s.id)
    new = "accepted" if payload.action == "accept" else "declined"
    if new == "accepted":
        # la commande doit encore être modifiable au moment précis de l'acceptation
        ok = session.execute(sa_update(FoodSubOrder).where(FoodSubOrder.id == s.id, FoodSubOrder.status.in_(od.PROPOSABLE), FoodSubOrder.payment_status == "unpaid").values(updated_at=datetime.utcnow())).rowcount == 1
        if not ok:
            od.cancel_open_proposals(session, s.id, "Commande plus modifiable")
            session.commit()
            raise HTTPException(status_code=409, detail="Cette commande ne peut plus être modifiée.")
    res = session.execute(od.sa_update_proposal().where(od.FoodOrderProposal.id == p.id, od.FoodOrderProposal.status == "pending").values(status=new, decision_note=payload.note or None, decided_at=datetime.utcnow()))
    if res.rowcount != 1:
        session.rollback()
        raise HTTPException(status_code=409, detail="Cette proposition n'est plus en attente (déjà traitée, retirée ou expirée).")
    session.refresh(p)
    if new == "accepted":
        session.refresh(s)
        od.apply_proposal(session, s, o, p)
    r = session.get(Restaurant, s.restaurant_id)
    title, body = ("Modification acceptée", f"Le client a accepté la modification de la commande {s.code} (nouveau sous-total : {p.items_total_after:g} {o.currency}).") if new == "accepted" else ("Modification refusée", f"Le client a refusé la modification de la commande {s.code}." + (f" Motif : {payload.note}" if payload.note else "") + " La commande reste inchangée ; contactez-le si besoin.")
    svc.notify(session, r.owner_id if r else None, title, body, email=_email(session, r.owner_id if r else None))
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s)
