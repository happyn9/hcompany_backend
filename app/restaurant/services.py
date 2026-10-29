"""Logique métier H-Restaurant : créneaux, disponibilité des tables, attribution, réservations, avis, vues."""
from __future__ import annotations

import json
import logging
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.models import User
from app.restaurant.models import (
    BLOCKING_STATUSES, DiningTable, MenuCategory, MenuItem, Reservation, Restaurant, RestaurantImage, RestaurantReview,
)
from app.services.notifications import create_in_app_notification, send_email
from app.shopping.services import slugify, unique_slug  # noqa: F401  (réexportés)

logger = logging.getLogger("hcompany.restaurant")
STEP = 30           # pas des créneaux proposés (minutes)
MAX_ADVANCE = 60    # réservation possible jusqu'à N jours à l'avance
MAX_ACTIVE_PER_USER = 6
COMMISSION_PCT = 5  # part H-Company sur la valeur des pré-commandes honorées (statistiques)


def local_now() -> datetime:
    """Heure locale de la Zambie (UTC+2), sans dépendre du fuseau du serveur."""
    return datetime.utcnow() + timedelta(hours=2)


def to_min(hhmm: str) -> int:
    try:
        h, m = hhmm.split(":")
        v = int(h) * 60 + int(m)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=422, detail="Heure invalide (HH:MM).")
    if not 0 <= v < 24 * 60:
        raise HTTPException(status_code=422, detail="Heure invalide (HH:MM).")
    return v


def to_hhmm(v: int) -> str:
    return f"{v // 60:02d}:{v % 60:02d}"


def closed_set(r: Restaurant) -> set[int]:
    return {int(x) for x in (r.closed_days or "").split(",") if x.strip().isdigit()}


def slot_times(r: Restaurant) -> list[str]:
    o, c = to_min(r.open_time), to_min(r.close_time)
    last = c - r.slot_minutes if c > o else 24 * 60 - r.slot_minutes
    return [to_hhmm(t) for t in range(o, last + 1, STEP)]


def check_slot(r: Restaurant, day: date, time: str) -> None:
    now = local_now()
    if day < now.date() or day > now.date() + timedelta(days=MAX_ADVANCE):
        raise HTTPException(status_code=422, detail=f"Choisissez une date dans les {MAX_ADVANCE} prochains jours.")
    if day.weekday() in closed_set(r):
        raise HTTPException(status_code=422, detail="Le restaurant est fermé ce jour-là.")
    if time not in slot_times(r):
        raise HTTPException(status_code=422, detail="Créneau indisponible : choisissez une heure proposée.")
    if day == now.date() and to_min(time) < now.hour * 60 + now.minute + 30:
        raise HTTPException(status_code=422, detail="Ce créneau est trop proche : réservez au moins 30 minutes à l'avance.")


def _overlap(t1: str, d1: int, t2: str, d2: int) -> bool:
    a, b = to_min(t1), to_min(t2)
    return a < b + d2 and b < a + d1


def taken_table_ids(session: Session, r: Restaurant, day: date, time: str, exclude_code: Optional[str] = None) -> set[int]:
    rows = session.exec(select(Reservation).where(Reservation.restaurant_id == r.id, Reservation.day == day, Reservation.status.in_(BLOCKING_STATUSES), Reservation.table_id != None)).all()  # noqa: E711
    return {x.table_id for x in rows if x.code != exclude_code and _overlap(time, r.slot_minutes, x.time, x.duration_minutes)}


def active_tables(session: Session, r: Restaurant) -> list[DiningTable]:
    return session.exec(select(DiningTable).where(DiningTable.restaurant_id == r.id, DiningTable.is_active == True).order_by(DiningTable.seats, DiningTable.id)).all()  # noqa: E712


def tables_for_slot(session: Session, r: Restaurant, day: date, time: str, party: int) -> list[dict]:
    taken = taken_table_ids(session, r, day, time)
    out = []
    for t in active_tables(session, r):
        status = "taken" if t.id in taken else "too_small" if t.seats < party else "free"
        out.append({"id": t.id, "label": t.label, "seats": t.seats, "shape": t.shape, "zone": t.zone, "x": t.x, "z": t.z, "rotation": t.rotation, "status": status})
    return out


def pick_table(session: Session, r: Restaurant, day: date, time: str, party: int) -> Optional[DiningTable]:
    taken = taken_table_ids(session, r, day, time)
    fits = [t for t in active_tables(session, r) if t.id not in taken and t.seats >= party]
    return min(fits, key=lambda t: (t.seats - party, t.id)) if fits else None


def free_counts(session: Session, r: Restaurant, day: date, party: int) -> dict[str, int]:
    """Nombre de tables libres adaptées au groupe, pour chaque créneau du jour."""
    out = {}
    for t in slot_times(r):
        out[t] = sum(1 for x in tables_for_slot(session, r, day, t, party) if x["status"] == "free")
    return out


def new_code(session: Session) -> str:
    for _ in range(10):
        code = "RS-" + secrets.token_hex(3).upper()
        if not session.exec(select(Reservation.id).where(Reservation.code == code)).first():
            return code
    raise HTTPException(status_code=500, detail="Réessayez dans un instant.")


