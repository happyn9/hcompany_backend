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
from app.restaurant.models import FoodOrder, FoodSubOrder, Restaurant

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
        svc.notify(session, user.id, "Commande envoyée", f"{len(subs)} vendeur(s) ont reçu votre commande. Code {order.code}. Le paiement se fait directement avec chaque vendeur.")
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
    r = session.get(Restaurant, s.restaurant_id)
    svc.notify(session, r.owner_id if r else None, "Commande annulée", f"Le client a annulé la commande {s.code}.")
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s)


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
    msg = f"{s.restaurant_name} a accepté votre commande ({s.code}). Convenez de la livraison et du paiement directement avec le vendeur." if new == "accepted" else f"{s.restaurant_name} ne peut pas honorer votre commande ({s.code}). Motif : {payload.reason}"
    svc.notify(session, o.user_id, "Commande acceptée" if new == "accepted" else "Commande refusée", msg)
    session.commit()
    session.refresh(s)
    return od.sub_view(session, s, seller=True, order=o)
