"""Conversion modèles → schémas de lecture (cartes, fiches, réservations)."""
from datetime import date, datetime
from typing import Optional

from sqlmodel import Session, func, select

from app.lodging import schemas as S
from app.lodging.models import (
    Booking, BookingEvent, LodgeFavorite, LodgeHost, LodgeReview, PriceRule, Property, PropertyBlock,
)
from app.lodging.services import (
    POLICY_TEXT, dispute_window_open, property_images, quote_stay, refund_for_cancellation,
)
from app.models import PartnerApplication, User


def favorite_ids(session: Session, user: Optional[User]) -> set:
    if user is None:
        return set()
    return {f.property_id for f in session.exec(select(LodgeFavorite).where(LodgeFavorite.user_id == user.id)).all()}


def card(session: Session, p: Property, host: Optional[LodgeHost] = None, favs: Optional[set] = None,
         *, total: Optional[float] = None, nights: Optional[int] = None) -> S.PropertyCard:
    host = host or session.get(LodgeHost, p.host_id)
    imgs = [i.path for i in property_images(session, p.id)]
    return S.PropertyCard(
        id=p.id, slug=p.slug, title=p.title, type=p.type, city=p.city, area=p.area, price_per_night=p.price_per_night,
        image=imgs[0] if imgs else None, images=imgs[:5], max_guests=p.max_guests, bedrooms=p.bedrooms, beds=p.beds,
        bathrooms=p.bathrooms, rating_avg=p.rating_avg, rating_count=p.rating_count, instant_book=p.instant_book,
        is_featured=p.is_featured, is_favorite=bool(favs and p.id in favs), host_name=host.display_name if host else "",
        host_verified=bool(host and host.is_verified), amenities=[a for a in p.amenities.split(",") if a],
        latitude=round(p.latitude, 2) if p.latitude is not None else None,
        longitude=round(p.longitude, 2) if p.longitude is not None else None, total=total, nights=nights,
    )


def host_public(session: Session, h: LodgeHost) -> S.HostPublic:
    partner = session.get(PartnerApplication, h.partner_application_id) if h.partner_application_id else None
    n = session.exec(select(func.count(Property.id)).where(Property.host_id == h.id, Property.status == "active")).one()
    ids = [x for x in session.exec(select(Property.id).where(Property.host_id == h.id)).all()]
    reviews = session.exec(select(func.count(LodgeReview.id)).where(LodgeReview.property_id.in_(ids), LodgeReview.is_hidden == False)).one() if ids else 0  # noqa: E712
    return S.HostPublic(
        id=h.id, display_name=h.display_name, bio=h.bio, languages=h.languages, avatar=h.avatar_path,
        is_verified=h.is_verified, partner_name=partner.company if partner else None, member_since=h.created_at,
        properties_count=int(n), reviews_count=int(reviews),
    )


def host_owner(session: Session, h: LodgeHost) -> S.HostOwnerRead:
    partner = session.get(PartnerApplication, h.partner_application_id) if h.partner_application_id else None
    return S.HostOwnerRead(
        id=h.id, display_name=h.display_name, bio=h.bio, phone=h.phone, whatsapp=h.whatsapp, languages=h.languages,
        avatar_path=h.avatar_path, mobile_money_operator=h.mobile_money_operator, mobile_money_phone=h.mobile_money_phone,
        is_verified=h.is_verified, partner_name=partner.company if partner else None, created_at=h.created_at,
    )


def review_read(session: Session, r: LodgeReview, with_property: bool = False) -> S.ReviewRead:
    title = None
    if with_property:
        p = session.get(Property, r.property_id)
        title = p.title if p else None
    return S.ReviewRead(
        id=r.id, property_id=r.property_id, author_name=r.author_name or "Voyageur", rating=r.rating, cleanliness=r.cleanliness,
        accuracy=r.accuracy, location=r.location, value=r.value, comment=r.comment, host_reply=r.host_reply,
        is_hidden=r.is_hidden, property_title=title, created_at=r.created_at,
    )


def review_summary(session: Session, property_id: int) -> S.ReviewSummary:
    rows = session.exec(select(LodgeReview).where(LodgeReview.property_id == property_id, LodgeReview.is_hidden == False)).all()  # noqa: E712
    if not rows:
        return S.ReviewSummary()

    def avg(attr: str) -> float:
        vals = [getattr(r, attr) for r in rows if getattr(r, attr)]
        return round(sum(vals) / len(vals), 2) if vals else 0

    dist = {i: 0 for i in range(1, 6)}
    for r in rows:
        dist[r.rating] += 1
    return S.ReviewSummary(
        avg=round(sum(r.rating for r in rows) / len(rows), 2), count=len(rows), cleanliness=avg("cleanliness"),
        accuracy=avg("accuracy"), location=avg("location"), value=avg("value"), distribution=dist,
    )