def build_preorder(session: Session, r: Restaurant, lines: list) -> tuple[str, float]:
    if not lines:
        return "[]", 0.0
    if not r.accepts_preorder:
        raise HTTPException(status_code=422, detail="Ce restaurant n'accepte pas la pré-commande.")
    out, total = [], 0.0
    for ln in lines[:30]:
        it = session.get(MenuItem, ln.item_id)
        if not it or it.restaurant_id != r.id or not it.is_available:
            raise HTTPException(status_code=422, detail="Un plat de la pré-commande n'est plus disponible.")
        out.append({"item_id": it.id, "name": it.name, "qty": ln.qty, "price": it.price})
        total += it.price * ln.qty
    return json.dumps(out, ensure_ascii=False), round(total, 2)


def notify(session: Session, user_id: Optional[int], title: str, body: str, email: Optional[str] = None) -> None:
    try:
        if user_id:
            create_in_app_notification(session, user_id, title, body)
        if email:
            send_email(email, f"H-Restaurant — {title}", f"{body}\n\n— H-Restaurant, par H-Company")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Notification H-Restaurant non envoyée : %s", exc)


def refresh_rating(session: Session, r: Restaurant) -> None:
    avg, n = session.exec(select(func.coalesce(func.avg(RestaurantReview.rating), 0), func.count(RestaurantReview.id)).where(RestaurantReview.restaurant_id == r.id)).one()
    r.rating_avg, r.rating_count = round(float(avg), 2), int(n)
    session.add(r)


# --- Vues ---------------------------------------------------------------------

def images_of(session: Session, rid: int) -> list[str]:
    return [i.path for i in session.exec(select(RestaurantImage).where(RestaurantImage.restaurant_id == rid).order_by(RestaurantImage.sort_order, RestaurantImage.id)).all()]


def card(session: Session, r: Restaurant, free: Optional[int] = None) -> dict:
    imgs = images_of(session, r.id)
    return {
        "id": r.id, "slug": r.slug, "name": r.name, "summary": r.summary, "cuisines": [c for c in r.cuisines.split(",") if c], "city": r.city, "area": r.area,
        "price_level": r.price_level, "image": imgs[0] if imgs else None, "rating_avg": r.rating_avg, "rating_count": r.rating_count,
        "open_time": r.open_time, "close_time": r.close_time, "instant_confirm": r.instant_confirm, "is_featured": r.is_featured, "free_tables": free,
    }


def menu_of(session: Session, rid: int, include_hidden: bool = False) -> list[dict]:
    cats = session.exec(select(MenuCategory).where(MenuCategory.restaurant_id == rid).order_by(MenuCategory.sort_order, MenuCategory.id)).all()
    items = session.exec(select(MenuItem).where(MenuItem.restaurant_id == rid).order_by(MenuItem.sort_order, MenuItem.id)).all()
    if not include_hidden:
        items = [i for i in items if i.is_available]
    def row(i: MenuItem) -> dict:
        return {"id": i.id, "name": i.name, "description": i.description, "price": i.price, "image": i.image_path, "tags": [t for t in i.tags.split(",") if t], "is_available": i.is_available, "category_id": i.category_id}
    out = [{"id": c.id, "name": c.name, "items": [row(i) for i in items if i.category_id == c.id]} for c in cats]
    loose = [row(i) for i in items if i.category_id is None]
    if loose:
        out.append({"id": None, "name": "", "items": loose})
    return [c for c in out if c["items"] or include_hidden]


def detail(session: Session, r: Restaurant) -> dict:
    d = card(session, r)
    d.update({
        "description": r.description, "address": r.address, "latitude": r.latitude, "longitude": r.longitude, "phone": r.phone, "whatsapp": r.whatsapp,
        "images": images_of(session, r.id), "closed_days": sorted(closed_set(r)), "slot_minutes": r.slot_minutes, "max_party": r.max_party,
        "accepts_preorder": r.accepts_preorder, "has_terrace": r.has_terrace, "room_w": r.room_w, "room_d": r.room_d,
        "menu": menu_of(session, r.id), "slots": slot_times(r),
        "tables": [{"id": t.id, "label": t.label, "seats": t.seats, "shape": t.shape, "zone": t.zone, "x": t.x, "z": t.z, "rotation": t.rotation} for t in active_tables(session, r)],
    })
    return d


def reservation_read(x: Reservation) -> dict:
    try:
        pre = json.loads(x.preorder or "[]")
    except Exception:  # noqa: BLE001
        pre = []
    return {
        "id": x.id, "code": x.code, "restaurant_id": x.restaurant_id, "restaurant_name": x.restaurant_name, "table_id": x.table_id, "table_label": x.table_label,
        "name": x.name, "phone": x.phone, "party_size": x.party_size, "day": x.day.isoformat(), "time": x.time, "duration_minutes": x.duration_minutes, "status": x.status,
        "note": x.note, "preorder": pre, "preorder_total": x.preorder_total, "decline_reason": x.decline_reason, "created_at": x.created_at.isoformat(),
    }
