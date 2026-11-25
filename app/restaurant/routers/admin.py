"""H-Restaurant — administration : validation des restaurants, mise en avant, vue d'ensemble.

A1.2 : TOUTES les routes de ce routeur exigent `require_admin_confirmed` (rôle admin + confirmation
récente par mot de passe, en-tête X-Admin-Confirm) — même règle que `overview`, sans exception."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from app.database import get_session
from app.admin_security import require_admin_confirmed
from app.models import User
from app.restaurant import services as svc
from app.restaurant.models import SELLER_TYPES
from app.restaurant.models import ORDER_STATUSES, RESTAURANT_STATUSES, DiningTable, FoodOrderReview, FoodSubOrder, MenuItem, Reservation, Restaurant

router = APIRouter(prefix="/api/v1/restaurant/admin", tags=["restaurant-admin"])


def _row(session: Session, r: Restaurant) -> dict:
    owner = session.get(User, r.owner_id)
    d = svc.card(session, r)
    d.update({
        "status": r.status, "status_reason": r.status_reason, "owner": {"id": r.owner_id, "name": owner.full_name if owner else "", "email": owner.email if owner else ""},
        "address": r.address, "phone": r.phone, "created_at": r.created_at.isoformat(),
        "tables": int(session.exec(select(func.count(DiningTable.id)).where(DiningTable.restaurant_id == r.id, DiningTable.is_active == True)).one()),  # noqa: E712
        "dishes": int(session.exec(select(func.count(MenuItem.id)).where(MenuItem.restaurant_id == r.id)).one()),
        "images": svc.images_of(session, r.id),
        "seller_type": r.seller_type or "restaurant", "offers_delivery": bool(r.offers_delivery),
    })
    return d


@router.get("/overview")
def overview(session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    counts = {s: int(session.exec(select(func.count(Restaurant.id)).where(Restaurant.status == s)).one()) for s in RESTAURANT_STATUSES}
    cutoff = svc.local_now().date() - timedelta(days=30)
    rows = session.exec(select(Reservation).where(Reservation.day >= cutoff)).all()
    return {
        "restaurants": counts, "reservations_30d": len(rows), "covers_30d": sum(x.party_size for x in rows if x.status in ("seated", "completed")),
        "no_show_30d": sum(1 for x in rows if x.status == "no_show"), "preorder_value_30d": round(sum(x.preorder_total for x in rows if x.status in ("seated", "completed")), 2),
    }


@router.get("/restaurants")
def list_restaurants(status: Optional[str] = None, q: Optional[str] = None, seller_type: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    stmt = select(Restaurant)
    if status:
        stmt = stmt.where(Restaurant.status == status)
    if seller_type in SELLER_TYPES:
        stmt = stmt.where(Restaurant.seller_type == seller_type)
    if q:
        stmt = stmt.where(Restaurant.name.ilike(f"%{q.strip()}%"))
    return [_row(session, r) for r in session.exec(stmt.order_by(Restaurant.created_at.desc()).limit(200)).all()]


class DecisionIn(BaseModel):
    reason: str = Field(default="", max_length=300)


def _get(session: Session, rid: int) -> Restaurant:
    r = session.get(Restaurant, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Restaurant introuvable.")
    return r


@router.post("/restaurants/{rid}/approve")
def approve(rid: int, session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    r = _get(session, rid)
    if r.status not in ("pending", "suspended", "rejected"):
        raise HTTPException(status_code=409, detail=("Cette fiche" if svc.is_individual(r) else "Ce restaurant") + " n'est pas en attente.")
    r.status, r.status_reason, r.approved_at = "active", None, datetime.utcnow()
    session.add(r)
    owner = session.get(User, r.owner_id)
    if svc.is_individual(r):  # F2 : jamais « réserver » pour un vendeur individuel
        svc.notify(session, r.owner_id, "Fiche vendeur validée", f"« {r.name} » est en ligne : les clients peuvent consulter vos plats et vos conditions de livraison, puis vous contacter directement.", owner.email if owner else None)
    else:
        svc.notify(session, r.owner_id, "Restaurant validé", f"« {r.name} » est en ligne : les clients peuvent réserver.", owner.email if owner else None)
    session.commit()
    return _row(session, r)


@router.post("/restaurants/{rid}/reject")
def reject(rid: int, p: DecisionIn, session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    r = _get(session, rid)
    if r.status != "pending":
        raise HTTPException(status_code=409, detail=("Cette fiche" if svc.is_individual(r) else "Ce restaurant") + " n'est pas en attente.")
    if not p.reason.strip():
        raise HTTPException(status_code=422, detail="Indiquez ce qu'il faut corriger.")
    r.status, r.status_reason = "rejected", p.reason.strip()
    session.add(r)
    owner = session.get(User, r.owner_id)
    svc.notify(session, r.owner_id, "Fiche vendeur à corriger" if svc.is_individual(r) else "Restaurant à corriger", f"« {r.name} » : {r.status_reason}", owner.email if owner else None)
    session.commit()
    return _row(session, r)


@router.post("/restaurants/{rid}/suspend")
def suspend(rid: int, p: DecisionIn, session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    r = _get(session, rid)
    r.status, r.status_reason = "suspended", p.reason.strip() or None
    session.add(r)
    svc.notify(session, r.owner_id, "Fiche vendeur suspendue" if svc.is_individual(r) else "Restaurant suspendu", f"« {r.name} » a été suspendu. {r.status_reason or ''}".strip())
    session.commit()
    return _row(session, r)


@router.post("/restaurants/{rid}/feature")
def feature(rid: int, session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    r = _get(session, rid)
    r.is_featured = not r.is_featured
    session.add(r)
    session.commit()
    return _row(session, r)


# E : supervision des commandes et modération des avis de commande

@router.get("/orders/summary")
def orders_summary(session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    cutoff = datetime.utcnow() - timedelta(days=30)
    by_status = {st: int(session.exec(select(func.count(FoodSubOrder.id)).where(FoodSubOrder.status == st, FoodSubOrder.created_at >= cutoff)).one()) for st in ORDER_STATUSES}
    pay = {p: int(session.exec(select(func.count(FoodSubOrder.id)).where(FoodSubOrder.payment_status == p, FoodSubOrder.created_at >= cutoff)).one()) for p in ("unpaid", "declared", "confirmed")}
    stale = datetime.utcnow() - timedelta(hours=48)
    pending_old = int(session.exec(select(func.count(FoodSubOrder.id)).where(FoodSubOrder.status == "pending", FoodSubOrder.created_at <= stale)).one())
    declared_old = int(session.exec(select(func.count(FoodSubOrder.id)).where(FoodSubOrder.payment_status == "declared", FoodSubOrder.updated_at <= stale)).one())
    return {"days": 30, "by_status": by_status, "by_payment": pay, "problems": {"pending_over_48h": pending_old, "payment_declared_over_48h": declared_old}}


@router.get("/reviews")
def list_reviews(hidden: Optional[bool] = None, session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    stmt = select(FoodOrderReview)
    if hidden is not None:
        stmt = stmt.where(FoodOrderReview.hidden == hidden)
    out = []
    for x in session.exec(stmt.order_by(FoodOrderReview.id.desc()).limit(100)).all():
        r, u = session.get(Restaurant, x.restaurant_id), session.get(User, x.user_id)
        out.append({"id": x.id, "restaurant_id": x.restaurant_id, "restaurant_name": r.name if r else "", "rating": x.rating, "comment": x.comment, "author": (u.full_name if u else "") or "", "hidden": x.hidden, "hidden_reason": x.hidden_reason, "created_at": x.created_at.isoformat()})
    return out


@router.post("/reviews/{review_id}/{action}")
def moderate_review(review_id: int, action: str, p: DecisionIn, session: Session = Depends(get_session), _a: User = Depends(require_admin_confirmed)):
    if action not in ("hide", "unhide"):
        raise HTTPException(status_code=404, detail="Action inconnue.")
    x = session.get(FoodOrderReview, review_id)
    if not x:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    if action == "hide" and not p.reason.strip():
        raise HTTPException(status_code=422, detail="Indiquez le motif du masquage.")
    x.hidden, x.hidden_reason = action == "hide", (p.reason.strip() or None) if action == "hide" else None
    session.add(x)
    r = session.get(Restaurant, x.restaurant_id)
    if r:
        svc.refresh_rating(session, r)
    session.commit()
    return {"id": x.id, "hidden": x.hidden}
