"""H-Transport — espace agence : profil, départs, embarquement, réservations,
solde et retraits, avis."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_user
from app.models import User
from app.routers.partner_modules import require_module
from app.routers.learning_plans import OPERATOR_PREFIXES, normalize_zm_phone
from app.transport import schemas as S
from app.transport import views
from app.transport.models import (
    TransportBooking, TransportBus, TransportOperator, TransportPassenger, TransportPayout, TransportReview, TransportTrip,
)
from app.transport.services import (
    add_event, auto_approve_partner, clean_amenities, expire_overdue, get_float, notify_user, now_local, refresh_review_stats,
    cancel_trip, wallet,
)

router = APIRouter(prefix="/api/v1/transport/operator", tags=["transport-operator"])
MAX_DUPLICATES = 60


def _op(session: Session, user: User, *, required: bool = True) -> Optional[TransportOperator]:
    op = session.exec(select(TransportOperator).where(TransportOperator.user_id == user.id)).first()
    if not op and required:
        raise HTTPException(status_code=404, detail="Créez d'abord le profil de votre agence.")
    return op


def _approved(session: Session, user: User) -> TransportOperator:
    op = _op(session, user)
    if op.status != "approved":
        raise HTTPException(status_code=403, detail="Votre agence doit d'abord être validée par H-Company.")
    return op


def _trip(session: Session, trip_id: int, op: TransportOperator) -> TransportTrip:
    t = session.get(TransportTrip, trip_id)
    if not t or t.operator_id != op.id:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    return t


def _apply_profile(op: TransportOperator, p: S.OperatorWrite) -> None:
    phone = ""
    if p.mobile_money_phone:
        phone = normalize_zm_phone(p.mobile_money_phone)
        if not phone:
            raise HTTPException(status_code=422, detail="Numéro mobile money invalide.")
        if p.mobile_money_operator and p.mobile_money_operator not in OPERATOR_PREFIXES:
            raise HTTPException(status_code=422, detail="Opérateur mobile money inconnu.")
    op.name, op.description, op.city, op.phone, op.whatsapp = p.name, p.description, p.city, p.phone, p.whatsapp
    op.mobile_money_operator, op.mobile_money_phone = p.mobile_money_operator, phone


@router.get("/me", response_model=Optional[S.OperatorOwnerRead])
def me(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user, required=False)
    return views.operator_owner(session, op) if op else None


@router.post("/me", response_model=S.OperatorOwnerRead, status_code=201)
def create(payload: S.OperatorWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if _op(session, user, required=False):
        raise HTTPException(status_code=409, detail="Vous avez déjà une agence.")
    require_module(session, user, "transport")
    op = TransportOperator(user_id=user.id, name=payload.name)
    _apply_profile(op, payload)
    auto_approve_partner(session, user, op)
    session.add(op)
    session.commit()
    session.refresh(op)
    return views.operator_owner(session, op)


@router.put("/me", response_model=S.OperatorOwnerRead)
def save(payload: S.OperatorWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    _apply_profile(op, payload)
    session.add(op)
    session.commit()
    return views.operator_owner(session, op)


@router.get("/overview", response_model=S.OperatorOverview)
def overview(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    expire_overdue(session)
    now = now_local()
    upcoming = session.exec(select(TransportTrip).where(TransportTrip.operator_id == op.id, TransportTrip.status == "scheduled",
                                                       TransportTrip.departure_at > now).order_by(TransportTrip.departure_at)).all()
    today_start = datetime.combine(now.date(), datetime.min.time())
    today = session.exec(select(func.count(TransportBooking.id)).where(TransportBooking.operator_id == op.id, TransportBooking.paid_at != None,  # noqa: E711
                                                                      TransportBooking.paid_at >= today_start)).one()
    cards = [views.trip_owner(session, t) for t in upcoming]
    return S.OperatorOverview(wallet=views.wallet_read(session, op.id), trips_upcoming=len(upcoming), bookings_today=int(today),
                              seats_sold_upcoming=sum(c.booked_seats for c in cards), next_trips=cards[:5])


# --- Départs -------------------------------------------------------------------

def _apply_trip(t: TransportTrip, p: S.TripWrite, session: Optional[Session] = None, op: Optional[TransportOperator] = None) -> None:
    seats, btype, amen = p.seats_total, p.bus_type, p.amenities
    t.bus_id = None
    if p.bus_id is not None:
        bus = session.get(TransportBus, p.bus_id) if session else None
        if not bus or not op or bus.operator_id != op.id or not bus.is_active:
            raise HTTPException(status_code=422, detail="Bus introuvable dans votre flotte.")
        dep, arr = p.departure_at.replace(tzinfo=None), p.arrival_at.replace(tzinfo=None)
        gap = timedelta(hours=2)  # calcul en Python : l'arithmétique de dates en SQL diffère entre SQLite et Postgres
        clash = next((x for x in session.exec(select(TransportTrip).where(TransportTrip.bus_id == bus.id, TransportTrip.status == "scheduled", TransportTrip.id != (t.id or 0))).all()
                      if x.departure_at < arr + gap and x.arrival_at + gap > dep), None)
        if clash:
            raise HTTPException(status_code=409, detail=f"Ce bus est déjà affecté au départ {clash.origin} → {clash.destination} du {clash.departure_at:%d/%m à %H:%M} (2 h de battement minimum).")
        t.bus_id, seats, btype = bus.id, bus.seats_total, bus.bus_type
        amen = p.amenities or [a for a in bus.amenities.split(",") if a]
    t.origin, t.destination = p.origin, p.destination
    t.origin_stop, t.destination_stop = p.origin_stop, p.destination_stop
    t.stops = ",".join(s.strip() for s in p.stops if s.strip())
    t.departure_at, t.arrival_at, t.price, t.seats_total, t.bus_type = p.departure_at.replace(tzinfo=None), p.arrival_at.replace(tzinfo=None), p.price, seats, btype
    t.amenities, t.luggage_note, t.notes, t.border_crossing = clean_amenities(amen), p.luggage_note, p.notes, p.border_crossing


# --- Flotte ----------------------------------------------------------------------

def _apply_bus(bus: TransportBus, p: S.BusWrite) -> None:
    bus.name, bus.plate, bus.bus_type, bus.layout = p.name, p.plate.upper(), p.bus_type, p.layout
    bus.seats_total, bus.amenities, bus.color = p.seats_total, clean_amenities(p.amenities), p.color.lower()


@router.get("/buses", response_model=list[S.BusRead])
def buses(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    rows = session.exec(select(TransportBus).where(TransportBus.operator_id == op.id).order_by(TransportBus.name)).all()
    return [views.bus_read(session, b, with_count=True) for b in rows]


@router.post("/buses", response_model=S.BusRead, status_code=201)
def create_bus(payload: S.BusWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _approved(session, user)
    if session.exec(select(TransportBus).where(TransportBus.operator_id == op.id, TransportBus.plate == payload.plate.upper())).first():
        raise HTTPException(status_code=409, detail="Un bus avec cette plaque existe déjà dans votre flotte.")
    bus = TransportBus(operator_id=op.id, name=payload.name, plate=payload.plate.upper())
    _apply_bus(bus, payload)
    session.add(bus)
    session.commit()
    session.refresh(bus)
    return views.bus_read(session, bus, with_count=True)


def _bus(session: Session, bus_id: int, op: TransportOperator) -> TransportBus:
    bus = session.get(TransportBus, bus_id)
    if not bus or bus.operator_id != op.id:
        raise HTTPException(status_code=404, detail="Bus introuvable.")
    return bus


@router.put("/buses/{bus_id}", response_model=S.BusRead)
def update_bus(bus_id: int, payload: S.BusWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _approved(session, user)
    bus = _bus(session, bus_id, op)
    if payload.seats_total != bus.seats_total or payload.layout != bus.layout:
        used = session.exec(select(func.count(TransportTrip.id)).where(TransportTrip.bus_id == bus.id, TransportTrip.status == "scheduled")).one()
        if used:
            raise HTTPException(status_code=409, detail="Ce bus a des départs programmés : sièges et disposition ne peuvent plus changer. Créez un autre bus ou annulez ces départs.")
    _apply_bus(bus, payload)
    session.add(bus)
    session.commit()
    return views.bus_read(session, bus, with_count=True)


@router.delete("/buses/{bus_id}", status_code=204)
def delete_bus(bus_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _approved(session, user)
    bus = _bus(session, bus_id, op)
    used = session.exec(select(func.count(TransportTrip.id)).where(TransportTrip.bus_id == bus.id, TransportTrip.status == "scheduled")).one()
    if used:
        raise HTTPException(status_code=409, detail="Ce bus a des départs programmés. Annulez-les d'abord.")
    ever = session.exec(select(func.count(TransportTrip.id)).where(TransportTrip.bus_id == bus.id)).one()
    if ever:
        bus.is_active = False
        session.add(bus)
    else:
        session.delete(bus)
    session.commit()


@router.get("/trips", response_model=list[S.TripOwnerRead])
def trips(scope: str = "upcoming", session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    expire_overdue(session)
    stmt = select(TransportTrip).where(TransportTrip.operator_id == op.id)
    if scope == "history":
        stmt = stmt.where((TransportTrip.status.in_(("completed", "cancelled", "departed"))) | (TransportTrip.departure_at <= now_local())).order_by(TransportTrip.departure_at.desc())
    else:
        stmt = stmt.where(TransportTrip.status == "scheduled", TransportTrip.departure_at > now_local()).order_by(TransportTrip.departure_at)
    return [views.trip_owner(session, t) for t in session.exec(stmt.limit(200)).all()]


@router.post("/trips", response_model=S.TripOwnerRead, status_code=201)
def create_trip(payload: S.TripWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _approved(session, user)
    if payload.departure_at.replace(tzinfo=None) <= now_local():
        raise HTTPException(status_code=422, detail="Le départ doit être dans le futur.")
    t = TransportTrip(operator_id=op.id, origin="", destination="", departure_at=payload.departure_at, arrival_at=payload.arrival_at, price=payload.price)
    _apply_trip(t, payload, session, op)
    session.add(t)
    session.commit()
    session.refresh(t)
    return views.trip_owner(session, t)


@router.put("/trips/{trip_id}", response_model=S.TripOwnerRead)
def update_trip(trip_id: int, payload: S.TripWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _approved(session, user)
    t = _trip(session, trip_id, op)
    if t.status != "scheduled":
        raise HTTPException(status_code=409, detail="Ce départ ne peut plus être modifié.")
    sold = session.exec(select(func.count(TransportBooking.id)).where(TransportBooking.trip_id == t.id, TransportBooking.status.in_(("confirmed", "boarded", "completed", "disputed")))).one()
    if sold:
        changed = (payload.origin != t.origin or payload.destination != t.destination or payload.departure_at.replace(tzinfo=None) != t.departure_at
                   or payload.arrival_at.replace(tzinfo=None) != t.arrival_at or payload.price != t.price or (payload.seats_total or t.seats_total) < t.seats_total or (payload.bus_id or None) != t.bus_id)
        if changed:
            raise HTTPException(status_code=409, detail="Des billets sont déjà vendus : le trajet, l'horaire, le prix et le nombre de sièges (à la baisse) ne peuvent plus changer. Annulez le départ pour rembourser les voyageurs.")
    _apply_trip(t, payload, session, op)
    session.add(t)
    session.commit()
    return views.trip_owner(session, t)


@router.post("/trips/{trip_id}/duplicate", response_model=list[S.TripOwnerRead], status_code=201)
def duplicate(trip_id: int, days: list[int] = Body(...), session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _approved(session, user)
    t = _trip(session, trip_id, op)
    days = sorted({d for d in days if 1 <= d <= 365})[:MAX_DUPLICATES]
    if not days:
        raise HTTPException(status_code=422, detail="Choisissez au moins un jour.")
    out = []
    for d in days:
        n = TransportTrip(operator_id=op.id, origin=t.origin, destination=t.destination, origin_stop=t.origin_stop, destination_stop=t.destination_stop,
                          stops=t.stops, departure_at=t.departure_at + timedelta(days=d), arrival_at=t.arrival_at + timedelta(days=d), price=t.price,
                          seats_total=t.seats_total, bus_type=t.bus_type, amenities=t.amenities, luggage_note=t.luggage_note, notes=t.notes,
                          border_crossing=t.border_crossing, bus_id=t.bus_id)
        session.add(n)
        out.append(n)
    session.commit()
    return [views.trip_owner(session, n) for n in out]


@router.post("/trips/{trip_id}/cancel", response_model=S.TripOwnerRead)
def cancel(trip_id: int, payload: S.CancelRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    t = _trip(session, trip_id, op)
    if len(payload.reason) < 3:
        raise HTTPException(status_code=422, detail="Indiquez le motif : il sera communiqué aux voyageurs.")
    cancel_trip(session, t, payload.reason, "operator")
    session.commit()
    return views.trip_owner(session, t)


# --- Manifeste & embarquement -------------------------------------------------

def _manifest(session: Session, t: TransportTrip) -> list[dict]:
    rows = session.exec(
        select(TransportPassenger, TransportBooking).join(TransportBooking, TransportBooking.id == TransportPassenger.booking_id)
        .where(TransportPassenger.trip_id == t.id, TransportBooking.status.in_(("confirmed", "boarded", "completed", "disputed")))
        .order_by(TransportPassenger.seat_number)
    ).all()
    return [{"id": p.id, "name": p.name, "phone": p.phone, "document": p.document, "seat_number": p.seat_number, "ticket_code": p.ticket_code,
             "boarded": p.boarded_at is not None, "booking_code": b.code, "contact_name": b.contact_name, "contact_phone": b.contact_phone} for p, b in rows]


@router.get("/trips/{trip_id}/manifest", response_model=S.ManifestRead)
def manifest(trip_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    t = _trip(session, trip_id, op)
    return S.ManifestRead(trip=views.trip_owner(session, t), passengers=_manifest(session, t))


@router.post("/boarding", response_model=S.BoardingResult)
def boarding(payload: S.BoardingRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    code = payload.ticket_code.strip().upper()
    p = session.exec(select(TransportPassenger).where(TransportPassenger.ticket_code == code)).first()
    t = session.get(TransportTrip, p.trip_id) if p else None
    if not p or not t or t.operator_id != op.id:
        raise HTTPException(status_code=404, detail="Billet introuvable pour votre agence.")
    b = session.get(TransportBooking, p.booking_id)
    if b.status not in ("confirmed", "boarded", "completed", "disputed") or b.escrow_status == "refunded":
        raise HTTPException(status_code=409, detail="Ce billet n'est pas valide (annulé ou non payé).")
    if t.status == "cancelled":
        raise HTTPException(status_code=409, detail="Ce départ a été annulé.")
    if now_local() < t.departure_at - timedelta(hours=6):
        raise HTTPException(status_code=409, detail="L'embarquement n'est pas encore ouvert (6 h avant le départ).")
    already = p.boarded_at is not None
    if payload.undo:
        p.boarded_at = None
        if b.status == "boarded":
            b.status = "confirmed"
    elif not already:
        p.boarded_at = now_local()
    session.add(p)
    session.flush()
    pax = session.exec(select(TransportPassenger).where(TransportPassenger.booking_id == b.id)).all()
    if not payload.undo and b.status == "confirmed" and all(x.boarded_at for x in pax):
        b.status = "boarded"
        add_event(session, b, "boarded", actor="operator")
    session.add(b)
    session.commit()
    session.refresh(p)
    return S.BoardingResult(passenger=views.passenger_read(p), booking_code=b.code, trip_id=t.id, seat_number=p.seat_number, already=already and not payload.undo)


@router.get("/bookings", response_model=list[S.BookingRead])
def bookings(trip_id: Optional[int] = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    expire_overdue(session)
    stmt = select(TransportBooking).where(TransportBooking.operator_id == op.id, TransportBooking.paid_at != None)  # noqa: E711
    if trip_id:
        stmt = stmt.where(TransportBooking.trip_id == trip_id)
    return [views.booking_read(session, b, viewer="operator") for b in session.exec(stmt.order_by(TransportBooking.departure_at.desc()).limit(300)).all()]


# --- Solde, retraits, avis -----------------------------------------------------

@router.get("/wallet", response_model=S.WalletRead)
def my_wallet(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    expire_overdue(session)
    return views.wallet_read(session, op.id)


@router.get("/payouts", response_model=list[S.PayoutRead])
def payouts(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    return [views.payout_read(session, p) for p in session.exec(select(TransportPayout).where(TransportPayout.operator_id == op.id).order_by(TransportPayout.created_at.desc())).all()]


@router.post("/payouts", response_model=S.PayoutRead, status_code=201)
def request_payout(payload: S.PayoutRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _approved(session, user)
    expire_overdue(session)
    if not op.mobile_money_phone or not op.mobile_money_operator:
        raise HTTPException(status_code=422, detail="Renseignez votre numéro mobile money dans le profil de l'agence.")
    w = wallet(session, op.id)
    if payload.amount < w["min_payout"]:
        raise HTTPException(status_code=422, detail=f"Retrait minimum : {w['min_payout']:.0f} ZMW.")
    if payload.amount > w["available"] + 1e-6:
        raise HTTPException(status_code=422, detail="Montant supérieur à votre solde disponible.")
    p = TransportPayout(reference="HTW-" + secrets.token_hex(4).upper(), operator_id=op.id, amount=round(payload.amount, 2),
                        operator=op.mobile_money_operator, phone=op.mobile_money_phone)
    session.add(p)
    session.commit()
    session.refresh(p)
    return views.payout_read(session, p)


@router.get("/reviews", response_model=list[S.ReviewRead])
def reviews(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    return [views.review_read(session, r) for r in session.exec(select(TransportReview).where(TransportReview.operator_id == op.id, TransportReview.is_hidden == False)  # noqa: E712
                                                                .order_by(TransportReview.created_at.desc())).all()]


@router.post("/reviews/{review_id}/reply", response_model=S.ReviewRead)
def reply(review_id: int, payload: S.ReplyRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    r = session.get(TransportReview, review_id)
    if not r or r.operator_id != op.id:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    r.reply = payload.reply
    session.add(r)
    session.commit()
    return views.review_read(session, r)
