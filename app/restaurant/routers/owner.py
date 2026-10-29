"""H-Restaurant — espace restaurateur : fiche, photos, menu, plan de salle, réservations, statistiques."""
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
from app.restaurant import services as svc
from app.restaurant.models import (
    CUISINES, DISH_TAGS, TABLE_SHAPES, TABLE_ZONES, DiningTable, MenuCategory, MenuItem, Reservation, Restaurant, RestaurantImage,
)
from app.routers.partner_modules import require_module
from app.upload_store import save_upload

router = APIRouter(prefix="/api/v1/restaurant/owner", tags=["restaurant-owner"])
UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
(UPLOAD_ROOT / "restaurant").mkdir(parents=True, exist_ok=True)
IMG_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAGIC = {".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".webp": b"RIFF"}
MAX_IMG = 5 * 1024 * 1024
MAX_RESTAURANTS = 5
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _mine(session: Session, rid: int, user: User) -> Restaurant:
    r = session.get(Restaurant, rid)
    if not r or (r.owner_id != user.id and user.role != UserRole.admin):
        raise HTTPException(status_code=404, detail="Restaurant introuvable.")
    return r


def _check_image(path: Optional[str], user: User) -> Optional[str]:
    if not path:
        return None
    m = re.fullmatch(r"restaurant/(\d+)-[0-9a-f]{12}\.(png|jpg|webp)", path)
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
    save_upload(UPLOAD_ROOT, f"restaurant/{name}", data)
    return {"path": f"restaurant/{name}"}


# --- Fiche -----------------------------------------------------------------------

class RestaurantIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    summary: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=4000)
    cuisines: list[str] = []
    city: str = Field(default="", max_length=60)
    area: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=160)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    phone: str = Field(default="", max_length=30)
    whatsapp: str = Field(default="", max_length=30)
    price_level: int = Field(default=2, ge=1, le=3)
    open_time: str = "11:00"
    close_time: str = "22:00"
    closed_days: list[int] = []
    slot_minutes: int = 90
    max_party: int = Field(default=12, ge=1, le=40)
    instant_confirm: bool = False
    accepts_preorder: bool = True
    has_terrace: bool = False
    room_w: float = Field(default=14, ge=4, le=40)
    room_d: float = Field(default=10, ge=4, le=40)
    images: list[str] = Field(default=[], max_length=10)

    @field_validator("open_time", "close_time")
    @classmethod
    def _hhmm(cls, v: str) -> str:
        if not HHMM.match(v):
            raise ValueError("Heure invalide (HH:MM).")
        return v

    @field_validator("slot_minutes")
    @classmethod
    def _slot(cls, v: int) -> int:
        if v < 30 or v > 240 or v % 15:
            raise ValueError("Durée de table : entre 30 et 240 minutes, par pas de 15.")
        return v

    @field_validator("cuisines")
    @classmethod
    def _cuisines(cls, v: list[str]) -> list[str]:
        bad = [c for c in v if c not in CUISINES]
        if bad:
            raise ValueError("Cuisine inconnue.")
        return v[:4]

    @field_validator("closed_days")
    @classmethod
    def _days(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Jour invalide.")
        return sorted(set(v))


def _apply(session: Session, r: Restaurant, p: RestaurantIn, user: User) -> None:
    if svc.to_min(p.close_time) <= svc.to_min(p.open_time):
        raise HTTPException(status_code=422, detail="L'heure de fermeture doit être après l'ouverture.")
    if svc.to_min(p.close_time) - svc.to_min(p.open_time) < p.slot_minutes:
        raise HTTPException(status_code=422, detail="La durée d'une table dépasse les heures d'ouverture.")
    r.name, r.summary, r.description = p.name.strip(), p.summary.strip(), p.description.strip()
    r.cuisines, r.city, r.area, r.address = ",".join(p.cuisines), p.city.strip(), p.area.strip(), p.address.strip()
    r.latitude, r.longitude, r.phone, r.whatsapp = p.latitude, p.longitude, p.phone.strip(), p.whatsapp.strip()
    r.price_level, r.open_time, r.close_time = p.price_level, p.open_time, p.close_time
    r.closed_days = ",".join(str(d) for d in p.closed_days)
    r.slot_minutes, r.max_party, r.instant_confirm, r.accepts_preorder, r.has_terrace = p.slot_minutes, p.max_party, p.instant_confirm, p.accepts_preorder, p.has_terrace
    r.room_w, r.room_d = p.room_w, p.room_d
    r.updated_at = datetime.utcnow()
    session.add(r)
    session.flush()
    imgs = [_check_image(i, user) for i in p.images]
    for old in session.exec(select(RestaurantImage).where(RestaurantImage.restaurant_id == r.id)).all():
        session.delete(old)
    for n, path in enumerate(i for i in imgs if i):
        session.add(RestaurantImage(restaurant_id=r.id, path=path, sort_order=n))


def owner_view(session: Session, r: Restaurant) -> dict:
    tables = session.exec(select(DiningTable).where(DiningTable.restaurant_id == r.id).order_by(DiningTable.id)).all()
    pending = session.exec(select(func.count(Reservation.id)).where(Reservation.restaurant_id == r.id, Reservation.status == "pending", Reservation.day >= svc.local_now().date())).one()
    d = svc.card(session, r)
    d.update({
        "status": r.status, "status_reason": r.status_reason, "description": r.description, "address": r.address, "latitude": r.latitude, "longitude": r.longitude,
        "phone": r.phone, "whatsapp": r.whatsapp, "images": svc.images_of(session, r.id), "closed_days": sorted(svc.closed_set(r)), "slot_minutes": r.slot_minutes,
        "max_party": r.max_party, "accepts_preorder": r.accepts_preorder, "has_terrace": r.has_terrace, "room_w": r.room_w, "room_d": r.room_d,
        "menu": svc.menu_of(session, r.id, include_hidden=True),
        "tables": [{"id": t.id, "label": t.label, "seats": t.seats, "shape": t.shape, "zone": t.zone, "x": t.x, "z": t.z, "rotation": t.rotation, "is_active": t.is_active} for t in tables],
        "pending_reservations": int(pending),
    })
    return d


@router.get("/restaurants")
def my_restaurants(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Restaurant).where(Restaurant.owner_id == user.id).order_by(Restaurant.created_at.desc())).all()
    return [owner_view(session, r) for r in rows]


