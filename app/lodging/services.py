"""Logique métier H-Logement : réglages, calendrier et tarifs, devis,
création de réservation, séquestre, annulation selon la politique,
litiges, avis, solde hôte."""
from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.lodging.models import (
    ACTIVE_BOOKING_STATUSES,
    Booking,
    BookingEvent,
    LodgeCheckout,
    LodgeHost,
    LodgePayout,
    LodgeReview,
    LodgeSetting,
    PriceRule,
    Property,
    PropertyBlock,
    PropertyImage,
)
from app.models import User
from app.services.notifications import create_in_app_notification, send_email
from app.shopping.services import money, slugify, unique_slug  # noqa: F401  (réexportés)

logger = logging.getLogger("hcompany.lodging")

# --- Réglages ---------------------------------------------------------------

DEFAULT_SETTINGS = {
    "commission_rate": "10",        # % prélevé sur le prix des nuits
    "host_response_hours": "24",    # délai de réponse de l'hôte (réservation sur demande)
    "auto_release_hours": "24",     # libération du séquestre N heures après l'arrivée
    "dispute_window_hours": "48",   # litige possible N heures après l'arrivée
    "min_payout": "100",            # retrait minimum (monnaie pivot)
    "max_advance_days": "365",      # réservation possible jusqu'à N jours à l'avance
}

# Équipements proposés (clé → libellés). Le site porte les icônes.
AMENITIES = {
    "wifi": ("Wi-Fi", "Wi-Fi"),
    "kitchen": ("Cuisine équipée", "Equipped kitchen"),
    "parking": ("Parking gratuit", "Free parking"),
    "ac": ("Climatisation", "Air conditioning"),
    "fan": ("Ventilateur", "Fan"),
    "heating": ("Chauffage", "Heating"),
    "hot_water": ("Eau chaude", "Hot water"),
    "tv": ("Télévision", "TV"),
    "pool": ("Piscine", "Pool"),
    "garden": ("Jardin", "Garden"),
    "balcony": ("Balcon / terrasse", "Balcony / terrace"),
    "bbq": ("Barbecue", "BBQ"),
    "breakfast": ("Petit-déjeuner inclus", "Breakfast included"),
    "restaurant": ("Restaurant sur place", "On-site restaurant"),
    "laundry": ("Lessive", "Laundry"),
    "workspace": ("Espace de travail", "Workspace"),
    "generator": ("Groupe électrogène", "Backup generator"),
    "security": ("Sécurité / gardien", "Security / guard"),
    "reception_24h": ("Accueil 24 h/24", "24h reception"),
    "airport_shuttle": ("Navette / transfert", "Shuttle / transfer"),
    "mosquito_net": ("Moustiquaire", "Mosquito net"),
    "fridge": ("Réfrigérateur", "Fridge"),
    "family_friendly": ("Adapté aux familles", "Family friendly"),
    "pets_allowed": ("Animaux acceptés", "Pets allowed"),
    "wheelchair": ("Accessible PMR", "Wheelchair accessible"),
}


def get_setting(session: Session, key: str) -> str:
    row = session.get(LodgeSetting, key)
    return row.value if row else DEFAULT_SETTINGS.get(key, "")


def get_float(session: Session, key: str) -> float:
    try:
        return float(get_setting(session, key))
    except ValueError:
        return float(DEFAULT_SETTINGS.get(key, "0"))


def all_settings(session: Session) -> dict:
    data = dict(DEFAULT_SETTINGS)
    for row in session.exec(select(LodgeSetting)).all():
        data[row.key] = row.value
    return data


def commission_rate_for(session: Session, host: LodgeHost) -> float:
    if host.commission_rate is not None:
        return float(host.commission_rate)
    return get_float(session, "commission_rate")


def clean_amenities(raw: list[str] | str) -> str:
    keys = raw.split(",") if isinstance(raw, str) else raw
    seen: list[str] = []
    for k in keys:
        k = (k or "").strip()
        if k in AMENITIES and k not in seen:
            seen.append(k)
    return ",".join(seen)


