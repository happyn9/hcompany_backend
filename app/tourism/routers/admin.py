"""H-Tourisme — administration : validation des excursions, mise en avant, vue d'ensemble."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_admin
from app.models import User
from app.tourism import services as svc
from app.tourism.models import TOUR_STATUSES, Tour, TourBooking, TourDeparture

router = APIRouter(prefix="/api/v1/tourism/admin", tags=["tourism-admin"])


class DecisionIn(BaseModel):
    reason: str = Field(default="", max_length=300)


def _row(session: Session, t: Tour) -> dict:
    owner = session.get(User, t.owner_id)
    d = svc.card(session, t, [])
    d.update({
        "status": t.status, "status_reason": t.status_reason, "owner": {"id": t.owner_id, "name": owner.full_name if owner else "", "email": owner.email if owner else ""},
        "meeting_point": t.meeting_point, "phone": t.phone, "created_at": t.created_at.isoformat(), "images": svc.images_of(session, t.id),
        "departures": int(session.exec(select(func.count(TourDeparture.id)).where(TourDeparture.tour_id == t.id, TourDeparture.day >= svc.local_now().date())).one()),
    })
    return d


def _get(session: Session, tid: int) -> Tour:
    t = session.get(Tour, tid)
    if not t:
        raise HTTPException(status_code=404, detail="Excursion introuvable.")
    return t


@router.get("/overview")
def overview(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    counts = {s: int(session.exec(select(func.count(Tour.id)).where(Tour.status == s)).one()) for s in TOUR_STATUSES}
    cutoff = svc.local_now().date() - timedelta(days=30)
    rows = session.exec(select(TourBooking).where(TourBooking.day >= cutoff)).all()
    honoured = [x for x in rows if x.status in ("confirmed", "completed")]
    return {
        "tours": counts, "bookings_30d": len(rows), "travellers_30d": sum(x.adults + x.children for x in honoured),
        "no_show_30d": sum(1 for x in rows if x.status == "no_show"), "value_30d": round(sum(x.total for x in honoured), 2),
    }


@router.get("/tours")
def list_tours(status: Optional[str] = None, q: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(Tour)
    if status:
        stmt = stmt.where(Tour.status == status)
    if q:
        stmt = stmt.where(Tour.title.ilike(f"%{q.strip()}%"))
    return [_row(session, t) for t in session.exec(stmt.order_by(Tour.created_at.desc()).limit(200)).all()]


@router.post("/tours/{tid}/approve")
def approve(tid: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    t = _get(session, tid)
    if t.status not in ("pending", "suspended", "rejected"):
        raise HTTPException(status_code=409, detail="Cette excursion n'est pas en attente.")
    t.status, t.status_reason, t.approved_at = "active", None, datetime.utcnow()
    session.add(t)
    owner = session.get(User, t.owner_id)
    svc.notify(session, t.owner_id, "Excursion validée", f"« {t.title} » est en ligne : les voyageurs peuvent réserver.", owner.email if owner else None)
    session.commit()
    return _row(session, t)


@router.post("/tours/{tid}/reject")
def reject(tid: int, p: DecisionIn, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    t = _get(session, tid)
    if t.status != "pending":
        raise HTTPException(status_code=409, detail="Cette excursion n'est pas en attente.")
    if not p.reason.strip():
        raise HTTPException(status_code=422, detail="Indiquez ce qu'il faut corriger.")
    t.status, t.status_reason = "rejected", p.reason.strip()
    session.add(t)
    owner = session.get(User, t.owner_id)
    svc.notify(session, t.owner_id, "Excursion à corriger", f"« {t.title} » : {t.status_reason}", owner.email if owner else None)
    session.commit()
    return _row(session, t)


@router.post("/tours/{tid}/suspend")
def suspend(tid: int, p: DecisionIn, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    t = _get(session, tid)
    t.status, t.status_reason = "suspended", p.reason.strip() or None
    session.add(t)
    svc.notify(session, t.owner_id, "Excursion suspendue", f"« {t.title} » a été suspendue. {t.status_reason or ''}".strip())
    session.commit()
    return _row(session, t)


@router.post("/tours/{tid}/feature")
def feature(tid: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    t = _get(session, tid)
    t.is_featured = not t.is_featured
    session.add(t)
    session.commit()
    return _row(session, t)
