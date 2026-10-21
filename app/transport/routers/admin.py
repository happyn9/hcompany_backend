"""H-Transport — administration : agences, départs, réservations et litiges,
retraits, avis, réglages."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_admin
from app.models import User
from app.transport import schemas as S
from app.transport import views
from app.transport.models import (
    TransportBooking, TransportOperator, TransportPayout, TransportReview, TransportSetting, TransportTrip,
)
from app.transport.services import (
    DEFAULT_SETTINGS, all_settings, cancel_trip, expire_overdue, notify_user, now_local, refresh_review_stats, release_escrow, settle_refund,
)

router = APIRouter(prefix="/api/v1/transport/admin", tags=["transport-admin"])


@router.get("/overview", response_model=S.AdminOverview)
def overview(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    expire_overdue(session)
    live = ("confirmed", "boarded", "completed", "disputed")
    gmv = session.exec(select(func.coalesce(func.sum(TransportBooking.total), 0)).where(TransportBooking.status.in_(live))).one()
    comm = session.exec(select(func.coalesce(func.sum(TransportBooking.commission_amount), 0)).where(TransportBooking.escrow_status == "released")).one()
    held = session.exec(select(func.coalesce(func.sum(TransportBooking.total), 0)).where(TransportBooking.escrow_status == "held")).one()
    by_status = dict(session.exec(select(TransportBooking.status, func.count(TransportBooking.id)).where(TransportBooking.paid_at != None).group_by(TransportBooking.status)).all())  # noqa: E711
    return S.AdminOverview(
        gmv=round(float(gmv), 2), commission=round(float(comm), 2), escrow_held=round(float(held), 2), bookings=sum(by_status.values()),
        operators_pending=session.exec(select(func.count(TransportOperator.id)).where(TransportOperator.status == "pending")).one(),
        operators_active=session.exec(select(func.count(TransportOperator.id)).where(TransportOperator.status == "approved")).one(),
        trips_upcoming=session.exec(select(func.count(TransportTrip.id)).where(TransportTrip.status == "scheduled", TransportTrip.departure_at > now_local())).one(),
        disputes_open=by_status.get("disputed", 0),
        payouts_pending=session.exec(select(func.count(TransportPayout.id)).where(TransportPayout.status == "requested")).one(),
        by_status=by_status,
    )


def _admin_op(session: Session, op: TransportOperator) -> S.AdminOperatorRead:
    base = views.operator_owner(session, op).model_dump()
    u = session.get(User, op.user_id)
    return S.AdminOperatorRead(
        **base, email=u.email if u else None,
        trips_count=session.exec(select(func.count(TransportTrip.id)).where(TransportTrip.operator_id == op.id)).one(),
        bookings_count=session.exec(select(func.count(TransportBooking.id)).where(TransportBooking.operator_id == op.id, TransportBooking.paid_at != None)).one(),  # noqa: E711
    )


@router.get("/operators", response_model=list[S.AdminOperatorRead])
def operators(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(TransportOperator)
    if status:
        stmt = stmt.where(TransportOperator.status == status)
    return [_admin_op(session, o) for o in session.exec(stmt.order_by(TransportOperator.created_at.desc()).limit(300)).all()]


@router.patch("/operators/{operator_id}", response_model=S.AdminOperatorRead)
def update_operator(operator_id: int, payload: S.AdminOperatorUpdate, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    op = session.get(TransportOperator, operator_id)
    if not op:
        raise HTTPException(status_code=404, detail="Agence introuvable.")
    if payload.status:
        if payload.status not in ("approved", "rejected", "suspended", "pending"):
            raise HTTPException(status_code=422, detail="Statut invalide.")
        if payload.status in ("rejected", "suspended") and len(payload.reason) < 3:
            raise HTTPException(status_code=422, detail="Indiquez le motif : il sera communiqué à l'agence.")
        was = op.status
        op.status = payload.status
        op.status_reason = payload.reason or None if payload.status in ("rejected", "suspended") else None
        if payload.status == "approved" and was != "approved":
            op.approved_at = datetime.utcnow()
        u = session.get(User, op.user_id)
        if was != op.status:
            msg = {"approved": "Votre agence est validée : vous pouvez publier vos départs.",
                   "rejected": f"Votre demande a été refusée. Motif : {payload.reason}",
                   "suspended": f"Votre agence a été suspendue. Motif : {payload.reason}"}.get(op.status)
            if msg:
                notify_user(session, op.user_id, "Votre agence H-Transport", msg, u.email if u else None)
    if payload.is_verified is not None:
        op.is_verified = payload.is_verified
    if payload.clear_commission:
        op.commission_rate = None
    elif payload.commission_rate is not None:
        op.commission_rate = payload.commission_rate
    session.add(op)
    session.commit()
    return _admin_op(session, op)


@router.get("/trips", response_model=list[S.AdminTripRead])
def trips(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    expire_overdue(session)
    stmt = select(TransportTrip)
    if status:
        stmt = stmt.where(TransportTrip.status == status)
    return [views.trip_owner(session, t) for t in session.exec(stmt.order_by(TransportTrip.departure_at.desc()).limit(300)).all()]


@router.post("/trips/{trip_id}/cancel", response_model=S.AdminTripRead)
def cancel(trip_id: int, payload: S.CancelRequest, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    t = session.get(TransportTrip, trip_id)
    if not t:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    if len(payload.reason) < 3:
        raise HTTPException(status_code=422, detail="Indiquez le motif.")
    cancel_trip(session, t, payload.reason, "admin")
    session.commit()
    return views.trip_owner(session, t)


@router.get("/bookings", response_model=list[S.BookingRead])
def bookings(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    expire_overdue(session)
    stmt = select(TransportBooking).where(TransportBooking.paid_at != None)  # noqa: E711
    if status:
        stmt = stmt.where(TransportBooking.status == status)
    return [views.booking_read(session, b, viewer="admin") for b in session.exec(stmt.order_by(TransportBooking.created_at.desc()).limit(300)).all()]


@router.post("/bookings/{code}/resolve", response_model=S.BookingRead)
def resolve(code: str, payload: S.ResolveRequest, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    b = session.exec(select(TransportBooking).where(TransportBooking.code == code.upper())).first()
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    if b.status != "disputed" or b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Cette réservation n'est pas en litige.")
    if payload.action == "refund":
        amount = b.total if payload.refund_amount is None else payload.refund_amount
        if amount > b.total:
            raise HTTPException(status_code=422, detail="Le remboursement dépasse le montant payé.")
        settle_refund(session, b, amount, status="cancelled_operator" if amount >= b.total else "completed", actor="admin",
                      reason=payload.note or "Litige tranché en faveur du voyageur")
    elif payload.action == "release":
        release_escrow(session, b, actor="admin", note=payload.note or "Litige tranché en faveur de l'agence")
    else:
        raise HTTPException(status_code=422, detail="Action inconnue (refund ou release).")
    session.commit()
    return views.booking_read(session, b, viewer="admin")


@router.get("/payouts", response_model=list[S.PayoutRead])
def payouts(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(TransportPayout)
    if status:
        stmt = stmt.where(TransportPayout.status == status)
    return [views.payout_read(session, p, with_operator=True) for p in session.exec(stmt.order_by(TransportPayout.created_at.desc()).limit(300)).all()]


@router.patch("/payouts/{payout_id}", response_model=S.PayoutRead)
def update_payout(payout_id: int, payload: S.PayoutUpdate, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.get(TransportPayout, payout_id)
    if not p:
        raise HTTPException(status_code=404, detail="Retrait introuvable.")
    if p.status != "requested" or payload.status not in ("paid", "rejected"):
        raise HTTPException(status_code=409, detail="Ce retrait a déjà été traité.")
    p.status, p.admin_note, p.processed_at = payload.status, payload.admin_note or None, datetime.utcnow()
    session.add(p)
    op = session.get(TransportOperator, p.operator_id)
    if op:
        notify_user(session, op.user_id, "Retrait H-Transport", f"Votre retrait de {p.amount:.2f} ZMW est {'payé' if p.status == 'paid' else 'refusé'}." + (f" {p.admin_note}" if p.admin_note else ""))
    session.commit()
    return views.payout_read(session, p, with_operator=True)


@router.get("/reviews", response_model=list[S.ReviewRead])
def reviews(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return [views.review_read(session, r, with_operator=True) for r in session.exec(select(TransportReview).order_by(TransportReview.created_at.desc()).limit(200)).all()]


@router.patch("/reviews/{review_id}", response_model=S.ReviewRead)
def moderate(review_id: int, hidden: bool = True, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    r = session.get(TransportReview, review_id)
    if not r:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    r.is_hidden = hidden
    session.add(r)
    refresh_review_stats(session, r.operator_id)
    session.commit()
    return views.review_read(session, r, with_operator=True)


@router.get("/settings")
def get_settings(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return all_settings(session)


@router.put("/settings")
def put_settings(payload: S.SettingsWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    for k, v in payload.values.items():
        if k not in DEFAULT_SETTINGS:
            raise HTTPException(status_code=422, detail=f"Réglage inconnu : {k}")
        try:
            if float(v) < 0:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Valeur invalide pour {k}.")
        row = session.get(TransportSetting, k) or TransportSetting(key=k)
        row.value = str(v)
        session.add(row)
    session.commit()
    return all_settings(session)