def notify_user(session: Session, user_id: Optional[int], title: str, body: str, email: Optional[str] = None) -> None:
    try:
        if user_id:
            create_in_app_notification(session, user_id, title, body)
        if email:
            send_email(email, f"H-Logement — {title}", f"{body}\n\n— H-Logement, par H-Company")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Notification H-Logement non envoyée : %s", exc)


# --- Logement, calendrier ----------------------------------------------------

def property_images(session: Session, property_id: int) -> list[PropertyImage]:
    return session.exec(
        select(PropertyImage).where(PropertyImage.property_id == property_id).order_by(PropertyImage.sort_order, PropertyImage.id)
    ).all()


def daterange(start: date, end: date):
    """Les nuits de `start` (incluse) à `end` (exclue)."""
    d = start
    while d < end:
        yield d
        d += timedelta(days=1)


def _rules(session: Session, property_id: int) -> list[PriceRule]:
    return session.exec(select(PriceRule).where(PriceRule.property_id == property_id).order_by(PriceRule.id)).all()


def night_price(prop: Property, rules: list[PriceRule], d: date) -> float:
    price = prop.price_per_night
    for r in rules:  # la règle la plus récente l'emporte
        if r.start_date <= d <= r.end_date:
            price = r.price_per_night
    return float(price)


def _used_by_night(session: Session, prop: Property, start: date, end: date, *, exclude_booking: Optional[int] = None) -> dict[date, int]:
    """Chambres déjà prises chaque nuit de [start, end) (réservations + blocages)."""
    used: dict[date, int] = {d: 0 for d in daterange(start, end)}
    bookings = session.exec(
        select(Booking).where(
            Booking.property_id == prop.id, Booking.status.in_(ACTIVE_BOOKING_STATUSES),
            Booking.check_in < end, Booking.check_out > start,
        )
    ).all()
    for b in bookings:
        if exclude_booking and b.id == exclude_booking:
            continue
        for d in daterange(max(b.check_in, start), min(b.check_out, end)):
            used[d] += b.units
    blocks = session.exec(
        select(PropertyBlock).where(PropertyBlock.property_id == prop.id, PropertyBlock.start_date < end, PropertyBlock.end_date > start)
    ).all()
    for bl in blocks:
        for d in daterange(max(bl.start_date, start), min(bl.end_date, end)):
            used[d] = prop.units
    return used


def calendar_days(session: Session, prop: Property, start: date, days: int) -> list[dict]:
    end = start + timedelta(days=days)
    used = _used_by_night(session, prop, start, end)
    rules = _rules(session, prop.id)
    today = date.today()
    out = []
    for d in daterange(start, end):
        left = max(0, prop.units - used.get(d, 0))
        out.append({"date": d, "available": left > 0 and d >= today, "units_left": left if d >= today else 0, "price": night_price(prop, rules, d)})
    return out


def availability_conflict(session: Session, prop: Property, check_in: date, check_out: date, units: int, *, exclude_booking: Optional[int] = None) -> Optional[date]:
    used = _used_by_night(session, prop, check_in, check_out, exclude_booking=exclude_booking)
    for d, n in used.items():
        if n + units > prop.units:
            return d
    return None


