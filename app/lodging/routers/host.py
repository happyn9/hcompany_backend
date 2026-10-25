"""H-Logement — côté hôte : profil, logements, photos, calendrier (blocages,
tarifs saisonniers), réservations, messages, statistiques, solde et retraits,
réponses aux avis."""
import re
import secrets
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_user
from app.lodging import schemas as S
from app.lodging import views
from app.lodging.models import (
    Booking, BookingMessage, LodgeHost, LodgePayout, LodgeReview, PriceRule, Property, PropertyBlock, PropertyImage,
)
from app.lodging.services import (
    add_event, availability_conflict, clean_amenities, daterange, expire_overdue, get_float, host_accept, notify_user,
    refresh_review_stats, settle_refund, slugify, unique_slug, wallet,
)
from app.routers.partner_modules import require_module
from app.models import PartnerApplication, PartnerStatus, User, UserRole
from app.routers.learning_plans import OPERATOR_PREFIXES, normalize_zm_phone
from app.upload_store import save_upload

router = APIRouter(prefix="/api/v1/lodging/host", tags=["lodging-host"])

UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
LODGE_DIR = UPLOAD_ROOT / "lodging"
LODGE_DIR.mkdir(parents=True, exist_ok=True)
IMG_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAGIC = {".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".webp": b"RIFF"}
MAX_IMG = 5 * 1024 * 1024
MAX_PROPERTIES = 25
MAX_IMAGES = 20


def _host(session: Session, user: User, *, required: bool = True) -> Optional[LodgeHost]:
    h = session.exec(select(LodgeHost).where(LodgeHost.user_id == user.id)).first()
    if not h and required:
        raise HTTPException(status_code=404, detail="Créez d'abord votre profil d'hôte.")
    return h


def _my_property(session: Session, property_id: int, user: User) -> Property:
    h = _host(session, user)
    p = session.get(Property, property_id)
    if not p or p.host_id != h.id:
        raise HTTPException(status_code=404, detail="Logement introuvable.")
    return p


def _check_image_path(path: str, user: User) -> str:
    m = re.fullmatch(r"lodging/(\d+)-[0-9a-f]{12}\.(png|jpg|webp)", path or "")
    if not m or (int(m.group(1)) != user.id and user.role.value != "admin"):
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
    save_upload(UPLOAD_ROOT, f"lodging/{name}", data)
    return {"path": f"lodging/{name}"}


# --- Profil hôte ---------------------------------------------------------------

@router.get("/me", response_model=Optional[S.HostOwnerRead])
def my_host(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user, required=False)
    return views.host_owner(session, h) if h else None


def _apply_host(session: Session, h: LodgeHost, payload: S.HostWrite, user: User) -> None:
    if payload.avatar_path:
        _check_image_path(payload.avatar_path, user)
    phone = ""
    if payload.mobile_money_phone:
        phone = normalize_zm_phone(payload.mobile_money_phone)
        if not phone:
            raise HTTPException(status_code=422, detail="Numéro mobile money invalide.")
        if payload.mobile_money_operator and payload.mobile_money_operator not in OPERATOR_PREFIXES:
            raise HTTPException(status_code=422, detail="Opérateur mobile money inconnu.")
    h.display_name, h.bio, h.phone, h.whatsapp, h.languages = payload.display_name, payload.bio, payload.phone, payload.whatsapp, payload.languages
    h.avatar_path = payload.avatar_path or h.avatar_path
    h.mobile_money_operator, h.mobile_money_phone = payload.mobile_money_operator, phone


@router.put("/me", response_model=S.HostOwnerRead)
def save_host(payload: S.HostWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user, required=False)
    if not h:
        require_module(session, user, "lodging")
        partner = session.exec(select(PartnerApplication).where(PartnerApplication.user_id == user.id, PartnerApplication.status == PartnerStatus.approved)).first()
        h = LodgeHost(user_id=user.id, display_name=payload.display_name, partner_application_id=partner.id if partner else None)
    _apply_host(session, h, payload, user)
    session.add(h)
    session.commit()
    session.refresh(h)
    return views.host_owner(session, h)


# --- Logements -----------------------------------------------------------------

def _sync_images(session: Session, p: Property, paths: list[str], user: User) -> None:
    paths = paths[:MAX_IMAGES]
    for path in paths:
        _check_image_path(path, user)
    existing = {i.path: i for i in session.exec(select(PropertyImage).where(PropertyImage.property_id == p.id)).all()}
    for path, img in existing.items():
        if path not in paths:
            session.delete(img)
    for order, path in enumerate(paths):
        if path in existing:
            existing[path].sort_order = order
            session.add(existing[path])
        else:
            session.add(PropertyImage(property_id=p.id, path=path, sort_order=order))


def _validate_property(payload: S.PropertyWrite) -> None:
    if payload.min_nights > payload.max_nights:
        raise HTTPException(status_code=422, detail="Le séjour minimum dépasse le séjour maximum.")
    if payload.monthly_discount and payload.monthly_discount < payload.weekly_discount:
        raise HTTPException(status_code=422, detail="La remise mensuelle doit être au moins égale à la remise hebdomadaire.")
    if (payload.latitude is None) != (payload.longitude is None):
        raise HTTPException(status_code=422, detail="Renseignez la latitude ET la longitude (ou aucune des deux).")


def _fill(p: Property, payload: S.PropertyWrite) -> None:
    for f in ("title", "summary", "description", "type", "country", "city", "area", "address", "latitude", "longitude",
              "price_per_night", "cleaning_fee", "weekly_discount", "monthly_discount", "max_guests", "bedrooms", "beds",
              "bathrooms", "units", "min_nights", "max_nights", "check_in_from", "check_out_until", "house_rules",
              "cancellation_policy", "instant_book"):
        setattr(p, f, getattr(payload, f))
    p.amenities = clean_amenities(payload.amenities)
    p.updated_at = datetime.utcnow()


@router.get("/properties", response_model=list[S.PropertyOwnerRead])
def my_properties(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user, required=False)
    if not h:
        return []
    expire_overdue(session)
    rows = session.exec(select(Property).where(Property.host_id == h.id).order_by(Property.created_at.desc())).all()
    return [views.owner_read(session, p) for p in rows]


@router.post("/properties", response_model=S.PropertyOwnerRead, status_code=201)
def create_property(payload: S.PropertyWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user)
    if session.exec(select(func.count(Property.id)).where(Property.host_id == h.id)).one() >= MAX_PROPERTIES:
        raise HTTPException(status_code=409, detail=f"Vous pouvez publier jusqu'à {MAX_PROPERTIES} logements.")
    _validate_property(payload)
    p = Property(slug=unique_slug(session, Property, f"{payload.title}-{payload.city}"), host_id=h.id, price_per_night=payload.price_per_night)
    _fill(p, payload)
    session.add(p)
    session.flush()
    _sync_images(session, p, payload.images, user)
    session.commit()
    session.refresh(p)
    return views.owner_read(session, p)


@router.get("/properties/{property_id}", response_model=S.PropertyOwnerRead)
def get_property(property_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return views.owner_read(session, _my_property(session, property_id, user))


@router.put("/properties/{property_id}", response_model=S.PropertyOwnerRead)
def update_property(property_id: int, payload: S.PropertyWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_property(session, property_id, user)
    _validate_property(payload)
    if payload.units < p.units:  # on ne retire pas des chambres déjà promises
        today = date.today()
        future = session.exec(select(Booking).where(Booking.property_id == p.id, Booking.status.in_(("pending_host", "confirmed", "checked_in")), Booking.check_out > today)).all()
        peak = 0
        for b in future:
            used = sum(x.units for x in future if x.check_in < b.check_out and x.check_out > b.check_in)
            peak = max(peak, used)
        if payload.units < peak:
            raise HTTPException(status_code=409, detail=f"Des réservations à venir occupent jusqu'à {peak} chambre(s) en même temps.")
    _fill(p, payload)
    if p.status in ("active", "rejected") and payload.images is not None and not payload.images:
        raise HTTPException(status_code=422, detail="Un logement publié doit avoir au moins une photo.")
    _sync_images(session, p, payload.images, user)
    session.add(p)
    session.commit()
    session.refresh(p)
    return views.owner_read(session, p)


@router.post("/properties/{property_id}/submit", response_model=S.PropertyOwnerRead)
def submit_property(property_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Envoie le logement à la validation (ou le publie directement pour un hôte vérifié)."""
    p = _my_property(session, property_id, user)
    h = session.get(LodgeHost, p.host_id)
    if p.status not in ("draft", "rejected"):
        raise HTTPException(status_code=409, detail="Ce logement a déjà été soumis.")
    imgs = session.exec(select(func.count(PropertyImage.id)).where(PropertyImage.property_id == p.id)).one()
    problems = []
    if imgs < 3:
        problems.append("au moins 3 photos")
    if len(p.description) < 60:
        problems.append("une description d'au moins 60 caractères")
    if not (h.phone or h.whatsapp):
        problems.append("un numéro de téléphone ou WhatsApp dans votre profil d'hôte")
    if problems:
        raise HTTPException(status_code=422, detail="Pour publier, ajoutez : " + ", ".join(problems) + ".")
    if h.is_verified:
        p.status, p.approved_at = "active", datetime.utcnow()
    else:
        p.status = "pending"
        for admin in session.exec(select(User).where(User.role == UserRole.admin)).all():
            notify_user(session, admin.id, "Nouveau logement à valider", f"« {p.title} » ({p.city}) attend votre validation dans H-Logement.")
    p.status_reason = None
    session.add(p)
    session.commit()
    return views.owner_read(session, p)


@router.post("/properties/{property_id}/pause", response_model=S.PropertyOwnerRead)
def toggle_pause(property_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_property(session, property_id, user)
    if p.status == "active":
        p.status = "paused"
    elif p.status == "paused":
        p.status = "active"
    else:
        raise HTTPException(status_code=409, detail="Seul un logement publié peut être mis en pause.")
    session.add(p)
    session.commit()
    return views.owner_read(session, p)


@router.delete("/properties/{property_id}", status_code=204)
def delete_property(property_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_property(session, property_id, user)
    if session.exec(select(func.count(Booking.id)).where(Booking.property_id == p.id)).one():
        raise HTTPException(status_code=409, detail="Ce logement a un historique de réservations : mettez-le en pause plutôt que de le supprimer.")
    for model in (PropertyImage, PropertyBlock, PriceRule):
        for row in session.exec(select(model).where(model.property_id == p.id)).all():
            session.delete(row)
    session.delete(p)
    session.commit()


# --- Calendrier : blocages et tarifs saisonniers --------------------------------

@router.post("/properties/{property_id}/blocks", response_model=S.PropertyOwnerRead, status_code=201)
def add_block(property_id: int, payload: S.BlockWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_property(session, property_id, user)
    if payload.end_date <= payload.start_date:
        raise HTTPException(status_code=422, detail="La fin doit être après le début.")
    if payload.end_date > date.today() + timedelta(days=800):
        raise HTTPException(status_code=422, detail="Période trop éloignée.")
    booked = session.exec(select(Booking).where(
        Booking.property_id == p.id, Booking.status.in_(("pending_host", "confirmed", "checked_in")),
        Booking.check_in < payload.end_date, Booking.check_out > payload.start_date)).first()
    if booked:
        raise HTTPException(status_code=409, detail=f"Des dates sont déjà réservées ({booked.code}). Annulez ou terminez cette réservation d'abord.")
    session.add(PropertyBlock(property_id=p.id, start_date=payload.start_date, end_date=payload.end_date, reason=payload.reason))
    session.commit()
    return views.owner_read(session, p)


@router.delete("/properties/{property_id}/blocks/{block_id}", response_model=S.PropertyOwnerRead)
def delete_block(property_id: int, block_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_property(session, property_id, user)
    bl = session.get(PropertyBlock, block_id)
    if not bl or bl.property_id != p.id:
        raise HTTPException(status_code=404, detail="Blocage introuvable.")
    session.delete(bl)
    session.commit()
    return views.owner_read(session, p)


@router.post("/properties/{property_id}/rules", response_model=S.PropertyOwnerRead, status_code=201)
def add_rule(property_id: int, payload: S.RuleWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_property(session, property_id, user)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="La fin doit être après le début.")
    session.add(PriceRule(property_id=p.id, label=payload.label, start_date=payload.start_date, end_date=payload.end_date, price_per_night=payload.price_per_night))
    session.commit()
    return views.owner_read(session, p)


@router.delete("/properties/{property_id}/rules/{rule_id}", response_model=S.PropertyOwnerRead)
def delete_rule(property_id: int, rule_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_property(session, property_id, user)
    r = session.get(PriceRule, rule_id)
    if not r or r.property_id != p.id:
        raise HTTPException(status_code=404, detail="Tarif introuvable.")
    session.delete(r)
    session.commit()
    return views.owner_read(session, p)


# --- Réservations --------------------------------------------------------------

def _host_booking(session: Session, code: str, user: User) -> Booking:
    h = _host(session, user)
    b = session.exec(select(Booking).where(Booking.code == code.upper(), Booking.host_id == h.id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return b


@router.get("/bookings", response_model=list[S.BookingRead])
def host_bookings(status: Optional[str] = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user, required=False)
    if not h:
        return []
    expire_overdue(session)
    stmt = select(Booking).where(Booking.host_id == h.id, Booking.paid_at != None)  # noqa: E711
    if status:
        stmt = stmt.where(Booking.status == status)
    rows = session.exec(stmt.order_by(Booking.check_in.desc()).limit(300)).all()
    return [views.booking_read(session, b, viewer="host") for b in rows]


@router.post("/bookings/{code}/accept", response_model=S.BookingRead)
def accept_booking(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _host_booking(session, code, user)
    host_accept(session, b)
    session.commit()
    return views.booking_read(session, b, viewer="host")


@router.post("/bookings/{code}/decline", response_model=S.BookingRead)
def decline_booking(code: str, payload: S.CancelRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _host_booking(session, code, user)
    if b.status != "pending_host":
        raise HTTPException(status_code=409, detail="Cette demande n'est plus en attente.")
    settle_refund(session, b, b.total, status="declined", actor="host", reason=payload.reason or "Refusée par l'hôte")
    session.commit()
    return views.booking_read(session, b, viewer="host")


@router.post("/bookings/{code}/cancel", response_model=S.BookingRead)
def host_cancel_booking(code: str, payload: S.CancelRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Annulation par l'hôte : toujours remboursement intégral du voyageur."""
    b = _host_booking(session, code, user)
    if b.status not in ("confirmed", "pending_host"):
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée.")
    if len(payload.reason) < 3:
        raise HTTPException(status_code=422, detail="Indiquez le motif de l'annulation (il sera communiqué au voyageur).")
    settle_refund(session, b, b.total, status="cancelled_host", actor="host", reason=payload.reason)
    session.commit()
    return views.booking_read(session, b, viewer="host")


@router.get("/bookings/{code}/messages", response_model=list[S.MessageRead])
def host_messages(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _host_booking(session, code, user)
    rows = session.exec(select(BookingMessage).where(BookingMessage.booking_id == b.id).order_by(BookingMessage.created_at, BookingMessage.id)).all()
    return [S.MessageRead(id=m.id, sender_role=m.sender_role, body=m.body, created_at=m.created_at, mine=m.sender_id == user.id) for m in rows]


@router.post("/bookings/{code}/messages", response_model=list[S.MessageRead], status_code=201)
def host_send_message(code: str, payload: S.MessageCreate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _host_booking(session, code, user)
    session.add(BookingMessage(booking_id=b.id, sender_id=user.id, sender_role="host", body=payload.body))
    notify_user(session, b.guest_id, f"Message de l'hôte — {b.code}", payload.body[:140])
    session.commit()
    return host_messages(code, session, user)


# --- Statistiques, solde, retraits ------------------------------------------------

@router.get("/stats", response_model=S.HostStats)
def host_stats(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user)
    expire_overdue(session)
    today = date.today()
    props = session.exec(select(Property).where(Property.host_id == h.id)).all()
    ids = [p.id for p in props]
    paid = (Booking.host_id == h.id, Booking.paid_at != None)  # noqa: E711
    live = ("confirmed", "checked_in", "completed", "disputed")
    revenue = session.exec(select(func.coalesce(func.sum(Booking.host_net), 0)).where(*paid, Booking.escrow_status.in_(("held", "released")))).one()
    month = session.exec(select(func.coalesce(func.sum(Booking.host_net), 0)).where(
        *paid, Booking.escrow_status.in_(("held", "released")), Booking.created_at >= datetime.utcnow() - timedelta(days=30))).one()
    # Taux d'occupation sur les 30 prochains jours (nuits-chambres vendues / disponibles)
    cap = sum(p.units for p in props if p.status == "active") * 30
    sold = 0
    if cap:
        end = today + timedelta(days=30)
        for b in session.exec(select(Booking).where(Booking.host_id == h.id, Booking.status.in_(live), Booking.check_in < end, Booking.check_out > today)).all():
            sold += len(list(daterange(max(b.check_in, today), min(b.check_out, end)))) * b.units
    ratings = [(p.rating_avg, p.rating_count) for p in props if p.rating_count]
    n = sum(c for _, c in ratings)
    return S.HostStats(
        properties=len(props), active=sum(1 for p in props if p.status == "active"),
        bookings_total=session.exec(select(func.count(Booking.id)).where(*paid, Booking.status.in_(live))).one(),
        pending_requests=session.exec(select(func.count(Booking.id)).where(*paid, Booking.status == "pending_host")).one(),
        upcoming=session.exec(select(func.count(Booking.id)).where(*paid, Booking.status == "confirmed", Booking.check_in >= today)).one(),
        in_house=session.exec(select(func.count(Booking.id)).where(*paid, Booking.status == "checked_in", Booking.check_out > today)).one(),
        revenue=round(float(revenue), 2), month_revenue=round(float(month), 2),
        occupancy_30d=round(min(100.0, sold / cap * 100), 1) if cap else 0,
        rating_avg=round(sum(a * c for a, c in ratings) / n, 2) if n else 0, rating_count=n,
    )


@router.get("/wallet", response_model=S.WalletRead)
def host_wallet(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user)
    expire_overdue(session)
    return wallet(session, h.id)


def payout_read(session: Session, p: LodgePayout) -> S.PayoutRead:
    h = session.get(LodgeHost, p.host_id)
    return S.PayoutRead(id=p.id, reference=p.reference, host_id=p.host_id, amount=p.amount, operator=p.operator, phone=p.phone,
                        status=p.status, admin_note=p.admin_note, created_at=p.created_at, processed_at=p.processed_at,
                        host_name=h.display_name if h else None)


@router.get("/payouts", response_model=list[S.PayoutRead])
def host_payouts(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user)
    rows = session.exec(select(LodgePayout).where(LodgePayout.host_id == h.id).order_by(LodgePayout.created_at.desc())).all()
    return [payout_read(session, p) for p in rows]


@router.post("/payouts", response_model=S.PayoutRead, status_code=201)
def request_payout(payload: S.PayoutRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user)
    w = wallet(session, h.id)
    if not h.mobile_money_phone or h.mobile_money_operator not in OPERATOR_PREFIXES:
        raise HTTPException(status_code=422, detail="Renseignez votre numéro mobile money dans votre profil d'hôte avant de retirer.")
    if payload.amount < w["min_payout"]:
        raise HTTPException(status_code=422, detail=f"Retrait minimum : {w['min_payout']:.0f} ZMW.")
    if payload.amount > w["available"] + 1e-9:
        raise HTTPException(status_code=422, detail=f"Solde disponible insuffisant ({w['available']:.2f} ZMW).")
    p = LodgePayout(reference="HLW-" + secrets.token_hex(4).upper(), host_id=h.id, amount=round(payload.amount, 2),
                    operator=h.mobile_money_operator, phone=h.mobile_money_phone)
    session.add(p)
    for admin in session.exec(select(User).where(User.role == UserRole.admin)).all():
        notify_user(session, admin.id, "Demande de retrait H-Logement", f"{h.display_name} demande {p.amount:.2f} ZMW ({p.reference}).")
    session.commit()
    session.refresh(p)
    return payout_read(session, p)


# --- Avis ----------------------------------------------------------------------

@router.get("/reviews", response_model=list[S.ReviewRead])
def host_reviews(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user)
    ids = session.exec(select(Property.id).where(Property.host_id == h.id)).all()
    if not ids:
        return []
    rows = session.exec(select(LodgeReview).where(LodgeReview.property_id.in_(ids)).order_by(LodgeReview.created_at.desc()).limit(200)).all()
    return [views.review_read(session, r, with_property=True) for r in rows]


@router.post("/reviews/{review_id}/reply", response_model=S.ReviewRead)
def reply_review(review_id: int, payload: S.ReplyRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    h = _host(session, user)
    r = session.get(LodgeReview, review_id)
    p = session.get(Property, r.property_id) if r else None
    if not r or not p or p.host_id != h.id:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    r.host_reply = payload.reply
    session.add(r)
    session.commit()
    return views.review_read(session, r, with_property=True)
