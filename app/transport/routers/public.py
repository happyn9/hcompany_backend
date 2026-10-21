"""H-Transport — catalogue public et côté voyageur : recherche, réservation +
paiement (séquestre), mes billets, annulation, litige, avis."""
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_user
from app.models import PaymentMethod, User
from app.routers.learning_plans import OPERATOR_LABELS, OPERATOR_PREFIXES, normalize_zm_phone
from app.services.payments import charge as charge_payment
from app.services.rate_limit import limiter
from app.transport import schemas as S
from app.transport import views
from app.transport.models import BUS_TYPES, TransportBooking, TransportOperator, TransportPassenger, TransportReview, TransportTrip
from app.transport.services import (
    AMENITIES, CITIES, add_event, create_booking, dispute_window_open, expire_overdue, fail_booking, mark_paid, notify_user, now_local,
    policy, refresh_review_stats, refund_for_cancellation, settle_refund,
)

router = APIRouter(prefix="/api/v1/transport", tags=["transport"])


@router.get("/meta")
def meta(session: Session = Depends(get_session)):
    return {
        "cities": CITIES, "bus_types": list(BUS_TYPES), "policy": policy(session),
        "amenities": [{"key": k, "fr": v[0], "en": v[1]} for k, v in AMENITIES.items()],
    }


@router.get("/routes/popular", response_model=list[S.PopularRoute])
def popular(session: Session = Depends(get_session)):
    expire_overdue(session)
    rows = session.exec(
        select(TransportTrip.origin, TransportTrip.destination, func.min(TransportTrip.price), func.count(TransportTrip.id))
        .join(TransportOperator, TransportOperator.id == TransportTrip.operator_id)
        .where(TransportTrip.status == "scheduled", TransportTrip.departure_at > now_local(), TransportOperator.status == "approved")
        .group_by(TransportTrip.origin, TransportTrip.destination).order_by(func.count(TransportTrip.id).desc()).limit(8)
    ).all()
    return [S.PopularRoute(origin=o, destination=d, min_price=float(p), trips=int(n)) for o, d, p, n in rows]


@router.get("/trips", response_model=list[S.TripCard])
def search(
    origin: str = "", destination: str = "", date_: Optional[date] = Query(default=None, alias="date"), seats: int = Query(default=1, ge=1, le=20),
    sort: str = "time", max_price: Optional[float] = None, bus_type: str = "", border: Optional[bool] = None,
    session: Session = Depends(get_session),
):
    expire_overdue(session)
    stmt = (select(TransportTrip).join(TransportOperator, TransportOperator.id == TransportTrip.operator_id)
            .where(TransportTrip.status == "scheduled", TransportOperator.status == "approved", TransportTrip.departure_at > now_local()))
    if origin.strip():
        stmt = stmt.where(func.lower(TransportTrip.origin) == origin.strip().lower())
    if destination.strip():
        stmt = stmt.where(func.lower(TransportTrip.destination) == destination.strip().lower())
    if date_:
        stmt = stmt.where(TransportTrip.departure_at >= datetime.combine(date_, datetime.min.time()),
                          TransportTrip.departure_at < datetime.combine(date_ + timedelta(days=1), datetime.min.time()))
    if max_price:
        stmt = stmt.where(TransportTrip.price <= max_price)
    if bus_type in BUS_TYPES:
        stmt = stmt.where(TransportTrip.bus_type == bus_type)
    if border is not None:
        stmt = stmt.where(TransportTrip.border_crossing == border)
    cards = [views.trip_card(session, t) for t in session.exec(stmt.order_by(TransportTrip.departure_at).limit(200)).all()]
    cards = [c for c in cards if c.seats_left >= seats or not c.bookable]
    if sort == "price":
        cards.sort(key=lambda c: (c.price, c.departure_at))
    elif sort == "rating":
        cards.sort(key=lambda c: (-c.operator.rating_avg, c.departure_at))
    elif sort == "duration":
        cards.sort(key=lambda c: (c.duration_minutes, c.departure_at))
    return cards


@router.get("/trips/{trip_id}", response_model=S.TripDetail)
def trip(trip_id: int, session: Session = Depends(get_session)):
    expire_overdue(session)
    t = session.get(TransportTrip, trip_id)
    op = session.get(TransportOperator, t.operator_id) if t else None
    if not t or not op or op.status != "approved":
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    return views.trip_detail(session, t)


@router.get("/operators/{operator_id}/reviews", response_model=list[S.ReviewRead])
def operator_reviews(operator_id: int, session: Session = Depends(get_session)):
    rows = session.exec(select(TransportReview).where(TransportReview.operator_id == operator_id, TransportReview.is_hidden == False)  # noqa: E712
                        .order_by(TransportReview.created_at.desc()).limit(50)).all()
    return [views.review_read(session, r) for r in rows]