def quote_stay(session: Session, prop: Property, check_in: date, check_out: date, guests: int, units: int = 1) -> dict:
    """Devis recalculé côté serveur : jamais de prix venant du client."""
    today = date.today()
    if check_in < today:
        raise HTTPException(status_code=422, detail="La date d'arrivée est déjà passée.")
    if check_out <= check_in:
        raise HTTPException(status_code=422, detail="La date de départ doit être après l'arrivée.")
    nights = (check_out - check_in).days
    if nights < prop.min_nights:
        raise HTTPException(status_code=422, detail=f"Séjour minimum : {prop.min_nights} nuit(s).")
    if nights > prop.max_nights:
        raise HTTPException(status_code=422, detail=f"Séjour maximum : {prop.max_nights} nuits.")
    if (check_in - today).days > int(get_float(session, "max_advance_days")):
        raise HTTPException(status_code=422, detail="Cette date est trop éloignée pour réserver.")
    if units < 1 or units > prop.units:
        raise HTTPException(status_code=422, detail=f"Nombre de chambres invalide (1 à {prop.units}).")
    if guests < 1:
        raise HTTPException(status_code=422, detail="Indiquez au moins un voyageur.")
    if guests > prop.max_guests * units:
        raise HTTPException(status_code=422, detail=f"Capacité dépassée : {prop.max_guests * units} voyageur(s) maximum.")
    conflict = availability_conflict(session, prop, check_in, check_out, units)
    if conflict:
        raise HTTPException(status_code=409, detail=f"Ce logement n'est pas disponible le {conflict.strftime('%d/%m/%Y')}. Choisissez d'autres dates.")

    rules = _rules(session, prop.id)
    per_night = [night_price(prop, rules, d) for d in daterange(check_in, check_out)]
    nightly = sum(per_night) * units
    pct = prop.monthly_discount if nights >= 28 and prop.monthly_discount else (prop.weekly_discount if nights >= 7 else 0)
    discount = nightly * pct / 100 if pct else 0
    cleaning = prop.cleaning_fee * units
    total = nightly - discount + cleaning
    host = session.get(LodgeHost, prop.host_id)
    rate = commission_rate_for(session, host)
    commission = (nightly - discount) * rate / 100
    return {
        "property_id": prop.id, "check_in": check_in, "check_out": check_out, "nights": nights, "guests": guests, "units": units,
        "avg_night": money(sum(per_night) / nights), "nightly_total": money(nightly), "discount": money(discount),
        "discount_pct": pct, "cleaning_fee": money(cleaning), "total": money(total),
        "commission_rate": rate, "commission_amount": money(commission), "host_net": money(total - commission),
        "policy": prop.cancellation_policy, "instant_book": prop.instant_book,
        "cancel_free_until": free_cancellation_until(prop.cancellation_policy, check_in),
    }


# --- Politique d'annulation ---------------------------------------------------

POLICY_TEXT = {
    "flexible": ("Flexible", "Annulation gratuite jusqu'à 24 h avant l'arrivée ; ensuite, la première nuit n'est pas remboursée."),
    "moderate": ("Modérée", "Annulation gratuite jusqu'à 5 jours avant l'arrivée ; ensuite, 50 % remboursés jusqu'à 24 h avant, puis rien."),
    "strict": ("Stricte", "Annulation gratuite jusqu'à 14 jours avant l'arrivée ; 50 % remboursés jusqu'à 7 jours avant, puis rien."),
}


def free_cancellation_until(policy: str, check_in: date) -> date:
    days = {"flexible": 1, "moderate": 5, "strict": 14}.get(policy, 1)
    return check_in - timedelta(days=days)


def refund_for_cancellation(b: Booking, today: Optional[date] = None) -> float:
    """Montant remboursé quand le VOYAGEUR annule, selon la politique figée à la réservation."""
    today = today or date.today()
    days = (b.check_in - today).days
    total = float(b.total)
    first_night = b.nightly_total / max(b.nights, 1)
    if b.policy == "strict":
        ratio = 1.0 if days >= 14 else 0.5 if days >= 7 else 0.0
        return money(total * ratio)
    if b.policy == "moderate":
        ratio = 1.0 if days >= 5 else 0.5 if days >= 1 else 0.0
        return money(total * ratio)
    if days >= 1:
        return money(total)
    return money(max(0.0, total - first_night))


# --- Réservation --------------------------------------------------------------

