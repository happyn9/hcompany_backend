"""H-Tourisme — côté voyageur : recherche, fiche, départs, réservations, avis."""
import math
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.deps import get_current_user
from app.models import User
from app.tourism import services as svc
from app.tourism.models import CATEGORIES, DIFFICULTIES, Tour, TourBooking, TourDeparture, TourReview

router = APIRouter(prefix="/api/v1/tourism", tags=["tourism"])


def _live():
    return select(Tour).where(Tour.status == "active")


def _get_live(session: Session, tid: int) -> Tour:
    t = session.get(Tour, tid)
    if not t or t.status != "active":
        raise HTTPException(status_code=404, detail="Excursion introuvable.")
    return t


@router.get("/home")
def home(session: Session = Depends(get_session)):
    live = session.exec(_live().order_by(Tour.is_featured.desc(), Tour.rating_avg.desc(), Tour.id.desc()).limit(40)).all()
    cards = [svc.card(session, t) for t in live]
    cards = [c for c in cards if c["next_day"]] or cards  # d'abord ceux qui ont un départ à venir
    cats: dict[str, int] = {}
    cities: dict[str, int] = {}
    for t in session.exec(_live()).all():
        cats[t.category] = cats.get(t.category, 0) + 1
        if t.city:
            cities[t.city] = cities.get(t.city, 0) + 1
    return {
        "featured": cards[:9], "total": len(live),
        "categories": [{"key": k, "count": n} for k, n in sorted(cats.items(), key=lambda kv: -kv[1])],
        "cities": [{"city": c, "count": n} for c, n in sorted(cities.items(), key=lambda kv: -kv[1])],
    }


@router.get("/search")
def search(
    q: Optional[str] = None, city: Optional[str] = None, category: Optional[str] = None, difficulty: Optional[str] = None,
    day: Optional[date] = None, people: int = Query(default=1, ge=1, le=40), max_price: Optional[float] = Query(default=None, ge=0),
    sort: str = "recommended", page: int = Query(default=1, ge=1), per_page: int = Query(default=12, ge=1, le=48), session: Session = Depends(get_session),
):
    stmt = _live()
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Tour.title.ilike(like), Tour.city.ilike(like), Tour.summary.ilike(like), Tour.category.ilike(like)))
    if city:
        stmt = stmt.where(func.lower(Tour.city) == city.strip().lower())
    if category and category in CATEGORIES:
        stmt = stmt.where(Tour.category == category)
    if difficulty and difficulty in DIFFICULTIES:
        stmt = stmt.where(Tour.difficulty == difficulty)
    rows = session.exec(stmt.limit(400)).all()
    out = []
    for t in rows:
        deps = svc.upcoming_departures(session, t)
        if day:
            deps = [d for d in deps if d.day == day]
        if day or people > 1:
            deps = [d for d in deps if svc.seats_left(session, d) >= people]
        if (day or people > 1) and not deps:
            continue
        c = svc.card(session, t, deps)
        if max_price is not None and c["from_price"] > max_price:
            continue
        out.append(c)
    key = {
        "rating": lambda c: (-c["rating_avg"], -c["rating_count"]), "price_asc": lambda c: c["from_price"], "price_desc": lambda c: -c["from_price"],
        "soon": lambda c: (c["next_day"] or "9999", c["next_time"] or ""), "duration": lambda c: c["duration_hours"],
    }.get(sort, lambda c: (not c["is_featured"], -c["rating_avg"]))
    out.sort(key=key)
    total = len(out)
    return {"items": out[(page - 1) * per_page: page * per_page], "total": total, "page": page, "pages": max(1, math.ceil(total / per_page))}


@router.get("/tours/{slug}")
def tour_detail(slug: str, session: Session = Depends(get_session)):
    t = session.exec(select(Tour).where(Tour.slug == slug)).first()
    if not t or t.status != "active":
        raise HTTPException(status_code=404, detail="Excursion introuvable.")
    return svc.detail(session, t)


@router.get("/tours/{tid}/departures")
def departures(tid: int, days: int = Query(default=90, ge=1, le=svc.MAX_ADVANCE), session: Session = Depends(get_session)):
    t = _get_live(session, tid)
    return [svc.departure_read(session, t, d) for d in svc.upcoming_departures(session, t, days)]


@router.get("/tours/{tid}/reviews")
def reviews(tid: int, offset: int = 0, session: Session = Depends(get_session)):
    rows = session.exec(select(TourReview).where(TourReview.tour_id == tid).order_by(TourReview.created_at.desc()).offset(offset).limit(10)).all()
    out = []
    for x in rows:
        u = session.get(User, x.user_id)
        out.append({"id": x.id, "rating": x.rating, "comment": x.comment, "author": (u.full_name or "Voyageur").split(" ")[0] if u else "Voyageur", "created_at": x.created_at.isoformat()})
    return out