@router.post("/book", response_model=S.CheckoutResponse, status_code=201)
@limiter.limit("20/hour")
def book(request: Request, payload: S.BookRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if payload.method not in OPERATOR_PREFIXES:
        raise HTTPException(status_code=422, detail="Choisissez un moyen de paiement mobile money.")
    phone = normalize_zm_phone(payload.phone)
    if not phone:
        raise HTTPException(status_code=422, detail="Numéro mobile money invalide (ex. 097 1234567).")
    if phone[1:3] not in OPERATOR_PREFIXES[payload.method]:
        raise HTTPException(status_code=422, detail=f"Ce numéro n'est pas un numéro {OPERATOR_LABELS[payload.method]}. Choisissez le bon opérateur.")
    t = session.get(TransportTrip, payload.trip_id)
    if not t:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    op = session.get(TransportOperator, t.operator_id)
    if op and op.user_id == user.id:
        raise HTTPException(status_code=422, detail="Vous ne pouvez pas réserver un départ de votre propre agence.")
    checkout, b = create_booking(session, t, user, passengers=[p.model_dump() for p in payload.passengers], contact_name=payload.contact_name,
                                 contact_phone=payload.contact_phone, method=payload.method, phone=phone)
    session.commit()  # les sièges sont gardés pendant le paiement
    result = charge_payment(PaymentMethod(payload.method), b.total, checkout.reference, phone)
    if not result.success:
        fail_booking(session, checkout, b, result.failure_reason or "Le paiement a été refusé.")
        session.commit()
        raise HTTPException(status_code=402, detail=checkout.failure_reason)
    mark_paid(session, checkout, b, simulated=result.simulated, provider_reference=result.provider_reference)
    session.commit()
    notify_user(session, user.id, f"Billet confirmé {b.code}",
                f"{b.origin} → {b.destination}, départ le {b.departure_at:%d/%m/%Y à %H:%M}. Présentez le QR code de chaque passager à l'embarquement.", user.email)
    session.commit()
    return S.CheckoutResponse(reference=checkout.reference, total=checkout.total, status=checkout.status, simulated=checkout.simulated,
                              booking=views.booking_read(session, b))


def _mine(session: Session, code: str, user: User) -> TransportBooking:
    b = session.exec(select(TransportBooking).where(TransportBooking.code == code.upper(), TransportBooking.user_id == user.id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return b


@router.get("/me/bookings", response_model=list[S.BookingRead])
def my_bookings(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    expire_overdue(session)
    rows = session.exec(select(TransportBooking).where(TransportBooking.user_id == user.id, TransportBooking.paid_at != None)  # noqa: E711
                        .order_by(TransportBooking.departure_at.desc())).all()
    return [views.booking_read(session, b) for b in rows]


@router.get("/me/bookings/{code}", response_model=S.BookingRead)
def my_booking(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    expire_overdue(session)
    return views.booking_read(session, _mine(session, code, user))


@router.post("/me/bookings/{code}/cancel", response_model=S.BookingRead)
def cancel_booking(code: str, payload: S.CancelRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _mine(session, code, user)
    if b.status != "confirmed" or b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée.")
    if b.departure_at <= now_local():
        raise HTTPException(status_code=409, detail="Le départ a eu lieu : ouvrez un litige si besoin.")
    if any(p.boarded_at for p in session.exec(select(TransportPassenger).where(TransportPassenger.booking_id == b.id)).all()):
        raise HTTPException(status_code=409, detail="Un passager a déjà embarqué.")
    settle_refund(session, b, refund_for_cancellation(session, b), status="cancelled_user", actor="user", reason=payload.reason or "Annulée par le voyageur")
    op = session.get(TransportOperator, b.operator_id)
    if op:
        notify_user(session, op.user_id, f"Réservation {b.code} annulée", f"{b.contact_name} a annulé {b.seats} place(s) {b.origin} → {b.destination}. Les sièges sont libérés.")
    session.commit()
    return views.booking_read(session, b)


@router.post("/me/bookings/{code}/dispute", response_model=S.BookingRead)
def open_dispute(code: str, payload: S.DisputeRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _mine(session, code, user)
    if not dispute_window_open(session, b):
        raise HTTPException(status_code=409, detail="Un litige ne peut plus être ouvert pour cette réservation.")
    b.status, b.dispute_reason, b.dispute_note, b.dispute_opened_at = "disputed", payload.reason, payload.note, datetime.utcnow()
    session.add(b)
    add_event(session, b, "disputed", actor="user", note=payload.reason)
    op = session.get(TransportOperator, b.operator_id)
    if op:
        notify_user(session, op.user_id, f"Litige sur {b.code}", f"Motif : {payload.reason}. Les fonds restent bloqués le temps de l'examen par H-Company.")
    session.commit()
    return views.booking_read(session, b)


@router.post("/reviews", response_model=S.ReviewRead, status_code=201)
def create_review(payload: S.ReviewCreate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _mine(session, payload.booking_code, user)
    if b.status != "completed" or b.escrow_status != "released":
        raise HTTPException(status_code=409, detail="Vous pourrez donner votre avis une fois le voyage terminé.")
    if session.exec(select(TransportReview).where(TransportReview.booking_id == b.id)).first():
        raise HTTPException(status_code=409, detail="Vous avez déjà donné votre avis.")
    r = TransportReview(operator_id=b.operator_id, booking_id=b.id, user_id=user.id, author_name=(user.full_name or "Voyageur").split(" ")[0],
                        route=f"{b.origin} → {b.destination}", rating=payload.rating, comment=payload.comment)
    session.add(r)
    session.flush()
    refresh_review_stats(session, b.operator_id)
    session.commit()
    session.refresh(r)
    return views.review_read(session, r)
