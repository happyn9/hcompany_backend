"""H-Tourisme — espace opérateur : excursions, photos, départs, réservations, statistiques."""
import json
import re
import uuid
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_user
from app.models import User, UserRole
from app.routers.partner_modules import require_module
from app.tourism import services as svc
from app.tourism.models import CATEGORIES, DIFFICULTIES, Tour, TourBooking, TourDeparture, TourImage
from app.upload_store import save_upload

router = APIRouter(prefix="/api/v1/tourism/owner", tags=["tourism-owner"])
UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
(UPLOAD_ROOT / "tourism").mkdir(parents=True, exist_ok=True)
IMG_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAGIC = {".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".webp": b"RIFF"}
MAX_IMG = 5 * 1024 * 1024
MAX_TOURS = 20
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
LANGS = ("fr", "en", "sw", "ny", "bem", "pt", "de", "zh")


def _mine(session: Session, tid: int, user: User) -> Tour:
    t = session.get(Tour, tid)
    if not t or (t.owner_id != user.id and user.role != UserRole.admin):
        raise HTTPException(status_code=404, detail="Excursion introuvable.")
    return t


def _check_image(path: Optional[str], user: User) -> Optional[str]:
    if not path:
        return None
    m = re.fullmatch(r"tourism/(\d+)-[0-9a-f]{12}\.(png|jpg|webp)", path)
    if not m or (int(m.group(1)) != user.id and user.role != UserRole.admin):
        raise HTTPException(status_code=422, detail="Image invalide : téléversez-la d'abord.")
    return path


@router.post("/uploads")
def upload_image(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    ext = IMG_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Format non supporté (PNG, JPEG ou WebP).")
    data = file.file.read(MAX_IMG + 1)
    if len(data) > MAX_IMG:
        raise HTTPException(status_code=400, detail="L'image ne doit pas dépasser 5 Mo.")
    if not data.startswith(MAGIC[ext]):
        raise HTTPException(status_code=400, detail="Le fichier n'est pas une image valide.")
    name = f"{user.id}-{uuid.uuid4().hex[:12]}{ext}"
    save_upload(UPLOAD_ROOT, f"tourism/{name}", data)
    return {"path": f"tourism/{name}"}


# --- Fiche -----------------------------------------------------------------------

class StepIn(BaseModel):
    title: str = Field(max_length=80)
    text: str = Field(default="", max_length=500)


class TourIn(BaseModel):
    title: str = Field(min_length=2, max_length=90)
    summary: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=5000)
    category: str = "nature"
    city: str = Field(default="", max_length=60)
    meeting_point: str = Field(default="", max_length=160)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    phone: str = Field(default="", max_length=30)
    whatsapp: str = Field(default="", max_length=30)
    duration_hours: float = Field(default=3, gt=0, le=240)
    difficulty: str = "easy"
    languages: list[str] = ["fr", "en"]
    min_age: int = Field(default=0, ge=0, le=18)
    price_adult: float = Field(default=0, ge=0, le=1000000)
    price_child: Optional[float] = Field(default=None, ge=0, le=1000000)
    max_group: int = Field(default=12, ge=1, le=60)
    includes: list[str] = Field(default=[], max_length=20)
    excludes: list[str] = Field(default=[], max_length=20)
    itinerary: list[StepIn] = Field(default=[], max_length=20)
    instant_confirm: bool = False
    cancel_hours: int = Field(default=24, ge=0, le=240)
    images: list[str] = Field(default=[], max_length=10)

    @field_validator("category")
    @classmethod
    def _cat(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError("Catégorie inconnue.")
        return v

    @field_validator("difficulty")
    @classmethod
    def _diff(cls, v: str) -> str:
        if v not in DIFFICULTIES:
            raise ValueError("Niveau inconnu.")
        return v

    @field_validator("languages")
    @classmethod
    def _langs(cls, v: list[str]) -> list[str]:
        if any(x not in LANGS for x in v):
            raise ValueError("Langue inconnue.")
        return v


def _apply(session: Session, t: Tour, p: TourIn, user: User) -> None:
    t.title, t.summary, t.description, t.category = p.title.strip(), p.summary.strip(), p.description.strip(), p.category
    t.city, t.meeting_point, t.latitude, t.longitude = p.city.strip(), p.meeting_point.strip(), p.latitude, p.longitude
    t.phone, t.whatsapp, t.duration_hours, t.difficulty = p.phone.strip(), p.whatsapp.strip(), p.duration_hours, p.difficulty
    t.languages, t.min_age, t.price_adult, t.price_child = ",".join(p.languages), p.min_age, p.price_adult, p.price_child
    t.max_group, t.instant_confirm, t.cancel_hours = p.max_group, p.instant_confirm, p.cancel_hours
    t.includes, t.excludes = "\n".join(x.strip() for x in p.includes if x.strip()), "\n".join(x.strip() for x in p.excludes if x.strip())
    t.itinerary = json.dumps([{"title": s.title.strip(), "text": s.text.strip()} for s in p.itinerary if s.title.strip()], ensure_ascii=False)
    t.updated_at = datetime.utcnow()
    session.add(t)
    session.flush()
    imgs = [_check_image(i, user) for i in p.images]
    for old in session.exec(select(TourImage).where(TourImage.tour_id == t.id)).all():
        session.delete(old)
    for n, path in enumerate(i for i in imgs if i):
        session.add(TourImage(tour_id=t.id, path=path, sort_order=n))


def owner_view(session: Session, t: Tour) -> dict:
    now = svc.local_now()
    pending = session.exec(select(func.count(TourBooking.id)).where(TourBooking.tour_id == t.id, TourBooking.status == "pending", TourBooking.day >= now.date())).one()
    d = svc.card(session, t, [])
    d.update({
        "status": t.status, "status_reason": t.status_reason, "description": t.description, "country": t.country, "meeting_point": t.meeting_point,
        "latitude": t.latitude, "longitude": t.longitude, "phone": t.phone, "whatsapp": t.whatsapp, "images": svc.images_of(session, t.id), "min_age": t.min_age,
        "includes": svc.lines(t.includes), "excludes": svc.lines(t.excludes), "itinerary": svc.itinerary_of(t), "cancel_hours": t.cancel_hours,
        "pending_bookings": int(pending),
        "open_departures": len(svc.upcoming_departures(session, t)),
    })
    return d


@router.get("/tours")
def my_tours(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Tour).where(Tour.owner_id == user.id).order_by(Tour.created_at.desc())).all()
    return [owner_view(session, t) for t in rows]


@router.post("/tours", status_code=201)
def create_tour(p: TourIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    require_module(session, user, "tourism")
    if session.exec(select(func.count(Tour.id)).where(Tour.owner_id == user.id)).one() >= MAX_TOURS:
        raise HTTPException(status_code=409, detail=f"Vous pouvez gérer jusqu'à {MAX_TOURS} excursions.")
    t = Tour(slug=svc.unique_slug(session, Tour, p.title), owner_id=user.id, title=p.title)
    session.add(t)
    session.flush()
    _apply(session, t, p, user)
    session.commit()
    session.refresh(t)
    return owner_view(session, t)


@router.get("/tours/{tid}")
def get_tour(tid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return owner_view(session, _mine(session, tid, user))


@router.put("/tours/{tid}")
def update_tour(tid: int, p: TourIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    _apply(session, t, p, user)
    session.commit()
    session.refresh(t)
    return owner_view(session, t)


@router.post("/tours/{tid}/submit")
def submit(tid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    if t.status not in ("draft", "rejected"):
        raise HTTPException(status_code=409, detail="Cette excursion est déjà en validation ou en ligne.")
    missing = []
    if not (t.summary and t.city and t.meeting_point):
        missing.append("résumé, ville et point de rendez-vous")
    if t.price_adult <= 0:
        missing.append("le prix par adulte")
    if not svc.images_of(session, t.id):
        missing.append("au moins une photo")
    if not svc.upcoming_departures(session, t):
        missing.append("au moins un départ à venir")
    if missing:
        raise HTTPException(status_code=422, detail="À compléter avant l'envoi : " + ", ".join(missing) + ".")
    t.status, t.status_reason = "pending", None
    session.add(t)
    for admin in session.exec(select(User).where(User.role == UserRole.admin)).all():
        svc.notify(session, admin.id, "Excursion à valider", f"« {t.title} » ({t.city}) attend votre validation dans H-Tourisme.")
    session.commit()
    return owner_view(session, t)


@router.post("/tours/{tid}/pause")
def pause(tid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    if t.status != "active":
        raise HTTPException(status_code=409, detail="Seule une excursion en ligne peut être mise en pause.")
    t.status = "paused"
    session.add(t)
    session.commit()
    return owner_view(session, t)


@router.post("/tours/{tid}/resume")
def resume(tid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    if t.status != "paused":
        raise HTTPException(status_code=409, detail="Cette excursion n'est pas en pause.")
    t.status = "active"
    session.add(t)
    session.commit()
    return owner_view(session, t)


# --- Départs -----------------------------------------------------------------------

class DeparturesIn(BaseModel):
    start: date
    end: date
    weekdays: list[int] = Field(default=[0, 1, 2, 3, 4, 5, 6])  # 0 = lundi
    times: list[str] = Field(min_length=1, max_length=6)
    capacity: Optional[int] = Field(default=None, ge=1, le=200)
    price_adult: Optional[float] = Field(default=None, ge=0)
    price_child: Optional[float] = Field(default=None, ge=0)

    @field_validator("times")
    @classmethod
    def _times(cls, v: list[str]) -> list[str]:
        if any(not HHMM.match(x) for x in v):
            raise ValueError("Heure invalide (HH:MM).")
        return sorted(set(v))

    @field_validator("weekdays")
    @classmethod
    def _wd(cls, v: list[int]) -> list[int]:
        if not v or any(d < 0 or d > 6 for d in v):
            raise ValueError("Jour invalide.")
        return sorted(set(v))


def _dep_row(session: Session, t: Tour, d: TourDeparture) -> dict:
    r = svc.departure_read(session, t, d)
    r.update({"booked": svc.booked(session, d.id), "own_price_adult": d.price_adult, "own_price_child": d.price_child, "pending": int(session.exec(select(func.count(TourBooking.id)).where(TourBooking.departure_id == d.id, TourBooking.status == "pending")).one())})
    return r


@router.get("/tours/{tid}/departures")
def list_departures(tid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    since = svc.local_now().date() - timedelta(days=14)
    rows = session.exec(select(TourDeparture).where(TourDeparture.tour_id == t.id, TourDeparture.day >= since).order_by(TourDeparture.day, TourDeparture.time)).all()
    return [_dep_row(session, t, d) for d in rows]


@router.post("/tours/{tid}/departures", status_code=201)
def add_departures(tid: int, p: DeparturesIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    today = svc.local_now().date()
    if p.end < p.start or p.start < today:
        raise HTTPException(status_code=422, detail="Choisissez une période à venir.")
    if (p.end - p.start).days > svc.MAX_ADVANCE:
        raise HTTPException(status_code=422, detail=f"Période maximale : {svc.MAX_ADVANCE} jours.")
    existing = {(d.day, d.time) for d in session.exec(select(TourDeparture).where(TourDeparture.tour_id == t.id, TourDeparture.day >= p.start, TourDeparture.day <= p.end)).all()}
    made, day = 0, p.start
    while day <= p.end:
        if day.weekday() in p.weekdays:
            for tm in p.times:
                if (day, tm) not in existing:
                    session.add(TourDeparture(tour_id=t.id, day=day, time=tm, capacity=p.capacity or t.max_group, price_adult=p.price_adult, price_child=p.price_child))
                    made += 1
                    if made > 300:
                        raise HTTPException(status_code=422, detail="Trop de départs d'un coup (maximum 300) : réduisez la période.")
        day += timedelta(days=1)
    session.commit()
    return {"created": made}


class DepartureIn(BaseModel):
    capacity: Optional[int] = Field(default=None, ge=1, le=200)
    price_adult: Optional[float] = Field(default=None, ge=0)
    price_child: Optional[float] = Field(default=None, ge=0)
    is_open: Optional[bool] = None


@router.put("/departures/{did}")
def update_departure(did: int, p: DepartureIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    d = session.get(TourDeparture, did)
    if not d:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    t = _mine(session, d.tour_id, user)
    if p.capacity is not None:
        if p.capacity < svc.booked(session, d.id):
            raise HTTPException(status_code=409, detail="La capacité ne peut pas être inférieure aux places déjà réservées.")
        d.capacity = p.capacity
    d.price_adult, d.price_child = p.price_adult, p.price_child
    if p.is_open is not None:
        d.is_open = p.is_open
    session.add(d)
    session.commit()
    return _dep_row(session, t, d)


@router.delete("/departures/{did}")
def delete_departure(did: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    d = session.get(TourDeparture, did)
    if not d:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    _mine(session, d.tour_id, user)
    if session.exec(select(TourBooking.id).where(TourBooking.departure_id == d.id, TourBooking.status.in_(("pending", "confirmed")))).first():
        raise HTTPException(status_code=409, detail="Ce départ a des réservations en cours : fermez-le ou annulez-les d'abord.")
    if session.exec(select(TourBooking.id).where(TourBooking.departure_id == d.id)).first():
        d.is_open = False  # historique conservé
        session.add(d)
    else:
        session.delete(d)
    session.commit()
    return {"ok": True}


# --- Réservations ------------------------------------------------------------------

class ActionIn(BaseModel):
    action: str
    reason: str = Field(default="", max_length=300)


FLOW = {  # action → (statuts de départ, statut d'arrivée)
    "confirm": (("pending",), "confirmed"),
    "decline": (("pending",), "declined"),
    "complete": (("confirmed",), "completed"),
    "no_show": (("confirmed",), "no_show"),
    "cancel": (("pending", "confirmed"), "cancelled"),
}


@router.get("/tours/{tid}/bookings")
def list_bookings(tid: int, day: Optional[date] = None, status: Optional[str] = None, upcoming: bool = False, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    stmt = select(TourBooking).where(TourBooking.tour_id == t.id)
    if day:
        stmt = stmt.where(TourBooking.day == day)
    if upcoming:
        stmt = stmt.where(TourBooking.day >= svc.local_now().date())
    if status:
        stmt = stmt.where(TourBooking.status.in_(status.split(",")))
    return [svc.booking_read(x) for x in session.exec(stmt.order_by(TourBooking.day, TourBooking.time, TourBooking.created_at).limit(300)).all()]


@router.post("/bookings/{code}/action")
def act(code: str, p: ActionIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    x = session.exec(select(TourBooking).where(TourBooking.code == code)).first()
    if not x:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    t = _mine(session, x.tour_id, user)
    if p.action not in FLOW:
        raise HTTPException(status_code=422, detail="Action inconnue.")
    src, dst = FLOW[p.action]
    if x.status not in src:
        raise HTTPException(status_code=409, detail="Action impossible pour l'état actuel de la réservation.")
    if p.action in ("complete", "no_show") and svc.departs_at(x.day, x.time) > svc.local_now():
        raise HTTPException(status_code=409, detail="Disponible une fois le départ passé.")
    if p.action == "confirm":
        dep = session.get(TourDeparture, x.departure_id)
        if not dep or not dep.is_open:
            raise HTTPException(status_code=409, detail="Ce départ est fermé.")
    x.status = dst
    if p.action in ("decline", "cancel"):
        x.decline_reason = p.reason.strip() or None
    msgs = {"confirm": "confirmée", "decline": "refusée", "cancel": "annulée par l'organisateur", "no_show": "marquée comme non honorée"}
    if p.action in msgs:
        extra = f" Motif : {x.decline_reason}." if x.decline_reason else ""
        svc.notify(session, x.user_id, f"Réservation {msgs[p.action]}", f"{t.title} · {x.day.isoformat()} à {x.time} ({x.code}).{extra}")
    x.updated_at = svc.local_now()
    session.add(x)
    session.commit()
    return svc.booking_read(x)


# --- Statistiques ------------------------------------------------------------------

@router.get("/tours/{tid}/stats")
def stats(tid: int, days: int = 30, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, tid, user)
    days = max(1, min(days, 365))
    today = svc.local_now().date()
    rows = session.exec(select(TourBooking).where(TourBooking.tour_id == t.id, TourBooking.day >= today - timedelta(days=days))).all()
    by_status = Counter(x.status for x in rows)
    honoured = [x for x in rows if x.status in ("confirmed", "completed")]
    decided = by_status["completed"] + by_status["no_show"]
    series: Counter = Counter()
    for x in honoured:
        series[x.day.isoformat()] += x.adults + x.children
    upcoming = session.exec(select(func.count(TourBooking.id)).where(TourBooking.tour_id == t.id, TourBooking.day >= today, TourBooking.status.in_(("pending", "confirmed")))).one()
    deps = svc.upcoming_departures(session, t, 30)
    cap = sum(d.capacity for d in deps)
    taken = sum(svc.booked(session, d.id) for d in deps)
    return {
        "days": days, "bookings": len(rows), "by_status": dict(by_status), "travellers": sum(x.adults + x.children for x in honoured),
        "revenue": round(sum(x.total for x in honoured), 2), "no_show_rate": round(by_status["no_show"] / decided * 100, 1) if decided else 0,
        "upcoming": int(upcoming), "fill_rate_30d": round(taken / cap * 100, 1) if cap else 0, "open_departures": len(deps),
        "series": [{"date": d, "value": v} for d, v in sorted(series.items())], "rating_avg": t.rating_avg, "rating_count": t.rating_count,
    }