EVENT_LABELS = {
    "pending_host": "Demande envoyée — en attente de la réponse de l'hôte",
    "confirmed": "Réservation confirmée — fonds sécurisés par H-Company",
    "checked_in": "Séjour en cours",
    "completed": "Séjour terminé",
    "declined": "Demande refusée par l'hôte — remboursement en cours",
    "expired": "Sans réponse de l'hôte — demande expirée, remboursement en cours",
    "cancelled_guest": "Réservation annulée par le voyageur",
    "cancelled_host": "Réservation annulée par l'hôte — remboursement intégral",
    "disputed": "Litige ouvert — H-Company examine le dossier",
}


def add_event(session: Session, b: Booking, status: str, *, label: Optional[str] = None, note: str = "", actor: str = "system") -> None:
    session.add(BookingEvent(booking_id=b.id, status=status, label=label or EVENT_LABELS.get(status, status), note=note, actor=actor))


def new_booking_code(session: Session) -> str:
    for _ in range(10):
        code = "HL-" + secrets.token_hex(3).upper()
        if not session.exec(select(Booking).where(Booking.code == code)).first():
            return code
    raise HTTPException(status_code=500, detail="Impossible de générer la référence de réservation.")


def create_booking(session: Session, prop: Property, guest: User, quote: dict, *, guest_name: str, guest_phone: str,
                   arrival_time: str, note: str, method: str, phone: str) -> tuple[LodgeCheckout, Booking]:
    checkout = LodgeCheckout(reference="HLP-" + secrets.token_hex(4).upper(), guest_id=guest.id, total=quote["total"], method=method, phone_number=phone)
    session.add(checkout)
    session.flush()
    b = Booking(
        code=new_booking_code(session), property_id=prop.id, host_id=prop.host_id, guest_id=guest.id, checkout_id=checkout.id,
        status="pending_host", check_in=quote["check_in"], check_out=quote["check_out"], nights=quote["nights"],
        guests=quote["guests"], units=quote["units"], nightly_total=quote["nightly_total"], cleaning_fee=quote["cleaning_fee"],
        discount=quote["discount"], total=quote["total"], commission_rate=quote["commission_rate"],
        commission_amount=quote["commission_amount"], host_net=quote["host_net"], guest_name=guest_name, guest_phone=guest_phone,
        arrival_time=arrival_time, note=note, policy=prop.cancellation_policy, title_snapshot=prop.title,
    )
    session.add(b)
    session.flush()
    add_event(session, b, "pending_host", label="Réservation créée — en attente de paiement", actor="guest")
    return checkout, b


def mark_paid(session: Session, checkout: LodgeCheckout, b: Booking, *, simulated: bool, provider_reference: Optional[str]) -> Booking:
    now = datetime.utcnow()
    checkout.status, checkout.paid_at, checkout.simulated, checkout.provider_reference = "paid", now, simulated, provider_reference
    session.add(checkout)
    b.paid_at, b.escrow_status = now, "held"
    prop = session.get(Property, b.property_id)
    host = session.get(LodgeHost, b.host_id)
    host_user = session.get(User, host.user_id) if host else None
    if prop and prop.instant_book:
        _confirm(session, b, actor="system", note="Réservation instantanée")
    else:
        hours = int(get_float(session, "host_response_hours"))
        b.host_deadline = now + timedelta(hours=hours)
        add_event(session, b, "pending_host", note=f"Réf. paiement {checkout.reference}", actor="system",
                  label=f"Paiement reçu — l'hôte a {hours} h pour répondre")
        notify_user(session, host.user_id if host else None, f"Nouvelle demande {b.code}",
                    f"{b.guest_name} souhaite séjourner du {b.check_in:%d/%m} au {b.check_out:%d/%m} ({b.nights} nuit(s)). "
                    f"Répondez avant {b.host_deadline:%d/%m %H:%M} UTC depuis votre espace hôte.",
                    host_user.email if host_user else None)
    session.add(b)
    return b


