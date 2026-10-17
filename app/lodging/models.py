"""H-Lodge — modèles de la plateforme d'hébergement (type Airbnb) : hôtes,
logements, photos, calendrier (blocages + tarifs saisonniers), réservations
avec séquestre, messages, avis, favoris, retraits.

Tous les montants sont en monnaie pivot (ZMW par défaut), comme H-Shopping.
Les statuts sont des chaînes (pas d'enums Postgres) pour pouvoir ajouter un
état sans migration lourde.
"""
from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

PROPERTY_TYPES = ("lodge", "hotel_room", "apartment", "house", "villa", "guesthouse", "studio")
PROPERTY_STATUSES = ("draft", "pending", "active", "paused", "rejected", "suspended")
CANCELLATION_POLICIES = ("flexible", "moderate", "strict")
# Cycle de vie d'une réservation :
#   pending_host → confirmed → checked_in → completed
#   (declined / expired / cancelled_guest / cancelled_host avant l'arrivée, disputed après)
BOOKING_STATUSES = (
    "pending_host", "confirmed", "checked_in", "completed",
    "declined", "expired", "cancelled_guest", "cancelled_host", "disputed",
)
# Statuts qui bloquent des chambres dans le calendrier.
ACTIVE_BOOKING_STATUSES = ("pending_host", "confirmed", "checked_in", "completed", "disputed")
ESCROW_STATUSES = ("none", "held", "released", "refunded")


class LodgeSetting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str = ""


class LodgeHost(SQLModel, table=True):
    """Profil d'hôte (un par utilisateur) : présentation + coordonnées de retrait."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True, index=True)
    display_name: str
    bio: str = ""
    phone: str = ""
    whatsapp: str = ""
    languages: str = "Français, English"
    avatar_path: Optional[str] = None
    partner_application_id: Optional[int] = Field(default=None, foreign_key="partnerapplication.id")
    mobile_money_operator: str = ""
    mobile_money_phone: str = ""
    is_verified: bool = False  # badge « hôte vérifié », posé par l'admin
    commission_rate: Optional[float] = None  # surcharge négociée, en %
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Property(SQLModel, table=True):
    """Un logement réservable. `units` > 1 pour un lodge qui propose plusieurs
    chambres identiques (la disponibilité compte les chambres libres)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    host_id: int = Field(foreign_key="lodgehost.id", index=True)
    title: str = Field(index=True)
    summary: str = ""
    description: str = ""
    type: str = Field(default="lodge", index=True)
    country: str = "Zambie"
    city: str = Field(default="", index=True)
    area: str = ""
    address: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    price_per_night: float
    cleaning_fee: float = 0
    weekly_discount: float = 0  # % à partir de 7 nuits
    monthly_discount: float = 0  # % à partir de 28 nuits
    max_guests: int = 2
    bedrooms: int = 1
    beds: int = 1
    bathrooms: float = 1
    units: int = 1
    min_nights: int = 1
    max_nights: int = 90
    check_in_from: str = "14:00"
    check_out_until: str = "11:00"
    amenities: str = ""  # clés séparées par des virgules (voir AMENITIES côté site)
    house_rules: str = ""
    cancellation_policy: str = "flexible"
    instant_book: bool = False
    status: str = Field(default="draft", index=True)
    status_reason: Optional[str] = None
    is_featured: bool = False
    rating_avg: float = 0
    rating_count: int = 0
    booked_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None


class PropertyImage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    property_id: int = Field(foreign_key="property.id", index=True)
    path: str
    caption: str = ""
    sort_order: int = 0


class PropertyBlock(SQLModel, table=True):
    """Dates fermées par l'hôte (travaux, usage personnel...). `end_date` exclue."""
    id: Optional[int] = Field(default=None, primary_key=True)
    property_id: int = Field(foreign_key="property.id", index=True)
    start_date: date
    end_date: date
    reason: str = ""


class PriceRule(SQLModel, table=True):
    """Tarif saisonnier : remplace le prix de base sur [start_date, end_date]."""
    id: Optional[int] = Field(default=None, primary_key=True)
    property_id: int = Field(foreign_key="property.id", index=True)
    label: str = ""
    start_date: date
    end_date: date  # incluse
    price_per_night: float


class LodgeCheckout(SQLModel, table=True):
    """Un paiement mobile money = une réservation."""
    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(index=True, unique=True)
    guest_id: int = Field(foreign_key="user.id", index=True)
    total: float = 0
    method: str = ""
    phone_number: str = ""
    provider_reference: Optional[str] = None
    simulated: bool = True
    status: str = "pending"  # pending | paid | failed
    failure_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None


class Booking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # ex: HL-7K3M9Q
    property_id: int = Field(foreign_key="property.id", index=True)
    host_id: int = Field(foreign_key="lodgehost.id", index=True)
    guest_id: int = Field(foreign_key="user.id", index=True)
    checkout_id: Optional[int] = Field(default=None, foreign_key="lodgecheckout.id", index=True)
    status: str = Field(default="pending_host", index=True)
    check_in: date = Field(index=True)
    check_out: date
    nights: int = 1
    guests: int = 1
    units: int = 1
    # Montants
    nightly_total: float = 0
    cleaning_fee: float = 0
    discount: float = 0
    total: float = 0
    commission_rate: float = 0
    commission_amount: float = 0
    host_net: float = 0
    refund_amount: float = 0
    # Voyageur
    guest_name: str = ""
    guest_phone: str = ""
    arrival_time: str = ""
    note: str = ""
    # Instantané des conditions au moment de la réservation
    policy: str = "flexible"
    title_snapshot: str = ""
    # Séquestre
    escrow_status: str = "none"
    escrow_released_at: Optional[datetime] = None
    # Litige / annulation
    dispute_reason: Optional[str] = None
    dispute_note: Optional[str] = None
    dispute_opened_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    # Dates
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    checked_in_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    host_deadline: Optional[datetime] = None  # réponse attendue avant cette date


class BookingEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="booking.id", index=True)
    status: str
    label: str
    note: str = ""
    actor: str = "system"  # system | guest | host | admin
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BookingMessage(SQLModel, table=True):
    """Messagerie voyageur ↔ hôte, rattachée à une réservation."""
    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="booking.id", index=True)
    sender_id: int = Field(foreign_key="user.id")
    sender_role: str = "guest"  # guest | host
    body: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LodgeReview(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    property_id: int = Field(foreign_key="property.id", index=True)
    booking_id: int = Field(foreign_key="booking.id", unique=True, index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    author_name: str = ""
    rating: int
    cleanliness: int = 0
    accuracy: int = 0
    location: int = 0
    value: int = 0
    comment: str = ""
    host_reply: Optional[str] = None
    is_hidden: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LodgeFavorite(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    property_id: int = Field(foreign_key="property.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LodgePayout(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(index=True, unique=True)
    host_id: int = Field(foreign_key="lodgehost.id", index=True)
    amount: float
    operator: str = ""
    phone: str = ""
    status: str = Field(default="requested", index=True)  # requested | paid | rejected
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None
