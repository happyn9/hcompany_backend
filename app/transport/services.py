"""Logique métier H-Transport : réglages, disponibilité des sièges, réservation,
séquestre, annulation, litiges, solde agence."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.models import PartnerApplication, PartnerStatus, User
from app.services.notifications import create_in_app_notification, send_email
from app.shopping.services import money
from app.transport.models import (
    SEAT_HOLD_STATUSES, TransportBooking, TransportCheckout, TransportEvent, TransportOperator,
    TransportPassenger, TransportPayout, TransportReview, TransportSetting, TransportTrip,
)

logger = logging.getLogger("hcompany.transport")

DEFAULT_SETTINGS = {
    "commission_rate": "8",
    "free_cancel_hours": "48",
    "partial_cancel_hours": "12",
    "sales_close_minutes": "60",
    "release_hours": "12",
    "max_seats_per_booking": "8",
    "max_advance_days": "120",
    "hold_minutes": "15",
    "min_payout": "100",
}
AMENITIES = {
    "ac": ("Climatisation", "Air conditioning"), "wifi": ("Wi-Fi", "Wi-Fi"), "usb": ("Prises USB", "USB charging"),
    "toilet": ("Toilettes", "Toilet"), "reclining": ("Sièges inclinables", "Reclining seats"), "snacks": ("Collation", "Snacks"),
    "tv": ("Écran / musique", "TV / music"), "luggage": ("Bagage en soute inclus", "Luggage included"),
    "luggage_extra": ("Bagage supplémentaire payant", "Extra luggage (paid)"), "water": ("Eau offerte", "Free water"),
}
CITIES = [
    "Lusaka", "Kitwe", "Ndola", "Livingstone", "Kabwe", "Chipata", "Kasama", "Solwezi", "Mongu", "Mansa",
    "Choma", "Mazabuka", "Kapiri Mposhi", "Chingola", "Mufulira", "Luanshya", "Siavonga", "Petauke",
    "Lubumbashi", "Kolwezi", "Harare", "Johannesburg", "Dar es Salaam", "Nairobi",
]


def now_local() -> datetime:
    return datetime.utcnow() + timedelta(hours=2)


def get_setting(session: Session, key: str) -> str:
    row = session.get(TransportSetting, key)
    return row.value if row else DEFAULT_SETTINGS.get(key, "")


def get_float(session: Session, key: str) -> float:
    try:
        return float(get_setting(session, key))
    except ValueError:
        return float(DEFAULT_SETTINGS.get(key, "0"))


def all_settings(session: Session) -> dict:
    data = dict(DEFAULT_SETTINGS)
    for row in session.exec(select(TransportSetting)).all():
        data[row.key] = row.value
    return data


def policy(session: Session) -> dict:
    return {k: get_float(session, k) for k in DEFAULT_SETTINGS}


def commission_rate_for(session: Session, op: TransportOperator) -> float:
    return float(op.commission_rate) if op.commission_rate is not None else get_float(session, "commission_rate")


def clean_amenities(raw) -> str:
    keys = raw.split(",") if isinstance(raw, str) else (raw or [])
    out: list[str] = []
    for k in keys:
        k = (k or "").strip()
        if k in AMENITIES and k not in out:
            out.append(k)
    return ",".join(out)


def notify_user(session: Session, user_id: Optional[int], title: str, body: str, email: Optional[str] = None) -> None:
    try:
        if user_id:
            create_in_app_notification(session, user_id, title, body)
        if email:
            send_email(email, f"H-Transport — {title}", f"{body}\n\n— H-Transport, par H-Company")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Notification H-Transport non envoyée : %s", exc)


# --- Sièges -----------------------------------------------------------------

def taken_seats(session: Session, trip_id: int, exclude_booking: Optional[int] = None) -> list[int]:
    """Sièges occupés. Une réservation « en attente de paiement » garde ses sièges
    pendant `hold_minutes`, puis les libère."""
    hold = now_local() - timedelta(minutes=get_float(session, "hold_minutes"))
    stmt = (
        select(TransportPassenger.seat_number, TransportBooking.status, TransportBooking.created_at, TransportBooking.id)
        .join(TransportBooking, TransportBooking.id == TransportPassenger.booking_id)
        .where(TransportPassenger.trip_id == trip_id, TransportBooking.status.in_(SEAT_HOLD_STATUSES))
    )
    out = []
    for seat, status, created, bid in session.exec(stmt).all():
        if bid == exclude_booking:
            continue
        if status == "pending_payment" and created < hold:
            continue
        out.append(seat)
    return sorted(out)


def seats_left(session: Session, trip: TransportTrip) -> int:
    return max(0, trip.seats_total - len(taken_seats(session, trip.id)))


def is_bookable(session: Session, trip: TransportTrip) -> Optional[str]:
    """None si réservable, sinon la raison."""
    if trip.status != "scheduled":
        return "Ce départ n'est plus disponible."
    close = trip.departure_at - timedelta(minutes=get_float(session, "sales_close_minutes"))
    if now_local() >= close:
        return "Les ventes sont fermées pour ce départ."
    if trip.departure_at > now_local() + timedelta(days=get_float(session, "max_advance_days")):
        return "Ce départ n'est pas encore ouvert à la réservation."
    op = session.get(TransportOperator, trip.operator_id)
    if not op or op.status != "approved":
        return "Cette agence n'est pas disponible."
    return None


def assign_seats(session: Session, trip: TransportTrip, wanted: list[Optional[int]]) -> list[int]:
    taken = set(taken_seats(session, trip.id))
    result: list[Optional[int]] = []
    for s in wanted:
        if s is not None:
            if s < 1 or s > trip.seats_total:
                raise HTTPException(status_code=422, detail=f"Le siège {s} n'existe pas.")
            if s in taken or s in result:
                raise HTTPException(status_code=409, detail=f"Le siège {s} vient d'être pris. Choisissez-en un autre.")
            result.append(s)
        else:
            result.append(None)
    free = [n for n in range(1, trip.seats_total + 1) if n not in taken and n not in result]
    if len(free) < result.count(None):
        raise HTTPException(status_code=409, detail="Plus assez de places disponibles sur ce départ.")
    it = iter(free)
    return [s if s is not None else next(it) for s in result]


# --- Réservation ------------------------------------------------------------

EVENT_LABELS = {
    "pending_payment": "Réservation créée — en attente de paiement",
    "confirmed": "Billet confirmé — paiement sécurisé par H-Company",
    "boarded": "Embarquement validé",
    "completed": "Voyage terminé — paiement versé à l'agence",
    "expired": "Paiement non finalisé — sièges libérés",
    "cancelled_user": "Réservation annulée par le voyageur",
    "cancelled_operator": "Départ annulé par l'agence — remboursement intégral",
    "disputed": "Litige ouvert — H-Company examine le dossier",
}


def add_event(session: Session, b: TransportBooking, status: str, *, label: Optional[str] = None, note: str = "", actor: str = "system") -> None:
    session.add(TransportEvent(booking_id=b.id, status=status, label=label or EVENT_LABELS.get(status, status), note=note, actor=actor))


def _unique(session: Session, model, field, prefix: str, nbytes: int) -> str:
    for _ in range(10):
        code = prefix + secrets.token_hex(nbytes).upper()
        if not session.exec(select(model).where(field == code)).first():
            return code
    raise HTTPException(status_code=500, detail="Impossible de générer la référence.")


def create_booking(session: Session, trip: TransportTrip, user: User, *, passengers: list[dict], contact_name: str,
                   contact_phone: str, method: str, phone: str) -> tuple[TransportCheckout, TransportBooking]:
    reason = is_bookable(session, trip)
    if reason:
        raise HTTPException(status_code=409, detail=reason)
    n = len(passengers)
    if n < 1 or n > int(get_float(session, "max_seats_per_booking")):
        raise HTTPException(status_code=422, detail=f"Entre 1 et {int(get_float(session, 'max_seats_per_booking'))} passagers par réservation.")
    if trip.border_crossing:
        for p in passengers:
            if len((p.get("document") or "").strip()) < 5:
                raise HTTPException(status_code=422, detail="Ce trajet traverse une frontière : indiquez le n° de passeport ou de pièce d'identité de chaque passager.")
    seats = assign_seats(session, trip, [p.get("seat") for p in passengers])
    op = session.get(TransportOperator, trip.operator_id)
    rate = commission_rate_for(session, op)
    total = money(trip.price * n)
    commission = money(total * rate / 100)
    checkout = TransportCheckout(reference="HTP-" + secrets.token_hex(4).upper(), user_id=user.id, total=total, method=method, phone_number=phone)
    session.add(checkout)
    session.flush()
    b = TransportBooking(
        code=_unique(session, TransportBooking, TransportBooking.code, "HT-", 3), trip_id=trip.id, operator_id=trip.operator_id,
        user_id=user.id, checkout_id=checkout.id, seats=n, origin=trip.origin, destination=trip.destination,
        departure_at=trip.departure_at, unit_price=trip.price, total=total, commission_rate=rate, commission_amount=commission,
        operator_net=money(total - commission), contact_name=contact_name, contact_phone=contact_phone, created_at=now_local(),
    )
    session.add(b)
    session.flush()
    for p, seat in zip(passengers, seats):
        session.add(TransportPassenger(
            booking_id=b.id, trip_id=trip.id, name=p["name"].strip(), phone=(p.get("phone") or "").strip(),
            document=(p.get("document") or "").strip(), seat_number=seat,
            ticket_code=_unique(session, TransportPassenger, TransportPassenger.ticket_code, "T-", 4),
        ))
    add_event(session, b, "pending_payment", actor="user")
    return checkout, b


def mark_paid(session: Session, checkout: TransportCheckout, b: TransportBooking, *, simulated: bool, provider_reference: Optional[str]) -> None:
    now = datetime.utcnow()
    checkout.status, checkout.paid_at, checkout.simulated, checkout.provider_reference = "paid", now, simulated, provider_reference
    session.add(checkout)
    b.status, b.paid_at, b.escrow_status = "confirmed", now_local(), "held"
    session.add(b)
    add_event(session, b, "confirmed", note=f"Réf. paiement {checkout.reference}")
    op = session.get(TransportOperator, b.operator_id)
    op_user = session.get(User, op.user_id) if op else None
    notify_user(session, op.user_id if op else None, f"Nouvelle réservation {b.code}",
                f"{b.seats} place(s) {b.origin} → {b.destination}, départ le {b.departure_at:%d/%m à %H:%M}.",
                op_user.email if op_user else None)


def fail_booking(session: Session, checkout: TransportCheckout, b: TransportBooking, reason: str) -> None:
    checkout.status, checkout.failure_reason = "failed", reason
    b.status, b.cancel_reason = "expired", reason
    session.add(checkout)
    session.add(b)
    add_event(session, b, "expired", label="Paiement refusé — sièges libérés", note=reason)


def refund_for_cancellation(session: Session, b: TransportBooking) -> float:
    hours = (b.departure_at - now_local()).total_seconds() / 3600
    if hours >= get_float(session, "free_cancel_hours"):
        ratio = 1.0
    elif hours >= get_float(session, "partial_cancel_hours"):
        ratio = 0.5
    else:
        ratio = 0.0
    return money(b.total * ratio)


def settle_refund(session: Session, b: TransportBooking, refund: float, *, status: str, actor: str, reason: str) -> None:
    if b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Les fonds de cette réservation ne sont pas en séquestre.")
    refund = money(min(max(refund, 0), b.total))
    retained = money(b.total - refund)
    b.status, b.cancel_reason, b.refund_amount = status, reason, refund
    if retained <= 0:
        b.escrow_status, b.commission_amount, b.operator_net = "refunded", 0, 0
    else:
        keep = retained / b.total if b.total else 0
        b.commission_amount = money(b.commission_amount * keep)
        b.operator_net = money(retained - b.commission_amount)
        b.escrow_status, b.escrow_released_at = "released", datetime.utcnow()
    session.add(b)
    add_event(session, b, status, actor=actor, note=reason)
    msg = f"{refund:.2f} ZMW vous seront restitués sur votre mobile money." if refund > 0 else "Selon les conditions d'annulation, aucun remboursement n'est dû."
    notify_user(session, b.user_id, f"Réservation {b.code} annulée", msg)


def release_escrow(session: Session, b: TransportBooking, *, actor: str, note: str = "") -> None:
    if b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Les fonds de cette réservation ne sont pas en séquestre.")
    b.escrow_status, b.escrow_released_at = "released", datetime.utcnow()
    if b.status in ("disputed", "confirmed", "boarded"):
        b.status = "completed"
    session.add(b)
    add_event(session, b, "completed", actor=actor, label="Paiement versé à l'agence", note=note)
    op = session.get(TransportOperator, b.operator_id)
    notify_user(session, op.user_id if op else None, f"Paiement libéré — {b.code}", f"{b.operator_net:.2f} ZMW sont disponibles dans votre solde.")


def cancel_trip(session: Session, trip: TransportTrip, reason: str, actor: str) -> int:
    if trip.status != "scheduled":
        raise HTTPException(status_code=409, detail="Ce départ ne peut plus être annulé.")
    trip.status, trip.cancel_reason = "cancelled", reason
    session.add(trip)
    n = 0
    for b in session.exec(select(TransportBooking).where(TransportBooking.trip_id == trip.id)).all():
        if b.status == "pending_payment":
            b.status, b.cancel_reason = "expired", "Départ annulé"
            session.add(b)
            add_event(session, b, "expired", label="Départ annulé — réservation clôturée")
        elif b.status in ("confirmed", "boarded") and b.escrow_status == "held":
            settle_refund(session, b, b.total, status="cancelled_operator", actor=actor, reason=reason)
            n += 1
    return n


def dispute_window_open(session: Session, b: TransportBooking) -> bool:
    if b.escrow_status != "held" or b.status not in ("confirmed", "boarded"):
        return False
    return b.departure_at <= now_local() <= b.departure_at + timedelta(hours=get_float(session, "release_hours"))


def expire_overdue(session: Session) -> int:
    """Clôture ce que le temps décide (appelé à l'ouverture des tableaux de bord)."""
    now = now_local()
    changed = 0
    hold = now - timedelta(minutes=get_float(session, "hold_minutes"))
    for b in session.exec(select(TransportBooking).where(TransportBooking.status == "pending_payment", TransportBooking.created_at < hold)).all():
        b.status, b.cancel_reason = "expired", "Paiement non finalisé"
        session.add(b)
        add_event(session, b, "expired")
        changed += 1
    for t in session.exec(select(TransportTrip).where(TransportTrip.status == "scheduled", TransportTrip.departure_at <= now)).all():
        t.status = "departed"
        session.add(t)
        changed += 1
    for t in session.exec(select(TransportTrip).where(TransportTrip.status == "departed", TransportTrip.arrival_at <= now)).all():
        t.status = "completed"
        session.add(t)
        changed += 1
    release = timedelta(hours=get_float(session, "release_hours"))
    for b in session.exec(select(TransportBooking).where(TransportBooking.status.in_(("confirmed", "boarded")), TransportBooking.escrow_status == "held")).all():
        if now >= b.departure_at + release:
            release_escrow(session, b, actor="system", note=f"Libération automatique ({int(release.total_seconds() // 3600)} h après le départ, sans litige)")
            changed += 1
    if changed:
        session.commit()
    return changed


def refresh_review_stats(session: Session, operator_id: int) -> None:
    avg, n = session.exec(
        select(func.avg(TransportReview.rating), func.count(TransportReview.id)).where(TransportReview.operator_id == operator_id, TransportReview.is_hidden == False)  # noqa: E712
    ).one()
    op = session.get(TransportOperator, operator_id)
    if op:
        op.rating_avg, op.rating_count = round(float(avg or 0), 2), int(n or 0)
        session.add(op)


def wallet(session: Session, operator_id: int) -> dict:
    def total(col, *where):
        return float(session.exec(select(func.coalesce(func.sum(col), 0)).where(*where)).one())

    released = total(TransportBooking.operator_net, TransportBooking.operator_id == operator_id, TransportBooking.escrow_status == "released")
    pending = total(TransportBooking.operator_net, TransportBooking.operator_id == operator_id, TransportBooking.escrow_status == "held")
    out = total(TransportPayout.amount, TransportPayout.operator_id == operator_id, TransportPayout.status.in_(("requested", "paid")))
    paid = total(TransportPayout.amount, TransportPayout.operator_id == operator_id, TransportPayout.status == "paid")
    from app.transport.cargo import cargo_wallet
    cw = cargo_wallet(session, operator_id)
    released, pending = released + cw["released"], pending + cw["held"]
    return {"available": money(released - out), "pending": money(pending), "total_earned": money(released),
            "total_paid_out": money(paid), "min_payout": get_float(session, "min_payout")}


def auto_approve_partner(session: Session, user: User, op: TransportOperator) -> None:
    partner = session.exec(select(PartnerApplication).where(PartnerApplication.user_id == user.id, PartnerApplication.status == PartnerStatus.approved)).first()
    if partner:
        op.partner_application_id = partner.id
        op.status, op.is_verified, op.approved_at = "approved", True, datetime.utcnow()
