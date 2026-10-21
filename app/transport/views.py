"""Assemblage des réponses H-Transport."""
from datetime import timedelta
from typing import Optional

from sqlmodel import Session, func, select

from app.models import User
from app.transport import schemas as S
from app.transport.models import (
    TransportBooking, TransportEvent, TransportOperator, TransportPassenger, TransportReview, TransportTrip,
)
from app.transport.services import (
    dispute_window_open, get_float, is_bookable, now_local, refund_for_cancellation, seats_left, taken_seats, wallet,
)


def csv(v: str) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()]


def operator_public(session: Session, op: TransportOperator) -> S.OperatorPublic:
    n = session.exec(select(func.count(TransportTrip.id)).where(TransportTrip.operator_id == op.id, TransportTrip.status != "cancelled")).one()
    return S.OperatorPublic(id=op.id, name=op.name, description=op.description, city=op.city, is_verified=op.is_verified,
                            rating_avg=op.rating_avg, rating_count=op.rating_count, trips_count=int(n))


def trip_card(session: Session, t: TransportTrip, op: Optional[TransportOperator] = None) -> S.TripCard:
    op = op or session.get(TransportOperator, t.operator_id)
    reason = is_bookable(session, t)
    left = seats_left(session, t)
    if not reason and left <= 0:
        reason = "Complet."
    return S.TripCard(
        id=t.id, origin=t.origin, destination=t.destination, origin_stop=t.origin_stop, destination_stop=t.destination_stop,
        departure_at=t.departure_at, arrival_at=t.arrival_at, duration_minutes=int((t.arrival_at - t.departure_at).total_seconds() // 60),
        price=t.price, bus_type=t.bus_type, amenities=csv(t.amenities), seats_total=t.seats_total, seats_left=left,
        border_crossing=t.border_crossing, bookable=reason is None, closed_reason=reason, operator=operator_public(session, op),
    )


def review_read(session: Session, r: TransportReview, *, with_operator: bool = False) -> S.ReviewRead:
    name = None
    if with_operator:
        op = session.get(TransportOperator, r.operator_id)
        name = op.name if op else None
    return S.ReviewRead(id=r.id, operator_id=r.operator_id, author_name=r.author_name or "Voyageur", route=r.route, rating=r.rating,
                        comment=r.comment, reply=r.reply, is_hidden=r.is_hidden, operator_name=name, created_at=r.created_at)


def trip_detail(session: Session, t: TransportTrip) -> S.TripDetail:
    base = trip_card(session, t).model_dump()
    reviews = session.exec(select(TransportReview).where(TransportReview.operator_id == t.operator_id, TransportReview.is_hidden == False)  # noqa: E712
                           .order_by(TransportReview.created_at.desc()).limit(10)).all()
    return S.TripDetail(
        **base, stops=csv(t.stops), luggage_note=t.luggage_note, notes=t.notes, taken_seats=taken_seats(session, t.id), status=t.status,
        max_per_booking=int(get_float(session, "max_seats_per_booking")), free_cancel_hours=get_float(session, "free_cancel_hours"),
        partial_cancel_hours=get_float(session, "partial_cancel_hours"), reviews=[review_read(session, r) for r in reviews],
    )


def trip_owner(session: Session, t: TransportTrip) -> S.TripOwnerRead:
    base = trip_card(session, t).model_dump()
    rows = session.exec(select(TransportBooking).where(TransportBooking.trip_id == t.id, TransportBooking.escrow_status.in_(("held", "released")))).all()
    seats = sum(b.seats for b in rows if b.status in ("confirmed", "boarded", "completed", "disputed"))
    boarded = session.exec(select(func.count(TransportPassenger.id)).where(TransportPassenger.trip_id == t.id, TransportPassenger.boarded_at != None)).one()  # noqa: E711
    return S.TripOwnerRead(**base, stops=csv(t.stops), luggage_note=t.luggage_note, notes=t.notes, status=t.status, cancel_reason=t.cancel_reason,
                           booked_seats=seats, revenue=round(sum(b.total for b in rows if b.status != "cancelled_operator"), 2), boarded=int(boarded))


def operator_owner(session: Session, op: TransportOperator) -> S.OperatorOwnerRead:
    from app.transport.services import commission_rate_for
    return S.OperatorOwnerRead(
        id=op.id, name=op.name, description=op.description, city=op.city, phone=op.phone, whatsapp=op.whatsapp, status=op.status,
        status_reason=op.status_reason, is_verified=op.is_verified, commission_rate=commission_rate_for(session, op),
        mobile_money_operator=op.mobile_money_operator, mobile_money_phone=op.mobile_money_phone, rating_avg=op.rating_avg, rating_count=op.rating_count)


def passenger_read(p: TransportPassenger) -> S.PassengerRead:
    return S.PassengerRead(id=p.id, name=p.name, phone=p.phone, document=p.document, seat_number=p.seat_number, ticket_code=p.ticket_code,
                           boarded=p.boarded_at is not None, boarded_at=p.boarded_at)


def booking_read(session: Session, b: TransportBooking, *, viewer: str = "user") -> S.BookingRead:
    """viewer : user | operator | admin. Les coordonnées de l'agence ne sont
    données au voyageur qu'une fois le billet payé."""
    t = session.get(TransportTrip, b.trip_id)
    op = session.get(TransportOperator, b.operator_id)
    user = session.get(User, b.user_id)
    pax = session.exec(select(TransportPassenger).where(TransportPassenger.booking_id == b.id).order_by(TransportPassenger.seat_number)).all()
    events = session.exec(select(TransportEvent).where(TransportEvent.booking_id == b.id).order_by(TransportEvent.created_at, TransportEvent.id)).all()
    revealed = b.status in ("confirmed", "boarded", "completed", "disputed") or viewer != "user"
    can_cancel = b.status == "confirmed" and b.escrow_status == "held" and b.departure_at > now_local()
    reviewed = session.exec(select(TransportReview).where(TransportReview.booking_id == b.id)).first() is not None
    ended = b.status == "completed" or (b.status in ("boarded", "confirmed") and t is not None and t.arrival_at <= now_local())
    return S.BookingRead(
        code=b.code, status=b.status, trip_id=b.trip_id, origin=b.origin, destination=b.destination,
        origin_stop=t.origin_stop if t else "", destination_stop=t.destination_stop if t else "", departure_at=b.departure_at,
        arrival_at=t.arrival_at if t else None, bus_type=t.bus_type if t else "standard", seats=b.seats, unit_price=b.unit_price, total=b.total,
        commission_rate=b.commission_rate, commission_amount=b.commission_amount, operator_net=b.operator_net, refund_amount=b.refund_amount,
        escrow_status=b.escrow_status, contact_name=b.contact_name, contact_phone=b.contact_phone if (viewer != "user" or revealed) else b.contact_phone,
        user_email=user.email if user and viewer != "user" else None, operator_id=b.operator_id, operator_name=op.name if op else "",
        operator_display=op.name if op else "", operator_phone=(op.phone if op and revealed else None),
        operator_whatsapp=(op.whatsapp if op and revealed else None), passengers=[passenger_read(p) for p in pax],
        events=[S.EventRead(status=e.status, label=e.label, note=e.note, actor=e.actor, created_at=e.created_at) for e in events],
        dispute_reason=b.dispute_reason, dispute_note=b.dispute_note, cancel_reason=b.cancel_reason, can_cancel=can_cancel,
        refund_if_cancelled=refund_for_cancellation(session, b) if can_cancel else None, can_dispute=dispute_window_open(session, b),
        can_review=ended and b.escrow_status == "released" and not reviewed and b.status == "completed", reviewed=reviewed,
        created_at=b.created_at, paid_at=b.paid_at,
    )


def payout_read(session: Session, p, *, with_operator: bool = False) -> S.PayoutRead:
    name = None
    if with_operator:
        op = session.get(TransportOperator, p.operator_id)
        name = op.name if op else None
    return S.PayoutRead(id=p.id, reference=p.reference, amount=p.amount, operator=p.operator, phone=p.phone, status=p.status,
                        admin_note=p.admin_note, operator_name=name, created_at=p.created_at, processed_at=p.processed_at)


def wallet_read(session: Session, operator_id: int) -> S.WalletRead:
    return S.WalletRead(**wallet(session, operator_id))
