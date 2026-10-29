"""H-Restaurant — côté client : recherche, fiche, plan de salle & disponibilité, réservations, avis."""
import math
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.deps import get_current_user, get_optional_user
from app.models import User
from app.restaurant import services as svc
from app.restaurant.models import (
    BLOCKING_STATUSES, CUISINES, DiningTable, Reservation, Restaurant, RestaurantReview,
)

router = APIRouter(prefix="/api/v1/restaurant", tags=["restaurant"])


def _live():
    return select(Restaurant).where(Restaurant.status == "active")


def _get_live(session: Session, rid: int) -> Restaurant:
    r = session.get(Restaurant, rid)
    if not r or r.status != "active":
        raise HTTPException(status_code=404, detail="Restaurant introuvable.")
    return r


@router.get("/home")
def home(session: Session = Depends(get_session)):
    live = session.exec(_live().order_by(Restaurant.is_featured.desc(), Restaurant.rating_avg.desc(), Restaurant.id.desc()).limit(12)).all()
    cities = session.exec(select(Restaurant.city, func.count(Restaurant.id)).where(Restaurant.status == "active", Restaurant.city != "").group_by(Restaurant.city).order_by(func.count(Restaurant.id).desc())).all()
    total = session.exec(select(func.count(Restaurant.id)).where(Restaurant.status == "active")).one()
    cuisines: dict[str, int] = {}
    for c in session.exec(select(Restaurant.cuisines).where(Restaurant.status == "active")).all():
        for k in (c or "").split(","):
            if k in CUISINES:
                cuisines[k] = cuisines.get(k, 0) + 1
    return {"featured": [svc.card(session, r) for r in live], "cities": [{"city": c, "count": int(n)} for c, n in cities], "cuisines": [{"key": k, "count": n} for k, n in sorted(cuisines.items(), key=lambda kv: -kv[1])], "total": int(total)}


@router.get("/search")
def search(
    q: Optional[str] = None, city: Optional[str] = None, cuisine: Optional[str] = None, price: Optional[int] = Query(default=None, ge=1, le=3),
    day: Optional[date] = None, time: Optional[str] = None, party: int = Query(default=2, ge=1, le=40), sort: str = "recommended",
    page: int = Query(default=1, ge=1), per_page: int = Query(default=12, ge=1, le=48), session: Session = Depends(get_session),
):
    stmt = _live()
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Restaurant.name.ilike(like), Restaurant.city.ilike(like), Restaurant.area.ilike(like), Restaurant.summary.ilike(like), Restaurant.cuisines.ilike(like)))
    if city:
        stmt = stmt.where(func.lower(Restaurant.city) == city.strip().lower())
    if cuisine and cuisine in CUISINES:
        stmt = stmt.where(Restaurant.cuisines.like(f"%{cuisine}%"))
    if price:
        stmt = stmt.where(Restaurant.price_level == price)
    order = {"rating": (Restaurant.rating_avg.desc(),), "price_asc": (Restaurant.price_level.asc(),), "price_desc": (Restaurant.price_level.desc(),)}.get(sort, (Restaurant.is_featured.desc(), Restaurant.rating_avg.desc()))
    rows = session.exec(stmt.order_by(*order, Restaurant.id.desc()).limit(300)).all()
    free_by = {}
    if day and time:
        kept = []
        for r in rows:
            try:
                svc.check_slot(r, day, time)
            except HTTPException:
                continue
            n = sum(1 for t in svc.tables_for_slot(session, r, day, time, party) if t["status"] == "free")
            if n:
                free_by[r.id] = n
                kept.append(r)
        rows = kept
    total = len(rows)
    page_rows = rows[(page - 1) * per_page: page * per_page]
    return {"items": [svc.card(session, r, free_by.get(r.id)) for r in page_rows], "total": total, "page": page, "pages": max(1, math.ceil(total / per_page))}


