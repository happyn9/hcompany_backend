"""Logique métier H-Tourisme : places restantes, tarifs, réservations, avis, vues."""
from __future__ import annotations

import json
import logging
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.models import User  # noqa: F401
from app.services.notifications import create_in_app_notification, send_email
from app.shopping.services import slugify, unique_slug  # noqa: F401  (réexportés)
from app.tourism.models import BLOCKING_STATUSES, Tour, TourBooking, TourDeparture, TourImage, TourReview

logger = logging.getLogger("hcompany.tourism")
MAX_ADVANCE = 180          # réservation possible jusqu'à N jours à l'avance
MAX_ACTIVE_PER_USER = 8
COMMISSION_PCT = 8         # part H-Company sur les réservations honorées (statistiques)


def local_now() -> datetime:
    """Heure locale de la Zambie (UTC+2), sans dépendre du fuseau du serveur."""
    return datetime.utcnow() + timedelta(hours=2)


def departs_at(day: date, time: str) -> datetime:
    h, m = (int(x) for x in time.split(":"))
    return datetime(day.year, day.month, day.day, h, m)


def booked(session: Session, dep_id: int, exclude_code: Optional[str] = None) -> int:
    stmt = select(func.coalesce(func.sum(TourBooking.adults + TourBooking.children), 0)).where(TourBooking.departure_id == dep_id, TourBooking.status.in_(BLOCKING_STATUSES))
    if exclude_code:
        stmt = stmt.where(TourBooking.code != exclude_code)
    return int(session.exec(stmt).one())


def seats_left(session: Session, dep: TourDeparture) -> int:
    return max(0, dep.capacity - booked(session, dep.id))


def prices(tour: Tour, dep: Optional[TourDeparture]) -> tuple[float, Optional[float]]:
    adult = dep.price_adult if dep and dep.price_adult is not None else tour.price_adult
    child = dep.price_child if dep and dep.price_child is not None else tour.price_child
    return float(adult), (float(child) if child is not None else None)


def quote(tour: Tour, dep: TourDeparture, adults: int, children: int) -> float:
    a, c = prices(tour, dep)
    if children and c is None:
        raise HTTPException(status_code=422, detail="Cette excursion n'a pas de tarif enfant.")
    return round(a * adults + (c or 0) * children, 2)


def bookable(dep: TourDeparture, now: Optional[datetime] = None) -> bool:
    now = now or local_now()
    return dep.is_open and departs_at(dep.day, dep.time) > now + timedelta(hours=1) and dep.day <= now.date() + timedelta(days=MAX_ADVANCE)


def upcoming_departures(session: Session, tour: Tour, days: int = 90, only_bookable: bool = True) -> list[TourDeparture]:
    now = local_now()
    rows = session.exec(select(TourDeparture).where(TourDeparture.tour_id == tour.id, TourDeparture.day >= now.date(), TourDeparture.day <= now.date() + timedelta(days=days)).order_by(TourDeparture.day, TourDeparture.time)).all()
    return [d for d in rows if (bookable(d, now) if only_bookable else True)]


def new_code(session: Session) -> str:
    for _ in range(10):
        code = "TR-" + secrets.token_hex(3).upper()
        if not session.exec(select(TourBooking.id).where(TourBooking.code == code)).first():
            return code
    raise HTTPException(status_code=500, detail="Réessayez dans un instant.")


def notify(session: Session, user_id: Optional[int], title: str, body: str, email: Optional[str] = None) -> None:
    try:
        if user_id:
            create_in_app_notification(session, user_id, title, body)
        if email:
            send_email(email, f"H-Tourisme — {title}", f"{body}\n\n— H-Tourisme, par H-Company")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Notification H-Tourisme non envoyée : %s", exc)


def refresh_rating(session: Session, t: Tour) -> None:
    avg, n = session.exec(select(func.coalesce(func.avg(TourReview.rating), 0), func.count(TourReview.id)).where(TourReview.tour_id == t.id)).one()
    t.rating_avg, t.rating_count = round(float(avg), 2), int(n)
    session.add(t)


# --- Vues ---------------------------------------------------------------------

def images_of(session: Session, tid: int) -> list[str]:
    return [i.path for i in session.exec(select(TourImage).where(TourImage.tour_id == tid).order_by(TourImage.sort_order, TourImage.id)).all()]


def itinerary_of(t: Tour) -> list[dict]:
    try:
        data = json.loads(t.itinerary or "[]")
    except Exception:  # noqa: BLE001
        return []
    return [{"title": str(x.get("title", ""))[:80], "text": str(x.get("text", ""))[:500]} for x in data if isinstance(x, dict)][:20]


def lines(text: str) -> list[str]:
    return [x.strip() for x in (text or "").splitlines() if x.strip()]


def card(session: Session, t: Tour, deps: Optional[list[TourDeparture]] = None) -> dict:
    imgs = images_of(session, t.id)
    deps = upcoming_departures(session, t) if deps is None else deps
    nxt = deps[0] if deps else None
    return {
        "id": t.id, "slug": t.slug, "title": t.title, "summary": t.summary, "category": t.category, "city": t.city, "image": imgs[0] if imgs else None,
        "duration_hours": t.duration_hours, "difficulty": t.difficulty, "price_adult": t.price_adult, "price_child": t.price_child, "max_group": t.max_group,
        "rating_avg": t.rating_avg, "rating_count": t.rating_count, "instant_confirm": t.instant_confirm, "is_featured": t.is_featured,
        "languages": [x for x in t.languages.split(",") if x],
        "next_day": nxt.day.isoformat() if nxt else None, "next_time": nxt.time if nxt else None,
        "from_price": min((prices(t, d)[0] for d in deps), default=t.price_adult),
    }


def departure_read(session: Session, t: Tour, d: TourDeparture) -> dict:
    a, c = prices(t, d)
    return {"id": d.id, "day": d.day.isoformat(), "time": d.time, "capacity": d.capacity, "seats_left": seats_left(session, d), "price_adult": a, "price_child": c, "is_open": d.is_open}


def detail(session: Session, t: Tour) -> dict:
    d = card(session, t)
    d.update({
        "description": t.description, "country": t.country, "meeting_point": t.meeting_point, "latitude": t.latitude, "longitude": t.longitude,
        "phone": t.phone, "whatsapp": t.whatsapp, "images": images_of(session, t.id), "min_age": t.min_age, "includes": lines(t.includes), "excludes": lines(t.excludes),
        "itinerary": itinerary_of(t), "cancel_hours": t.cancel_hours,
        "departures": [departure_read(session, t, x) for x in upcoming_departures(session, t)],
    })
    return d


def booking_read(x: TourBooking) -> dict:
    return {
        "id": x.id, "code": x.code, "tour_id": x.tour_id, "departure_id": x.departure_id, "tour_title": x.tour_title, "name": x.name, "phone": x.phone,
        "adults": x.adults, "children": x.children, "total": x.total, "status": x.status, "note": x.note, "decline_reason": x.decline_reason,
        "day": x.day.isoformat(), "time": x.time, "created_at": x.created_at.isoformat(),
    }
