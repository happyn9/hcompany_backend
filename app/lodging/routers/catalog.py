"""H-Logement — API publique : accueil, villes, recherche avec dates,
fiche logement, calendrier, avis, devis."""
import math
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.deps import get_optional_user
from app.lodging import schemas as S
from app.lodging import views
from app.lodging.models import LodgeHost, LodgeReview, PROPERTY_TYPES, Property
from app.lodging.services import (
    AMENITIES, availability_conflict, calendar_days, property_images, quote_stay, _rules, night_price, daterange,
)
from app.models import User

router = APIRouter(prefix="/api/v1/lodging", tags=["lodging"])

SORTS = {
    "recommended": (Property.is_featured.desc(), Property.rating_avg.desc(), Property.booked_count.desc()),
    "price_asc": (Property.price_per_night.asc(),),
    "price_desc": (Property.price_per_night.desc(),),
    "rating": (Property.rating_avg.desc(), Property.rating_count.desc()),
    "new": (Property.created_at.desc(),),
}


def _visible():
    return select(Property).where(Property.status == "active")


def _cards(session: Session, rows, user: Optional[User]):
    favs = views.favorite_ids(session, user)
    hosts: dict = {}
    out = []
    for p in rows:
        if p.host_id not in hosts:
            hosts[p.host_id] = session.get(LodgeHost, p.host_id)
        out.append(views.card(session, p, hosts[p.host_id], favs))
    return out


@router.get("/amenities", response_model=list[S.AmenityRead])
def amenities():
    return [S.AmenityRead(key=k, label_fr=v[0], label_en=v[1]) for k, v in AMENITIES.items()]


@router.get("/cities", response_model=list[S.CityRead])
def cities(session: Session = Depends(get_session)):
    rows = session.exec(
        select(Property.city, func.min(Property.country), func.count(Property.id), func.min(Property.price_per_night))
        .where(Property.status == "active", Property.city != "").group_by(Property.city).order_by(func.count(Property.id).desc())
    ).all()
    out = []
    for city, country, n, min_price in rows:
        p = session.exec(_visible().where(Property.city == city).order_by(Property.is_featured.desc(), Property.rating_avg.desc())).first()
        imgs = property_images(session, p.id) if p else []
        out.append(S.CityRead(city=city, country=country or "", count=int(n), image=imgs[0].path if imgs else None, min_price=float(min_price or 0)))
    return out


@router.get("/home", response_model=S.HomeResponse)
def home(session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user)):
    base = _visible()
    featured = session.exec(base.where(Property.is_featured == True).order_by(Property.created_at.desc()).limit(8)).all()  # noqa: E712
    latest = session.exec(base.order_by(Property.created_at.desc()).limit(8)).all()
    top = session.exec(base.where(Property.rating_count > 0).order_by(Property.rating_avg.desc(), Property.rating_count.desc()).limit(8)).all()
    types = dict(session.exec(select(Property.type, func.count(Property.id)).where(Property.status == "active").group_by(Property.type)).all())
    return S.HomeResponse(
        featured=_cards(session, featured, user), latest=_cards(session, latest, user), top_rated=_cards(session, top, user),
        cities=cities(session), types=types,
        totals={
            "properties": session.exec(select(func.count(Property.id)).where(Property.status == "active")).one(),
            "hosts": session.exec(select(func.count(func.distinct(Property.host_id))).where(Property.status == "active")).one(),
            "reviews": session.exec(select(func.count(LodgeReview.id)).where(LodgeReview.is_hidden == False)).one(),  # noqa: E712
        },
    )