@router.get("/restaurants/{slug}")
def restaurant_detail(slug: str, session: Session = Depends(get_session)):
    r = session.exec(select(Restaurant).where(Restaurant.slug == slug)).first()
    if not r or r.status != "active":
        raise HTTPException(status_code=404, detail="Restaurant introuvable.")
    return svc.detail(session, r)


@router.get("/restaurants/{rid}/tables")
def slot_tables(rid: int, day: date, time: str, party: int = Query(default=2, ge=1, le=40), session: Session = Depends(get_session)):
    """Plan de salle pour un créneau : chaque table est libre, prise ou trop petite."""
    r = _get_live(session, rid)
    svc.check_slot(r, day, time)
    return {"tables": svc.tables_for_slot(session, r, day, time, party), "room_w": r.room_w, "room_d": r.room_d}


@router.get("/restaurants/{rid}/slots")
def day_slots(rid: int, day: date, party: int = Query(default=2, ge=1, le=40), session: Session = Depends(get_session)):
    r = _get_live(session, rid)
    now = svc.local_now()
    if day < now.date() or day > now.date() + timedelta(days=svc.MAX_ADVANCE) or day.weekday() in svc.closed_set(r):
        return {"closed": True, "slots": []}
    counts = svc.free_counts(session, r, day, party)
    cut = svc.to_min(now.strftime("%H:%M")) + 30 if day == now.date() else -1
    return {"closed": False, "slots": [{"time": t, "free": n} for t, n in counts.items() if svc.to_min(t) >= cut]}


@router.get("/restaurants/{rid}/reviews")
def reviews(rid: int, offset: int = 0, session: Session = Depends(get_session)):
    rows = session.exec(select(RestaurantReview).where(RestaurantReview.restaurant_id == rid).order_by(RestaurantReview.created_at.desc()).offset(offset).limit(10)).all()
    out = []
    for x in rows:
        u = session.get(User, x.user_id)
        out.append({"id": x.id, "rating": x.rating, "comment": x.comment, "author": (u.full_name or "Client").split(" ")[0] if u else "Client", "created_at": x.created_at.isoformat()})
    return out


# --- Réservations ----------------------------------------------------------------

class PreLine(BaseModel):
    item_id: int
    qty: int = Field(ge=1, le=20)


class ReserveIn(BaseModel):
    restaurant_id: int
    day: date
    time: str
    party_size: int = Field(ge=1, le=40)
    table_id: Optional[int] = None
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(default="", max_length=30)
    note: str = Field(default="", max_length=400)
    preorder: list[PreLine] = []

    @field_validator("name", "note", "phone")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