def detail(session: Session, p: Property, favs: Optional[set] = None, *, similar: Optional[list] = None) -> S.PropertyDetail:
    host = session.get(LodgeHost, p.host_id)
    base = card(session, p, host, favs).model_dump()
    imgs = property_images(session, p.id)
    label, text = POLICY_TEXT.get(p.cancellation_policy, ("", ""))
    reviews = session.exec(
        select(LodgeReview).where(LodgeReview.property_id == p.id, LodgeReview.is_hidden == False).order_by(LodgeReview.created_at.desc()).limit(30)  # noqa: E712
    ).all()
    base["images"] = [i.path for i in imgs]
    return S.PropertyDetail(
        **base, summary=p.summary, description=p.description, country=p.country,
        address_hint=", ".join(x for x in (p.area, p.city, p.country) if x), cleaning_fee=p.cleaning_fee,
        weekly_discount=p.weekly_discount, monthly_discount=p.monthly_discount, units=p.units, min_nights=p.min_nights,
        max_nights=p.max_nights, check_in_from=p.check_in_from, check_out_until=p.check_out_until, house_rules=p.house_rules,
        cancellation_policy=p.cancellation_policy, cancellation_label=label, cancellation_text=text,
        gallery=[{"path": i.path, "caption": i.caption} for i in imgs], host=host_public(session, host),
        review_summary=review_summary(session, p.id), reviews=[review_read(session, r) for r in reviews],
        similar=similar or [],
    )


def owner_read(session: Session, p: Property) -> S.PropertyOwnerRead:
    base = detail(session, p).model_dump()
    base["latitude"], base["longitude"] = p.latitude, p.longitude  # l'hôte voit la position exacte
    today = date.today()
    pending = session.exec(select(func.count(Booking.id)).where(Booking.property_id == p.id, Booking.status == "pending_host")).one()
    upcoming = session.exec(select(func.count(Booking.id)).where(
        Booking.property_id == p.id, Booking.status.in_(("confirmed", "checked_in")), Booking.check_out >= today)).one()
    blocks = session.exec(select(PropertyBlock).where(PropertyBlock.property_id == p.id, PropertyBlock.end_date >= today).order_by(PropertyBlock.start_date)).all()
    rules = session.exec(select(PriceRule).where(PriceRule.property_id == p.id, PriceRule.end_date >= today).order_by(PriceRule.start_date)).all()
    return S.PropertyOwnerRead(
        **base, address=p.address or "", status=p.status, status_reason=p.status_reason, booked_count=p.booked_count, pending_requests=int(pending),
        upcoming=int(upcoming),
        blocks=[{"id": b.id, "start_date": b.start_date, "end_date": b.end_date, "reason": b.reason} for b in blocks],
        rules=[{"id": r.id, "label": r.label, "start_date": r.start_date, "end_date": r.end_date, "price_per_night": r.price_per_night} for r in rules],
        amenity_keys=[a for a in p.amenities.split(",") if a], image_paths=[g["path"] for g in base["gallery"]],
    )


def booking_read(session: Session, b: Booking, *, viewer: str = "guest") -> S.BookingRead:
    """`viewer` : guest | host | admin. L'adresse exacte et les coordonnées de
    l'hôte ne sont données au voyageur qu'une fois la réservation confirmée."""
    p = session.get(Property, b.property_id)
    host = session.get(LodgeHost, b.host_id)
    guest = session.get(User, b.guest_id)
    imgs = property_images(session, b.property_id)
    events = session.exec(select(BookingEvent).where(BookingEvent.booking_id == b.id).order_by(BookingEvent.created_at, BookingEvent.id)).all()
    revealed = b.status in ("confirmed", "checked_in", "completed", "disputed") or viewer != "guest"
    label = POLICY_TEXT.get(b.policy, ("", ""))[0]
    can_cancel = b.status in ("pending_host", "confirmed") and b.escrow_status == "held" and b.check_in >= date.today()
    reviewed = session.exec(select(LodgeReview).where(LodgeReview.booking_id == b.id)).first() is not None
    ended = b.status == "completed" or (b.status == "checked_in" and b.check_out <= date.today())
    data = dict(
        code=b.code, status=b.status,
        property=S.BookingPropertyMini(id=p.id, slug=p.slug, title=p.title, city=p.city, type=p.type, image=imgs[0].path if imgs else None),
        check_in=b.check_in, check_out=b.check_out, nights=b.nights, guests=b.guests, units=b.units,
        nightly_total=b.nightly_total, cleaning_fee=b.cleaning_fee, discount=b.discount, total=b.total,
        refund_amount=b.refund_amount, guest_name=b.guest_name, guest_phone=b.guest_phone, arrival_time=b.arrival_time,
        note=b.note, policy=b.policy, policy_label=label, escrow_status=b.escrow_status, created_at=b.created_at,
        paid_at=b.paid_at, host_deadline=b.host_deadline, cancel_reason=b.cancel_reason, dispute_reason=b.dispute_reason,
        dispute_note=b.dispute_note, can_cancel=can_cancel,
        refund_if_cancelled=refund_for_cancellation(b) if can_cancel else 0,
        can_dispute=viewer == "guest" and dispute_window_open(session, b),
        can_review=viewer == "guest" and ended and not reviewed and b.escrow_status in ("released", "held"),
        reviewed=reviewed, events=[S.BookingEventRead(status=e.status, label=e.label, note=e.note, actor=e.actor, created_at=e.created_at) for e in events],
    )
    if viewer in ("host", "admin"):
        data.update(commission_rate=b.commission_rate, commission_amount=b.commission_amount, host_net=b.host_net,
                    guest_email=guest.email if guest else None)
    if revealed:
        data.update(
            host_name=host.display_name if host else None, host_phone=host.phone if host else None,
            host_whatsapp=host.whatsapp if host else None, address=", ".join(x for x in (p.address, p.area, p.city) if x),
            check_in_from=p.check_in_from, check_out_until=p.check_out_until, house_rules=p.house_rules,
            latitude=p.latitude, longitude=p.longitude,
        )
    return S.BookingRead(**data)


def quote_read(quote: dict) -> S.QuoteRead:
    return S.QuoteRead(**{k: quote[k] for k in S.QuoteRead.model_fields})