class BookIn(BaseModel):
    departure_id: int
    adults: int = Field(ge=1, le=40)
    children: int = Field(default=0, ge=0, le=40)
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(default="", max_length=30)
    note: str = Field(default="", max_length=400)

    @field_validator("name", "note", "phone")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


@router.post("/bookings", status_code=201)
def book(p: BookIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    dep = session.get(TourDeparture, p.departure_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    t = _get_live(session, dep.tour_id)
    if not svc.bookable(dep):
        raise HTTPException(status_code=422, detail="Ce départ n'est plus réservable : choisissez une autre date.")
    n = p.adults + p.children
    left = svc.seats_left(session, dep)
    if n > left:
        raise HTTPException(status_code=409, detail=f"Il ne reste que {left} place(s) sur ce départ." if left else "Ce départ est complet.")
    mine = session.exec(select(func.count(TourBooking.id)).where(TourBooking.user_id == user.id, TourBooking.status.in_(("pending", "confirmed")), TourBooking.day >= svc.local_now().date())).one()
    if mine >= svc.MAX_ACTIVE_PER_USER:
        raise HTTPException(status_code=409, detail="Vous avez déjà plusieurs réservations à venir. Annulez-en une avant d'en faire une autre.")
    if session.exec(select(TourBooking.id).where(TourBooking.user_id == user.id, TourBooking.departure_id == dep.id, TourBooking.status.in_(("pending", "confirmed")))).first():
        raise HTTPException(status_code=409, detail="Vous avez déjà réservé ce départ.")
    total = svc.quote(t, dep, p.adults, p.children)
    status = "confirmed" if t.instant_confirm else "pending"
    x = TourBooking(code=svc.new_code(session), tour_id=t.id, departure_id=dep.id, user_id=user.id, name=p.name, phone=p.phone, adults=p.adults, children=p.children,
                    total=total, status=status, note=p.note, tour_title=t.title, day=dep.day, time=dep.time)
    session.add(x)
    session.commit()
    session.refresh(x)
    owner = session.get(User, t.owner_id)
    svc.notify(session, t.owner_id, "Nouvelle réservation", f"{x.name} · {n} pers. · {t.title} · {x.day.isoformat()} {x.time} ({x.code}).", owner.email if owner else None)
    svc.notify(session, user.id, "Réservation " + ("confirmée" if status == "confirmed" else "envoyée"), f"{t.title} · {x.day.isoformat()} à {x.time}. Code {x.code}.")
    session.commit()
    return svc.booking_read(x)


def _mine(session: Session, code: str, user: User) -> TourBooking:
    x = session.exec(select(TourBooking).where(TourBooking.code == code)).first()
    if not x or x.user_id != user.id:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return x


@router.get("/me/bookings")
def my_bookings(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(TourBooking).where(TourBooking.user_id == user.id).order_by(TourBooking.day.desc(), TourBooking.time.desc()).limit(100)).all()
    reviewed = set(session.exec(select(TourReview.booking_id).where(TourReview.user_id == user.id)).all())
    slugs = dict(session.exec(select(Tour.id, Tour.slug).where(Tour.id.in_({x.tour_id for x in rows}))).all()) if rows else {}
    return [{**svc.booking_read(x), "reviewed": x.id in reviewed, "tour_slug": slugs.get(x.tour_id, "")} for x in rows]


@router.post("/me/bookings/{code}/cancel")
def cancel(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    x = _mine(session, code, user)
    if x.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée.")
    t = session.get(Tour, x.tour_id)
    hours = (svc.departs_at(x.day, x.time) - svc.local_now()).total_seconds() / 3600
    late = bool(t and x.status == "confirmed" and hours < t.cancel_hours)
    x.status = "cancelled"
    x.updated_at = svc.local_now()
    session.add(x)
    if t:
        svc.notify(session, t.owner_id, "Réservation annulée", f"{x.name} a annulé {x.code} ({x.day.isoformat()} {x.time})" + (" — annulation tardive." if late else "."))
    session.commit()
    return {**svc.booking_read(x), "late": late}


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=600)


@router.post("/me/bookings/{code}/review", status_code=201)
def review(code: str, p: ReviewIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    x = _mine(session, code, user)
    if x.status != "completed":
        raise HTTPException(status_code=409, detail="Vous pouvez donner votre avis une fois l'excursion terminée.")
    if session.exec(select(TourReview.id).where(TourReview.booking_id == x.id)).first():
        raise HTTPException(status_code=409, detail="Vous avez déjà donné votre avis.")
    session.add(TourReview(tour_id=x.tour_id, booking_id=x.id, user_id=user.id, rating=p.rating, comment=p.comment.strip()))
    session.flush()
    t = session.get(Tour, x.tour_id)
    if t:
        svc.refresh_rating(session, t)
    session.commit()
    return {"ok": True}