def fail_booking(session: Session, checkout: LodgeCheckout, b: Booking, reason: str) -> None:
    checkout.status, checkout.failure_reason = "failed", reason
    b.status, b.cancel_reason = "cancelled_guest", reason
    session.add(checkout)
    session.add(b)
    add_event(session, b, "cancelled_guest", note=reason, label="Paiement refusé — réservation annulée")


def _confirm(session: Session, b: Booking, *, actor: str, note: str = "") -> None:
    now = datetime.utcnow()
    b.status, b.confirmed_at, b.host_deadline = "confirmed", now, None
    session.add(b)
    add_event(session, b, "confirmed", actor=actor, note=note)
    prop = session.get(Property, b.property_id)
    if prop:
        prop.booked_count += 1
        session.add(prop)
    host = session.get(LodgeHost, b.host_id)
    host_user = session.get(User, host.user_id) if host else None
    notify_user(session, b.guest_id, f"Réservation confirmée {b.code}",
                f"{b.title_snapshot} du {b.check_in:%d/%m/%Y} au {b.check_out:%d/%m/%Y}. Les coordonnées de l'hôte sont disponibles dans votre réservation.",
                session.get(User, b.guest_id).email if session.get(User, b.guest_id) else None)
    if actor == "system":
        notify_user(session, host.user_id if host else None, f"Réservation confirmée {b.code}",
                    f"{b.guest_name} a réservé {b.title_snapshot} du {b.check_in:%d/%m} au {b.check_out:%d/%m}.",
                    host_user.email if host_user else None)


def host_accept(session: Session, b: Booking) -> None:
    if b.status != "pending_host" or b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Cette demande n'est plus en attente.")
    if availability_conflict(session, session.get(Property, b.property_id), b.check_in, b.check_out, b.units, exclude_booking=b.id):
        raise HTTPException(status_code=409, detail="Ces dates ne sont plus disponibles (un blocage a été ajouté).")
    _confirm(session, b, actor="host")


def settle_refund(session: Session, b: Booking, refund: float, *, status: str, actor: str, reason: str) -> None:
    """Rembourse `refund` au voyageur ; le reste (s'il y en a) revient à l'hôte
    immédiatement, commission proratisée."""
    if b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Les fonds de cette réservation ne sont pas en séquestre.")
    refund = money(min(max(refund, 0), b.total))
    retained = money(b.total - refund)
    b.status, b.cancel_reason, b.refund_amount = status, reason, refund
    if retained <= 0:
        b.escrow_status, b.commission_amount, b.host_net = "refunded", 0, 0
    else:
        keep = retained / b.total if b.total else 0
        b.commission_amount = money(b.commission_amount * keep)
        b.host_net = money(retained - b.commission_amount)
        b.escrow_status, b.escrow_released_at = "released", datetime.utcnow()
    session.add(b)
    add_event(session, b, status, actor=actor, note=reason)
    msg = f"{refund:.2f} ZMW vous seront restitués sur votre mobile money." if refund > 0 else "Selon la politique d'annulation, aucun remboursement n'est dû."
    notify_user(session, b.guest_id, f"Réservation {b.code} — {EVENT_LABELS[status].split(' — ')[0].lower()}", msg)


