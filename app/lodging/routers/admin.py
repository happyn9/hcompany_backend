"""H-Logement — administration : validation des logements, hôtes, réservations
et litiges, retraits, avis, réglages, vue d'ensemble."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_admin
from app.lodging import schemas as S
from app.lodging import views
from app.lodging.models import Booking, LodgeHost, LodgePayout, LodgeReview, Property
from app.lodging.routers.host import payout_read
from app.lodging.services import (
    DEFAULT_SETTINGS, all_settings, expire_overdue, notify_user, refresh_review_stats, release_escrow, settle_refund,
)
from app.lodging.models import LodgeSetting
from app.models import User

router = APIRouter(prefix="/api/v1/lodging/admin", tags=["lodging-admin"])


@router.get("/overview", response_model=S.AdminOverview)
def overview(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    expire_overdue(session)
    live = ("confirmed", "checked_in", "completed", "disputed")
    gmv = session.exec(select(func.coalesce(func.sum(Booking.total), 0)).where(Booking.status.in_(live))).one()
    comm = session.exec(select(func.coalesce(func.sum(Booking.commission_amount), 0)).where(Booking.escrow_status == "released")).one()
    held = session.exec(select(func.coalesce(func.sum(Booking.total), 0)).where(Booking.escrow_status == "held")).one()
    by_status = dict(session.exec(select(Booking.status, func.count(Booking.id)).where(Booking.paid_at != None).group_by(Booking.status)).all())  # noqa: E711
    return S.AdminOverview(
        gmv=round(float(gmv), 2), commission=round(float(comm), 2), escrow_held=round(float(held), 2),
        bookings=sum(by_status.values()),
        properties_pending=session.exec(select(func.count(Property.id)).where(Property.status == "pending")).one(),
        properties_active=session.exec(select(func.count(Property.id)).where(Property.status == "active")).one(),
        hosts=session.exec(select(func.count(LodgeHost.id))).one(),
        disputes_open=by_status.get("disputed", 0),
        payouts_pending=session.exec(select(func.count(LodgePayout.id)).where(LodgePayout.status == "requested")).one(),
        by_status=by_status,
    )


# --- Logements -----------------------------------------------------------------

def _admin_property(session: Session, p: Property) -> S.AdminPropertyRead:
    base = views.owner_read(session, p).model_dump()
    h = session.get(LodgeHost, p.host_id)
    u = session.get(User, h.user_id) if h else None
    return S.AdminPropertyRead(**base, host_email=u.email if u else None, host_phone=(h.phone or h.whatsapp) if h else None)


@router.get("/properties", response_model=list[S.AdminPropertyRead])
def list_properties(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(Property)
    if status:
        stmt = stmt.where(Property.status == status)
    return [_admin_property(session, p) for p in session.exec(stmt.order_by(Property.created_at.desc()).limit(300)).all()]


@router.patch("/properties/{property_id}", response_model=S.AdminPropertyRead)
def update_property_status(property_id: int, payload: S.AdminPropertyStatus, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.get(Property, property_id)
    if not p:
        raise HTTPException(status_code=404, detail="Logement introuvable.")
    if payload.status not in ("active", "rejected", "suspended", "pending", "paused"):
        raise HTTPException(status_code=422, detail="Statut invalide.")
    if payload.status in ("rejected", "suspended") and len(payload.reason) < 3:
        raise HTTPException(status_code=422, detail="Indiquez le motif : il sera communiqué à l'hôte.")
    was = p.status
    p.status, p.status_reason = payload.status, payload.reason or None
    if payload.status == "active" and not p.approved_at:
        p.approved_at = datetime.utcnow()
    if payload.is_featured is not None:
        p.is_featured = payload.is_featured
    session.add(p)
    h = session.get(LodgeHost, p.host_id)
    if h and was != p.status:
        msgs = {
            "active": ("Logement publié", f"« {p.title} » est en ligne : les voyageurs peuvent le réserver."),
            "rejected": ("Logement à corriger", f"« {p.title} » n'a pas été validé : {payload.reason}"),
            "suspended": ("Logement suspendu", f"« {p.title} » est suspendu : {payload.reason}"),
        }
        if p.status in msgs:
            u = session.get(User, h.user_id)
            notify_user(session, h.user_id, *msgs[p.status], u.email if u else None)
    session.commit()
    return _admin_property(session, p)


# --- Hôtes ----------------------------------------------------------------------

def _admin_host(session: Session, h: LodgeHost) -> S.AdminHostRead:
    base = views.host_owner(session, h).model_dump()
    u = session.get(User, h.user_id)
    pc = session.exec(select(func.count(Property.id)).where(Property.host_id == h.id)).one()
    bc = session.exec(select(func.count(Booking.id)).where(Booking.host_id == h.id, Booking.paid_at != None)).one()  # noqa: E711
    rev = session.exec(select(func.coalesce(func.sum(Booking.host_net), 0)).where(Booking.host_id == h.id, Booking.escrow_status == "released")).one()
    return S.AdminHostRead(**base, user_email=u.email if u else None, commission_rate=h.commission_rate,
                           properties_count=int(pc), bookings_count=int(bc), revenue=round(float(rev), 2))


@router.get("/hosts", response_model=list[S.AdminHostRead])
def list_hosts(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return [_admin_host(session, h) for h in session.exec(select(LodgeHost).order_by(LodgeHost.created_at.desc()).limit(300)).all()]


@router.patch("/hosts/{host_id}", response_model=S.AdminHostRead)
def update_host(host_id: int, payload: S.AdminHostUpdate, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    h = session.get(LodgeHost, host_id)
    if not h:
        raise HTTPException(status_code=404, detail="Hôte introuvable.")
    if payload.is_verified is not None:
        h.is_verified = payload.is_verified
    if payload.clear_commission:
        h.commission_rate = None
    elif payload.commission_rate is not None:
        h.commission_rate = payload.commission_rate
    session.add(h)
    session.commit()
    return _admin_host(session, h)


# --- Réservations & litiges -------------------------------------------------------

@router.get("/bookings", response_model=list[S.AdminBookingRead])
def list_bookings(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    expire_overdue(session)
    stmt = select(Booking).where(Booking.paid_at != None)  # noqa: E711
    if status:
        stmt = stmt.where(Booking.status == status)
    out = []
    for b in session.exec(stmt.order_by(Booking.created_at.desc()).limit(300)).all():
        h = session.get(LodgeHost, b.host_id)
        out.append(S.AdminBookingRead(**views.booking_read(session, b, viewer="admin").model_dump(), host_display=h.display_name if h else None))
    return out


@router.post("/bookings/{code}/resolve", response_model=S.AdminBookingRead)
def resolve_booking(code: str, payload: S.AdminResolve, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    b = session.exec(select(Booking).where(Booking.code == code.upper())).first()
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    if b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Les fonds de cette réservation ne sont plus en séquestre.")
    if payload.action == "refund":
        amount = b.total if payload.refund_amount is None else payload.refund_amount
        if amount > b.total + 1e-9:
            raise HTTPException(status_code=422, detail="Le remboursement dépasse le montant payé.")
        settle_refund(session, b, amount, status="cancelled_host" if amount >= b.total else "cancelled_guest", actor="admin",
                      reason=payload.note or "Décision H-Company")
    else:
        release_escrow(session, b, actor="admin", note=payload.note)
    session.commit()
    h = session.get(LodgeHost, b.host_id)
    return S.AdminBookingRead(**views.booking_read(session, b, viewer="admin").model_dump(), host_display=h.display_name if h else None)


# --- Retraits -------------------------------------------------------------------

@router.get("/payouts", response_model=list[S.PayoutRead])
def list_payouts(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(LodgePayout)
    if status:
        stmt = stmt.where(LodgePayout.status == status)
    return [payout_read(session, p) for p in session.exec(stmt.order_by(LodgePayout.created_at.desc()).limit(300)).all()]


@router.patch("/payouts/{payout_id}", response_model=S.PayoutRead)
def update_payout(payout_id: int, payload: S.AdminPayoutUpdate, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.get(LodgePayout, payout_id)
    if not p:
        raise HTTPException(status_code=404, detail="Retrait introuvable.")
    if p.status != "requested":
        raise HTTPException(status_code=409, detail="Ce retrait a déjà été traité.")
    if payload.status not in ("paid", "rejected"):
        raise HTTPException(status_code=422, detail="Statut invalide.")
    p.status, p.admin_note, p.processed_at = payload.status, payload.admin_note or None, datetime.utcnow()
    session.add(p)
    h = session.get(LodgeHost, p.host_id)
    if h:
        notify_user(session, h.user_id, "Retrait " + ("payé" if p.status == "paid" else "refusé"),
                    f"{p.amount:.2f} ZMW — {p.reference}." + (f" {p.admin_note}" if p.admin_note else ""))
    session.commit()
    return payout_read(session, p)


# --- Avis -----------------------------------------------------------------------

@router.get("/reviews", response_model=list[S.ReviewRead])
def list_reviews(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    rows = session.exec(select(LodgeReview).order_by(LodgeReview.created_at.desc()).limit(200)).all()
    return [views.review_read(session, r, with_property=True) for r in rows]


@router.patch("/reviews/{review_id}", response_model=S.ReviewRead)
def moderate_review(review_id: int, hidden: bool, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    r = session.get(LodgeReview, review_id)
    if not r:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    r.is_hidden = hidden
    session.add(r)
    session.flush()
    refresh_review_stats(session, r.property_id)
    session.commit()
    return views.review_read(session, r, with_property=True)


# --- Réglages ---------------------------------------------------------------------

@router.get("/settings")
def get_settings(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return all_settings(session)


@router.put("/settings")
def put_settings(payload: S.SettingsWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    for key, value in payload.values.items():
        if key not in DEFAULT_SETTINGS:
            raise HTTPException(status_code=422, detail=f"Réglage inconnu : {key}")
        try:
            number = float(value)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Valeur invalide pour {key}.")
        if number < 0 or (key == "commission_rate" and number > 60):
            raise HTTPException(status_code=422, detail=f"Valeur hors limites pour {key}.")
        row = session.get(LodgeSetting, key) or LodgeSetting(key=key)
        row.value = str(value).strip()
        session.add(row)
    session.commit()
    return all_settings(session)
