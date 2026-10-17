"""H-Logement — côté voyageur : réservation + paiement (séquestre), mes
séjours, annulation, litige, messages, avis, favoris."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.lodging import schemas as S
from app.lodging import views
from app.lodging.models import (
    Booking, BookingMessage, LodgeCheckout, LodgeFavorite, LodgeHost, LodgeReview, Property,
)
from app.lodging.services import (
    add_event, create_booking, dispute_window_open, expire_overdue, fail_booking, mark_paid, notify_user,
    quote_stay, refresh_review_stats, refund_for_cancellation, settle_refund,
)
from app.models import PaymentMethod, User
from app.routers.learning_plans import OPERATOR_LABELS, OPERATOR_PREFIXES, normalize_zm_phone
from app.services.payments import charge as charge_payment
from app.services.rate_limit import limiter

router = APIRouter(prefix="/api/v1/lodging", tags=["lodging-guest"])


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
    prop = session.get(Property, payload.property_id)
    if not prop or prop.status != "active":
        raise HTTPException(status_code=404, detail="Ce logement n'accepte plus de réservations.")
    host = session.get(LodgeHost, prop.host_id)
    if host and host.user_id == user.id:
        raise HTTPException(status_code=422, detail="Vous ne pouvez pas réserver votre propre logement.")

    quote = quote_stay(session, prop, payload.check_in, payload.check_out, payload.guests, payload.units)
    checkout, b = create_booking(
        session, prop, user, quote, guest_name=payload.guest_name, guest_phone=payload.guest_phone,
        arrival_time=payload.arrival_time, note=payload.note, method=payload.method, phone=phone,
    )
    session.commit()  # la réservation « pending » bloque déjà les dates pendant le paiement

    result = charge_payment(PaymentMethod(payload.method), quote["total"], checkout.reference, phone)
    if not result.success:
        fail_booking(session, checkout, b, result.failure_reason or "Le paiement a été refusé.")
        session.commit()
        raise HTTPException(status_code=402, detail=checkout.failure_reason)
    mark_paid(session, checkout, b, simulated=result.simulated, provider_reference=result.provider_reference)
    session.commit()
    try:
        from app.services.notifications import send_email
        status_line = ("Votre réservation est confirmée." if b.status == "confirmed"
                       else "L'hôte a été prévenu ; vous serez remboursé intégralement s'il refuse ou ne répond pas.")
        send_email(user.email, "H-Logement — Paiement reçu",
                   f"Bonjour {user.full_name or ''},\n\n{prop.title} — du {b.check_in:%d/%m/%Y} au {b.check_out:%d/%m/%Y} "
                   f"({b.nights} nuit(s)) · {b.total:.2f} ZMW.\n{status_line}\nVotre paiement est sécurisé par H-Company : "
                   f"l'hôte n'est payé qu'après votre arrivée.\n\nRéférence : {b.code}\n\n— H-Logement, par H-Company")
    except Exception:  # noqa: BLE001
        pass
    return S.CheckoutResponse(reference=checkout.reference, total=checkout.total, status=checkout.status, simulated=checkout.simulated,
                              booking=views.booking_read(session, b))


# --- Mes séjours -------------------------------------------------------------

def _my_booking(session: Session, code: str, user: User) -> Booking:
    b = session.exec(select(Booking).where(Booking.code == code.upper(), Booking.guest_id == user.id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    return b


@router.get("/me/bookings", response_model=list[S.BookingRead])
def my_bookings(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    expire_overdue(session)
    rows = session.exec(
        select(Booking).where(Booking.guest_id == user.id, Booking.paid_at != None).order_by(Booking.check_in.desc())  # noqa: E711
    ).all()
    return [views.booking_read(session, b) for b in rows]


@router.get("/me/bookings/{code}", response_model=S.BookingRead)
def my_booking(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    expire_overdue(session)
    return views.booking_read(session, _my_booking(session, code, user))


@router.post("/me/bookings/{code}/cancel", response_model=S.BookingRead)
def cancel_booking(code: str, payload: S.CancelRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _my_booking(session, code, user)
    if b.status not in ("pending_host", "confirmed") or b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée.")
    if b.check_in < date.today():
        raise HTTPException(status_code=409, detail="Le séjour a déjà commencé : ouvrez un litige si besoin.")
    # Une demande encore sans réponse de l'hôte est toujours remboursée en totalité.
    refund = b.total if b.status == "pending_host" else refund_for_cancellation(b)
    settle_refund(session, b, refund, status="cancelled_guest", actor="guest", reason=payload.reason or "Annulée par le voyageur")
    host = session.get(LodgeHost, b.host_id)
    if host:
        notify_user(session, host.user_id, f"Réservation {b.code} annulée",
                    f"{b.guest_name} a annulé son séjour du {b.check_in:%d/%m} au {b.check_out:%d/%m}. Les dates sont de nouveau libres.")
    session.commit()
    return views.booking_read(session, b)


@router.post("/me/bookings/{code}/dispute", response_model=S.BookingRead)
def open_dispute(code: str, payload: S.DisputeRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _my_booking(session, code, user)
    if not dispute_window_open(session, b):
        raise HTTPException(status_code=409, detail="Un litige ne peut plus être ouvert pour cette réservation.")
    b.status, b.dispute_reason, b.dispute_note, b.dispute_opened_at = "disputed", payload.reason, payload.note, datetime.utcnow()
    session.add(b)
    add_event(session, b, "disputed", note=payload.reason, actor="guest")
    host = session.get(LodgeHost, b.host_id)
    if host:
        notify_user(session, host.user_id, f"Litige sur la réservation {b.code}",
                    f"Motif : {payload.reason}. H-Company examine le dossier ; les fonds restent bloqués.")
    session.commit()
    return views.booking_read(session, b)


# --- Messagerie ----------------------------------------------------------------

def _thread(session: Session, b: Booking, user_id: int) -> list[S.MessageRead]:
    rows = session.exec(select(BookingMessage).where(BookingMessage.booking_id == b.id).order_by(BookingMessage.created_at, BookingMessage.id)).all()
    return [S.MessageRead(id=m.id, sender_role=m.sender_role, body=m.body, created_at=m.created_at, mine=m.sender_id == user_id) for m in rows]


@router.get("/me/bookings/{code}/messages", response_model=list[S.MessageRead])
def guest_messages(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return _thread(session, _my_booking(session, code, user), user.id)


@router.post("/me/bookings/{code}/messages", response_model=list[S.MessageRead], status_code=201)
@limiter.limit("60/hour")
def guest_send_message(request: Request, code: str, payload: S.MessageCreate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _my_booking(session, code, user)
    if b.paid_at is None:
        raise HTTPException(status_code=409, detail="La réservation n'est pas encore payée.")
    session.add(BookingMessage(booking_id=b.id, sender_id=user.id, sender_role="guest", body=payload.body))
    host = session.get(LodgeHost, b.host_id)
    if host:
        notify_user(session, host.user_id, f"Message — {b.code}", f"{b.guest_name} : {payload.body[:140]}")
    session.commit()
    return _thread(session, b, user.id)


# --- Avis ----------------------------------------------------------------------

@router.post("/reviews", response_model=S.ReviewRead, status_code=201)
def create_review(payload: S.ReviewCreate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = _my_booking(session, payload.booking_code, user)
    view = views.booking_read(session, b)
    if not view.can_review:
        raise HTTPException(status_code=409, detail="Vous pourrez laisser un avis une fois votre séjour terminé.")
    r = LodgeReview(
        property_id=b.property_id, booking_id=b.id, user_id=user.id, author_name=(user.full_name or "Voyageur").split(" ")[0],
        rating=payload.rating, cleanliness=payload.cleanliness, accuracy=payload.accuracy, location=payload.location,
        value=payload.value, comment=payload.comment,
    )
    session.add(r)
    session.flush()
    refresh_review_stats(session, b.property_id)
    host = session.get(LodgeHost, b.host_id)
    if host:
        notify_user(session, host.user_id, f"Nouvel avis ({payload.rating}/5)", f"{b.title_snapshot} : {payload.comment[:140] or 'sans commentaire'}")
    session.commit()
    session.refresh(r)
    return views.review_read(session, r)


# --- Favoris -------------------------------------------------------------------

@router.get("/me/favorites", response_model=list[S.PropertyCard])
def my_favorites(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    ids = [f.property_id for f in session.exec(select(LodgeFavorite).where(LodgeFavorite.user_id == user.id).order_by(LodgeFavorite.created_at.desc())).all()]
    favs = set(ids)
    out = []
    for pid in ids:
        p = session.get(Property, pid)
        if p and p.status == "active":
            out.append(views.card(session, p, None, favs))
    return out


@router.post("/favorites/{property_id}", status_code=204)
def add_favorite(property_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if not session.get(Property, property_id):
        raise HTTPException(status_code=404, detail="Logement introuvable.")
    if not session.exec(select(LodgeFavorite).where(LodgeFavorite.user_id == user.id, LodgeFavorite.property_id == property_id)).first():
        session.add(LodgeFavorite(user_id=user.id, property_id=property_id))
        session.commit()


@router.delete("/favorites/{property_id}", status_code=204)
def remove_favorite(property_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    for f in session.exec(select(LodgeFavorite).where(LodgeFavorite.user_id == user.id, LodgeFavorite.property_id == property_id)).all():
        session.delete(f)
    session.commit()