@router.post("/restaurants", status_code=201)
def create_restaurant(payload: RestaurantIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    require_module(session, user, "restaurant")
    if session.exec(select(func.count(Restaurant.id)).where(Restaurant.owner_id == user.id)).one() >= MAX_RESTAURANTS:
        raise HTTPException(status_code=409, detail=f"Vous pouvez gérer jusqu'à {MAX_RESTAURANTS} restaurants.")
    r = Restaurant(slug=svc.unique_slug(session, Restaurant, payload.name), owner_id=user.id, name=payload.name)
    session.add(r)
    session.flush()
    _apply(session, r, payload, user)
    session.commit()
    session.refresh(r)
    return owner_view(session, r)


@router.get("/restaurants/{rid}")
def get_restaurant(rid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return owner_view(session, _mine(session, rid, user))


@router.put("/restaurants/{rid}")
def update_restaurant(rid: int, payload: RestaurantIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    _apply(session, r, payload, user)
    session.commit()
    session.refresh(r)
    return owner_view(session, r)


@router.post("/restaurants/{rid}/submit")
def submit(rid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    if r.status not in ("draft", "rejected"):
        raise HTTPException(status_code=409, detail="Ce restaurant est déjà en validation ou en ligne.")
    missing = []
    if not (r.summary and r.city and r.address):
        missing.append("résumé, ville et adresse")
    if not svc.images_of(session, r.id):
        missing.append("au moins une photo")
    if not session.exec(select(func.count(MenuItem.id)).where(MenuItem.restaurant_id == r.id)).one():
        missing.append("au moins un plat au menu")
    if not session.exec(select(func.count(DiningTable.id)).where(DiningTable.restaurant_id == r.id, DiningTable.is_active == True)).one():  # noqa: E712
        missing.append("au moins une table dans le plan de salle")
    if missing:
        raise HTTPException(status_code=422, detail="À compléter avant l'envoi : " + ", ".join(missing) + ".")
    r.status, r.status_reason = "pending", None
    session.add(r)
    for admin in session.exec(select(User).where(User.role == UserRole.admin)).all():
        svc.notify(session, admin.id, "Restaurant à valider", f"« {r.name} » ({r.city}) attend votre validation dans H-Restaurant.")
    session.commit()
    return owner_view(session, r)


@router.post("/restaurants/{rid}/pause")
def pause(rid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    if r.status != "active":
        raise HTTPException(status_code=409, detail="Seul un restaurant en ligne peut être mis en pause.")
    r.status = "paused"
    session.add(r)
    session.commit()
    return owner_view(session, r)


@router.post("/restaurants/{rid}/resume")
def resume(rid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    if r.status != "paused":
        raise HTTPException(status_code=409, detail="Ce restaurant n'est pas en pause.")
    r.status = "active"
    session.add(r)
    session.commit()
    return owner_view(session, r)


# --- Menu --------------------------------------------------------------------------

class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    sort_order: int = 0


class ItemIn(BaseModel):
    category_id: Optional[int] = None
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    price: float = Field(ge=0, le=100000)
    image_path: Optional[str] = None
    tags: list[str] = []
    is_available: bool = True
    sort_order: int = 0

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str]) -> list[str]:
        if any(t not in DISH_TAGS for t in v):
            raise ValueError("Étiquette inconnue.")
        return v


@router.post("/restaurants/{rid}/categories", status_code=201)
def add_category(rid: int, p: CategoryIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    if session.exec(select(func.count(MenuCategory.id)).where(MenuCategory.restaurant_id == r.id)).one() >= 30:
        raise HTTPException(status_code=409, detail="Maximum 30 catégories.")
    c = MenuCategory(restaurant_id=r.id, name=p.name.strip(), sort_order=p.sort_order)
    session.add(c)
    session.commit()
    return owner_view(session, r)


@router.put("/restaurants/{rid}/categories/{cid}")
def edit_category(rid: int, cid: int, p: CategoryIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    c = session.get(MenuCategory, cid)
    if not c or c.restaurant_id != r.id:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")
    c.name, c.sort_order = p.name.strip(), p.sort_order
    session.add(c)
    session.commit()
    return owner_view(session, r)


@router.delete("/restaurants/{rid}/categories/{cid}")
def delete_category(rid: int, cid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    c = session.get(MenuCategory, cid)
    if not c or c.restaurant_id != r.id:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")
    for it in session.exec(select(MenuItem).where(MenuItem.category_id == cid)).all():
        it.category_id = None
        session.add(it)
    session.delete(c)
    session.commit()
    return owner_view(session, r)


def _item_apply(session: Session, r: Restaurant, it: MenuItem, p: ItemIn, user: User) -> None:
    if p.category_id is not None:
        c = session.get(MenuCategory, p.category_id)
        if not c or c.restaurant_id != r.id:
            raise HTTPException(status_code=422, detail="Catégorie introuvable.")
    it.category_id, it.name, it.description, it.price = p.category_id, p.name.strip(), p.description.strip(), round(p.price, 2)
    it.image_path = _check_image(p.image_path, user)
    it.tags, it.is_available, it.sort_order = ",".join(p.tags), p.is_available, p.sort_order
    session.add(it)


@router.post("/restaurants/{rid}/items", status_code=201)
def add_item(rid: int, p: ItemIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    if session.exec(select(func.count(MenuItem.id)).where(MenuItem.restaurant_id == r.id)).one() >= 300:
        raise HTTPException(status_code=409, detail="Maximum 300 plats.")
    _item_apply(session, r, MenuItem(restaurant_id=r.id, name=p.name, price=p.price), p, user)
    session.commit()
    return owner_view(session, r)


@router.put("/restaurants/{rid}/items/{iid}")
def edit_item(rid: int, iid: int, p: ItemIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    it = session.get(MenuItem, iid)
    if not it or it.restaurant_id != r.id:
        raise HTTPException(status_code=404, detail="Plat introuvable.")
    _item_apply(session, r, it, p, user)
    session.commit()
    return owner_view(session, r)


@router.delete("/restaurants/{rid}/items/{iid}")
def delete_item(rid: int, iid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    it = session.get(MenuItem, iid)
    if not it or it.restaurant_id != r.id:
        raise HTTPException(status_code=404, detail="Plat introuvable.")
    session.delete(it)
    session.commit()
    return owner_view(session, r)


# --- Plan de salle -----------------------------------------------------------------

class TableIn(BaseModel):
    id: Optional[int] = None
    label: str = Field(min_length=1, max_length=12)
    seats: int = Field(ge=1, le=20)
    shape: str = "round"
    zone: str = "indoor"
    x: float
    z: float
    rotation: float = 0
    is_active: bool = True

    @field_validator("shape")
    @classmethod
    def _shape(cls, v: str) -> str:
        if v not in TABLE_SHAPES:
            raise ValueError("Forme inconnue.")
        return v

    @field_validator("zone")
    @classmethod
    def _zone(cls, v: str) -> str:
        if v not in TABLE_ZONES:
            raise ValueError("Zone inconnue.")
        return v


@router.put("/restaurants/{rid}/tables")
def save_tables(rid: int, tables: list[TableIn], session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Enregistre tout le plan de salle d'un coup (créations, déplacements, suppressions)."""
    r = _mine(session, rid, user)
    if len(tables) > 60:
        raise HTTPException(status_code=422, detail="Maximum 60 tables.")
    labels = [t.label.strip().lower() for t in tables]
    if len(set(labels)) != len(labels):
        raise HTTPException(status_code=422, detail="Deux tables ont le même nom.")
    for t in tables:
        if not (0 <= t.x <= r.room_w and 0 <= t.z <= r.room_d):
            raise HTTPException(status_code=422, detail=f"La table « {t.label} » est hors de la salle.")
    existing = {t.id: t for t in session.exec(select(DiningTable).where(DiningTable.restaurant_id == r.id)).all()}
    keep = set()
    for t in tables:
        row = existing.get(t.id) if t.id else None
        if t.id and not row:
            raise HTTPException(status_code=422, detail="Table inconnue.")
        row = row or DiningTable(restaurant_id=r.id, label=t.label)
        row.label, row.seats, row.shape, row.zone = t.label.strip(), t.seats, t.shape, t.zone
        row.x, row.z, row.rotation, row.is_active = round(t.x, 2), round(t.z, 2), t.rotation % 360, t.is_active
        session.add(row)
        session.flush()
        keep.add(row.id)
    today = svc.local_now().date()
    for tid, row in existing.items():
        if tid in keep:
            continue
        used = session.exec(select(func.count(Reservation.id)).where(Reservation.table_id == tid)).one()
        future = session.exec(select(func.count(Reservation.id)).where(Reservation.table_id == tid, Reservation.day >= today, Reservation.status.in_(("pending", "confirmed", "seated")))).one()
        if future:
            raise HTTPException(status_code=409, detail=f"La table « {row.label} » a des réservations à venir : déplacez-les avant de la supprimer.")
        if used:
            row.is_active = False  # conserve l'historique
            session.add(row)
        else:
            session.delete(row)
    session.commit()
    return owner_view(session, r)


# --- Réservations ------------------------------------------------------------------

@router.get("/restaurants/{rid}/reservations")
def list_reservations(rid: int, day: Optional[date] = None, status: Optional[str] = None, upcoming: bool = False, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    stmt = select(Reservation).where(Reservation.restaurant_id == r.id)
    if day:
        stmt = stmt.where(Reservation.day == day)
    if upcoming:
        stmt = stmt.where(Reservation.day >= svc.local_now().date())
    if status:
        stmt = stmt.where(Reservation.status.in_(status.split(",")))
    rows = session.exec(stmt.order_by(Reservation.day, Reservation.time).limit(300)).all()
    return [svc.reservation_read(x) for x in rows]


class ActionIn(BaseModel):
    action: str
    table_id: Optional[int] = None
    reason: str = Field(default="", max_length=300)


FLOW = {  # action → (statuts de départ, statut d'arrivée)
    "confirm": (("pending",), "confirmed"),
    "decline": (("pending",), "declined"),
    "seat": (("confirmed",), "seated"),
    "complete": (("seated", "confirmed"), "completed"),
    "no_show": (("confirmed",), "no_show"),
    "cancel": (("pending", "confirmed"), "cancelled"),
}


@router.post("/reservations/{code}/action")
def act(code: str, p: ActionIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    x = session.exec(select(Reservation).where(Reservation.code == code)).first()
    if not x:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    r = _mine(session, x.restaurant_id, user)
    if p.action == "move":
        if x.status not in ("pending", "confirmed"):
            raise HTTPException(status_code=409, detail="Cette réservation ne peut plus changer de table.")
        t = session.get(DiningTable, p.table_id) if p.table_id else None
        if not t or t.restaurant_id != r.id or not t.is_active:
            raise HTTPException(status_code=422, detail="Table introuvable.")
        if t.seats < x.party_size:
            raise HTTPException(status_code=422, detail="Cette table est trop petite pour le groupe.")
        if t.id in svc.taken_table_ids(session, r, x.day, x.time, exclude_code=x.code):
            raise HTTPException(status_code=409, detail="Cette table est déjà prise à cette heure.")
        x.table_id, x.table_label = t.id, t.label
        svc.notify(session, x.user_id, "Table modifiée", f"{r.name} : votre table est maintenant {t.label} ({x.day.isoformat()} {x.time}).")
    elif p.action in FLOW:
        src, dst = FLOW[p.action]
        if x.status not in src:
            raise HTTPException(status_code=409, detail="Action impossible pour l'état actuel de la réservation.")
        x.status = dst
        if p.action in ("decline", "cancel"):
            x.decline_reason = p.reason.strip() or None
        msgs = {"confirm": "confirmée", "decline": "refusée", "cancel": "annulée par le restaurant", "no_show": "marquée comme non honorée"}
        if p.action in msgs:
            extra = f" Motif : {x.decline_reason}." if x.decline_reason else ""
            svc.notify(session, x.user_id, f"Réservation {msgs[p.action]}", f"{r.name} · {x.day.isoformat()} à {x.time} ({x.code}).{extra}")
    else:
        raise HTTPException(status_code=422, detail="Action inconnue.")
    x.updated_at = svc.local_now()
    session.add(x)
    session.commit()
    return svc.reservation_read(x)


# --- Statistiques ------------------------------------------------------------------

@router.get("/restaurants/{rid}/stats")
def stats(rid: int, days: int = 30, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    r = _mine(session, rid, user)
    days = max(7, min(days, 180))
    today = svc.local_now().date()
    start = today - timedelta(days=days - 1)
    rows = session.exec(select(Reservation).where(Reservation.restaurant_id == r.id, Reservation.day >= start)).all()
    by_status = Counter(x.status for x in rows)
    honoured = [x for x in rows if x.status in ("seated", "completed")]
    decided = by_status["completed"] + by_status["seated"] + by_status["no_show"]
    series = {(start + timedelta(days=i)).isoformat(): 0 for i in range(days)}
    for x in honoured:
        series[x.day.isoformat()] = series.get(x.day.isoformat(), 0) + x.party_size
    dishes: Counter = Counter()
    value = 0.0
    for x in rows:
        if x.status in ("completed", "seated"):
            value += x.preorder_total
            try:
                for ln in json.loads(x.preorder or "[]"):
                    dishes[ln["name"]] += int(ln["qty"])
            except Exception:  # noqa: BLE001
                pass
    upcoming = session.exec(select(func.count(Reservation.id)).where(Reservation.restaurant_id == r.id, Reservation.day >= today, Reservation.status.in_(("pending", "confirmed")))).one()
    today_rows = [x for x in session.exec(select(Reservation).where(Reservation.restaurant_id == r.id, Reservation.day == today, Reservation.status.in_(("pending", "confirmed", "seated")))).all()]
    return {
        "days": days, "reservations": len(rows), "by_status": dict(by_status), "covers": sum(x.party_size for x in honoured),
        "no_show_rate": round(by_status["no_show"] / decided * 100, 1) if decided else 0, "preorder_value": round(value, 2),
        "upcoming": int(upcoming), "today": len(today_rows), "today_covers": sum(x.party_size for x in today_rows),
        "series": [{"date": d, "value": v} for d, v in sorted(series.items())], "top_dishes": [{"name": n, "qty": q} for n, q in dishes.most_common(5)],
        "rating_avg": r.rating_avg, "rating_count": r.rating_count,
    }