@router.post("/reservations", status_code=201)
def reserve(payload: ReserveIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _get_live(session, payload.restaurant_id)
    if payload.party_size > r.max_party:
        raise HTTPException(status_code=422, detail=f"Groupe maximum : {r.max_party} personnes. Contactez le restaurant pour un grand groupe.")
    svc.check_slot(r, payload.day, payload.time)
    mine = session.exec(select(func.count(Reservation.id)).where(Reservation.user_id == user.id, Reservation.status.in_(("pending", "confirmed")), Reservation.day >= svc.local_now().date())).one()
    if mine >= svc.MAX_ACTIVE_PER_USER:
        raise HTTPException(status_code=409, detail="Vous avez déjà plusieurs réservations à venir. Annulez-en une avant d'en faire une autre.")
    dupe = session.exec(select(Reservation.id).where(Reservation.user_id == user.id, Reservation.restaurant_id == r.id, Reservation.day == payload.day, Reservation.time == payload.time, Reservation.status.in_(("pending", "confirmed")))).first()
    if dupe:
        raise HTTPException(status_code=409, detail="Vous avez déjà une réservation à cette heure dans ce restaurant.")
    if payload.table_id:
        table = session.get(DiningTable, payload.table_id)
        if not table or table.restaurant_id != r.id or not table.is_active:
            raise HTTPException(status_code=422, detail="Table introuvable.")
        if table.seats < payload.party_size:
            raise HTTPException(status_code=422, detail=f"Cette table compte {table.seats} places : choisissez-en une plus grande.")
        if table.id in svc.taken_table_ids(session, r, payload.day, payload.time):
            raise HTTPException(status_code=409, detail="Cette table vient d'être réservée : choisissez-en une autre.")
    else:
        table = svc.pick_table(session, r, payload.day, payload.time, payload.party_size)
        if not table:
            raise HTTPException(status_code=409, detail="Plus de table libre à cette heure pour ce groupe : essayez un autre créneau.")
    pre_json, pre_total = svc.build_preorder(session, r, payload.preorder)
    status = "confirmed" if r.instant_confirm else "pending"
    x = Reservation(
        code=svc.new_code(session), restaurant_id=r.id, table_id=table.id, user_id=user.id, name=payload.name, phone=payload.phone, party_size=payload.party_size,
        day=payload.day, time=payload.time, duration_minutes=r.slot_minutes, status=status, note=payload.note, preorder=pre_json, preorder_total=pre_total,
        restaurant_name=r.name, table_label=table.label,
    )
    session.add(x)
    session.commit()
    session.refresh(x)
    owner = session.get(User, r.owner_id)
    svc.notify(session, r.owner_id, "Nouvelle réservation", f"{x.name} · {x.party_size} pers. · {x.day.isoformat()} {x.time} · table {x.table_label} ({x.code}).", owner.email if owner else None)
    svc.notify(session, user.id, "Réservation " + ("confirmée" if status == "confirmed" else "envoyée"), f"{r.name} · {x.day.isoformat()} à {x.time} · table {x.table_label}. Code {x.code}.")
    session.commit()
    return svc.reservation_read(x)


def _mine(session: Session, code: str, user: User) -> Reservation:
    x = session.exec(select(Reservation).where(Reservation.code == code)).first()
    if not x or x.user_id != user.id:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return x


@router.get("/me/reservations")
def my_reservations(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Reservation).where(Reservation.user_id == user.id).order_by(Reservation.day.desc(), Reservation.time.desc()).limit(100)).all()
    reviewed = set(session.exec(select(RestaurantReview.reservation_id).where(RestaurantReview.user_id == user.id)).all())
    slugs = dict(session.exec(select(Restaurant.id, Restaurant.slug).where(Restaurant.id.in_({x.restaurant_id for x in rows}))).all()) if rows else {}
    return [{**svc.reservation_read(x), "reviewed": x.id in reviewed, "restaurant_slug": slugs.get(x.restaurant_id, "")} for x in rows]


@router.post("/me/reservations/{code}/cancel")
def cancel(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    x = _mine(session, code, user)
    if x.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée.")
    x.status = "cancelled"
    x.updated_at = svc.local_now()
    session.add(x)
    r = session.get(Restaurant, x.restaurant_id)
    if r:
        svc.notify(session, r.owner_id, "Réservation annulée", f"{x.name} a annulé {x.code} ({x.day.isoformat()} {x.time}, table {x.table_label}).")
    session.commit()
    return svc.reservation_read(x)


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=600)


@router.post("/me/reservations/{code}/review", status_code=201)
def review(code: str, payload: ReviewIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    x = _mine(session, code, user)
    if x.status != "completed":
        raise HTTPException(status_code=409, detail="Vous pouvez donner votre avis une fois le repas terminé.")
    if session.exec(select(RestaurantReview.id).where(RestaurantReview.reservation_id == x.id)).first():
        raise HTTPException(status_code=409, detail="Vous avez déjà donné votre avis.")
    session.add(RestaurantReview(restaurant_id=x.restaurant_id, reservation_id=x.id, user_id=user.id, rating=payload.rating, comment=payload.comment.strip()))
    session.flush()
    r = session.get(Restaurant, x.restaurant_id)
    if r:
        svc.refresh_rating(session, r)
    session.commit()
    return {"ok": True}