def expire_overdue(session: Session) -> int:
    """Clôture ce que le temps décide : demandes sans réponse (remboursées),
    séjours qui commencent, fonds libérés après l'arrivée, séjours terminés.
    Appelé à l'ouverture des tableaux de bord (pas besoin de cron)."""
    now, today = datetime.utcnow(), date.today()
    changed = 0
    stale = now - timedelta(minutes=15)  # paiement jamais finalisé : on libère les dates
    for b in session.exec(select(Booking).where(Booking.status == "pending_host", Booking.paid_at == None, Booking.created_at < stale)).all():  # noqa: E711
        b.status, b.cancel_reason = "cancelled_guest", "Paiement non finalisé"
        session.add(b)
        add_event(session, b, "cancelled_guest", label="Paiement non finalisé — dates libérées")
        changed += 1
    for b in session.exec(select(Booking).where(Booking.status == "pending_host", Booking.escrow_status == "held", Booking.host_deadline < now)).all():
        settle_refund(session, b, b.total, status="expired", actor="system", reason="L'hôte n'a pas répondu à temps.")
        changed += 1
    for b in session.exec(select(Booking).where(Booking.status == "confirmed", Booking.check_in <= today)).all():
        b.status, b.checked_in_at = "checked_in", now
        session.add(b)
        add_event(session, b, "checked_in")
        changed += 1
    hours = int(get_float(session, "auto_release_hours"))
    for b in session.exec(select(Booking).where(Booking.status == "checked_in", Booking.escrow_status == "held")).all():
        if now >= datetime.combine(b.check_in, datetime.min.time()) + timedelta(hours=hours):
            release_escrow(session, b, actor="system", note=f"Libération automatique ({hours} h après l'arrivée, sans litige)")
            changed += 1
    for b in session.exec(select(Booking).where(Booking.status == "checked_in", Booking.check_out <= today, Booking.escrow_status == "released")).all():
        b.status, b.completed_at = "completed", now
        session.add(b)
        add_event(session, b, "completed")
        changed += 1
    if changed:
        session.commit()
    return changed


def release_escrow(session: Session, b: Booking, *, actor: str, note: str = "") -> None:
    if b.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Les fonds de cette réservation ne sont pas en séquestre.")
    b.escrow_status, b.escrow_released_at = "released", datetime.utcnow()
    if b.status == "disputed":
        b.status = "completed" if b.check_out <= date.today() else "checked_in"
    session.add(b)
    add_event(session, b, b.status, actor=actor, label="Fonds libérés à l'hôte", note=note)
    host = session.get(LodgeHost, b.host_id)
    notify_user(session, host.user_id if host else None, f"Paiement libéré — {b.code}", f"{b.host_net:.2f} ZMW sont disponibles dans votre solde.")


def dispute_window_open(session: Session, b: Booking) -> bool:
    if b.escrow_status != "held" or b.status not in ("confirmed", "checked_in"):
        return False
    hours = int(get_float(session, "dispute_window_hours"))
    start = datetime.combine(b.check_in, datetime.min.time())
    now_cat = datetime.utcnow() + timedelta(hours=2)  # les dates de séjour sont en heure locale (Zambie, UTC+2)
    return start <= now_cat <= start + timedelta(hours=hours)


# --- Avis ----------------------------------------------------------------------

def refresh_review_stats(session: Session, property_id: int) -> None:
    avg, n = session.exec(
        select(func.avg(LodgeReview.rating), func.count(LodgeReview.id)).where(LodgeReview.property_id == property_id, LodgeReview.is_hidden == False)  # noqa: E712
    ).one()
    p = session.get(Property, property_id)
    if p:
        p.rating_avg, p.rating_count = round(float(avg or 0), 2), int(n or 0)
        session.add(p)


# --- Solde hôte ----------------------------------------------------------------

def wallet(session: Session, host_id: int) -> dict:
    def total(col, *where):
        return float(session.exec(select(func.coalesce(func.sum(col), 0)).where(*where)).one())

    released = total(Booking.host_net, Booking.host_id == host_id, Booking.escrow_status == "released")
    pending = total(Booking.host_net, Booking.host_id == host_id, Booking.escrow_status == "held")
    out = total(LodgePayout.amount, LodgePayout.host_id == host_id, LodgePayout.status.in_(("requested", "paid")))
    paid = total(LodgePayout.amount, LodgePayout.host_id == host_id, LodgePayout.status == "paid")
    return {
        "available": money(released - out), "pending": money(pending), "total_earned": money(released),
        "total_paid_out": money(paid), "min_payout": get_float(session, "min_payout"),
    }