@router.get("/search", response_model=S.SearchResponse)
def search(
    q: Optional[str] = None, city: Optional[str] = None, check_in: Optional[date] = None, check_out: Optional[date] = None,
    guests: int = Query(default=1, ge=1, le=60), units: int = Query(default=1, ge=1, le=30),
    min_price: Optional[float] = None, max_price: Optional[float] = None, type: Optional[str] = None,
    bedrooms: Optional[int] = Query(default=None, ge=0, le=40), amenities: Optional[str] = None, instant: bool = False,
    min_rating: Optional[float] = Query(default=None, ge=0, le=5), sort: str = "recommended",
    page: int = Query(default=1, ge=1), per_page: int = Query(default=12, ge=1, le=48),
    session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user),
):
    stmt = _visible().where(Property.max_guests * Property.units >= guests)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Property.title.ilike(like), Property.city.ilike(like), Property.area.ilike(like), Property.summary.ilike(like)))
    if city:
        stmt = stmt.where(func.lower(Property.city) == city.strip().lower())
    if type:
        wanted = [t for t in type.split(",") if t in PROPERTY_TYPES]
        if wanted:
            stmt = stmt.where(Property.type.in_(wanted))
    if min_price is not None:
        stmt = stmt.where(Property.price_per_night >= min_price)
    if max_price is not None:
        stmt = stmt.where(Property.price_per_night <= max_price)
    if bedrooms:
        stmt = stmt.where(Property.bedrooms >= bedrooms)
    if instant:
        stmt = stmt.where(Property.instant_book == True)  # noqa: E712
    if min_rating:
        stmt = stmt.where(Property.rating_avg >= min_rating)
    for key in [a for a in (amenities or "").split(",") if a in AMENITIES]:
        stmt = stmt.where(Property.amenities.like(f"%{key}%"))
    stmt = stmt.order_by(*SORTS.get(sort, SORTS["recommended"]), Property.id.desc())

    dated = bool(check_in and check_out)
    if dated and (check_out <= check_in or check_in < date.today()):
        raise HTTPException(status_code=422, detail="Dates invalides.")
    if dated:
        # La disponibilité dépend du calendrier : on filtre côté serveur puis on pagine.
        nights = (check_out - check_in).days
        kept, totals = [], {}
        for p in session.exec(stmt.limit(400)).all():
            if nights < p.min_nights or nights > p.max_nights or units > p.units or guests > p.max_guests * units:
                continue
            if availability_conflict(session, p, check_in, check_out, units):
                continue
            rules = _rules(session, p.id)
            nightly = sum(night_price(p, rules, d) for d in daterange(check_in, check_out)) * units
            pct = p.monthly_discount if nights >= 28 and p.monthly_discount else (p.weekly_discount if nights >= 7 else 0)
            totals[p.id] = round(nightly * (1 - pct / 100) + p.cleaning_fee * units, 2)
            kept.append(p)
        total = len(kept)
        rows = kept[(page - 1) * per_page: page * per_page]
        favs = views.favorite_ids(session, user)
        items = [views.card(session, p, None, favs, total=totals[p.id], nights=nights) for p in rows]
    else:
        count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
        total = session.exec(count_stmt).one()
        rows = session.exec(stmt.offset((page - 1) * per_page).limit(per_page)).all()
        items = _cards(session, rows, user)
    return S.SearchResponse(items=items, total=int(total), page=page, pages=max(1, math.ceil(total / per_page)))


@router.get("/properties/{slug}", response_model=S.PropertyDetail)
def property_detail(slug: str, session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user)):
    p = session.exec(select(Property).where(Property.slug == slug)).first()
    if not p or p.status != "active":
        raise HTTPException(status_code=404, detail="Logement introuvable.")
    similar = session.exec(
        _visible().where(Property.id != p.id, or_(Property.city == p.city, Property.type == p.type))
        .order_by(Property.rating_avg.desc()).limit(4)
    ).all()
    return views.detail(session, p, views.favorite_ids(session, user), similar=_cards(session, similar, user))


@router.get("/properties/{property_id}/calendar", response_model=list[S.CalendarDay])
def property_calendar(property_id: int, start: Optional[date] = None, days: int = Query(default=120, ge=1, le=400), session: Session = Depends(get_session)):
    p = session.get(Property, property_id)
    if not p or p.status != "active":
        raise HTTPException(status_code=404, detail="Logement introuvable.")
    start = max(start or date.today(), date.today() - timedelta(days=0))
    return [S.CalendarDay(**d) for d in calendar_days(session, p, start, days)]


@router.get("/properties/{property_id}/reviews", response_model=list[S.ReviewRead])
def property_reviews(property_id: int, offset: int = 0, limit: int = Query(default=20, le=50), session: Session = Depends(get_session)):
    rows = session.exec(
        select(LodgeReview).where(LodgeReview.property_id == property_id, LodgeReview.is_hidden == False)  # noqa: E712
        .order_by(LodgeReview.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return [views.review_read(session, r) for r in rows]


@router.post("/quote", response_model=S.QuoteRead)
def quote(payload: S.QuoteRequest, session: Session = Depends(get_session)):
    p = session.get(Property, payload.property_id)
    if not p or p.status != "active":
        raise HTTPException(status_code=404, detail="Logement introuvable.")
    return views.quote_read(quote_stay(session, p, payload.check_in, payload.check_out, payload.guests, payload.units))


@router.get("/hosts/{host_id}")
def host_profile(host_id: int, session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user)):
    h = session.get(LodgeHost, host_id)
    if not h:
        raise HTTPException(status_code=404, detail="Hôte introuvable.")
    rows = session.exec(_visible().where(Property.host_id == h.id).order_by(Property.rating_avg.desc())).all()
    return {"host": views.host_public(session, h), "properties": _cards(session, rows, user)}
