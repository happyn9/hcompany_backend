"""H-Restaurant — administration : validation des restaurants, mise en avant, vue d'ensemble."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_admin
from app.models import User
from app.restaurant import services as svc
from app.restaurant.models import RESTAURANT_STATUSES, DiningTable, MenuItem, Reservation, Restaurant

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
    })
    return d


@router.get("/overview")
def overview(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    counts = {s: int(session.exec(select(func.count(Restaurant.id)).where(Restaurant.status == s)).one()) for s in RESTAURANT_STATUSES}
    cutoff = svc.local_now().date() - timedelta(days=30)
    rows = session.exec(select(Reservation).where(Reservation.day >= cutoff)).all()
    return {
        "restaurants": counts, "reservations_30d": len(rows), "covers_30d": sum(x.party_size for x in rows if x.status in ("seated", "completed")),
        "no_show_30d": sum(1 for x in rows if x.status == "no_show"), "preorder_value_30d": round(sum(x.preorder_total for x in rows if x.status in ("seated", "completed")), 2),
    }


@router.get("/restaurants")
def list_restaurants(status: Optional[str] = None, q: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(Restaurant)
    if status:
        stmt = stmt.where(Restaurant.status == status)
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
def approve(rid: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    r = _get(session, rid)
    if r.status not in ("pending", "suspended", "rejected"):
        raise HTTPException(status_code=409, detail="Ce restaurant n'est pas en attente.")
    r.status, r.status_reason, r.approved_at = "active", None, datetime.utcnow()
    session.add(r)
    owner = session.get(User, r.owner_id)
    svc.notify(session, r.owner_id, "Restaurant validé", f"« {r.name} » est en ligne : les clients peuvent réserver.", owner.email if owner else None)
    session.commit()
    return _row(session, r)


@router.post("/restaurants/{rid}/reject")
def reject(rid: int, p: DecisionIn, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    r = _get(session, rid)
    if r.status != "pending":
        raise HTTPException(status_code=409, detail="Ce restaurant n'est pas en attente.")
    if not p.reason.strip():
        raise HTTPException(status_code=422, detail="Indiquez ce qu'il faut corriger.")
    r.status, r.status_reason = "rejected", p.reason.strip()
    session.add(r)
    owner = session.get(User, r.owner_id)
    svc.notify(session, r.owner_id, "Restaurant à corriger", f"« {r.name} » : {r.status_reason}", owner.email if owner else None)
    session.commit()
    return _row(session, r)


@router.post("/restaurants/{rid}/suspend")
def suspend(rid: int, p: DecisionIn, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    r = _get(session, rid)
    r.status, r.status_reason = "suspended", p.reason.strip() or None
    session.add(r)
    svc.notify(session, r.owner_id, "Restaurant suspendu", f"« {r.name} » a été suspendu. {r.status_reason or ''}".strip())
    session.commit()
    return _row(session, r)


@router.post("/restaurants/{rid}/feature")
def feature(rid: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    r = _get(session, rid)
    r.is_featured = not r.is_featured
    session.add(r)
    session.commit()
    return _row(session, r)
