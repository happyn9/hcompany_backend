from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.lodging.models import CANCELLATION_POLICIES, PROPERTY_TYPES


def _clean(v: Optional[str]) -> str:
    return (v or "").strip()


# --- Lecture publique ----------------------------------------------------------

class HostPublic(BaseModel):
    id: int
    display_name: str
    bio: str = ""
    languages: str = ""
    avatar: Optional[str] = None
    is_verified: bool = False
    partner_name: Optional[str] = None
    member_since: datetime
    properties_count: int = 0
    reviews_count: int = 0


class PropertyCard(BaseModel):
    id: int
    slug: str
    title: str
    type: str
    city: str
    area: str = ""
    price_per_night: float
    image: Optional[str] = None
    images: list[str] = []
    max_guests: int
    bedrooms: int
    beds: int
    bathrooms: float
    rating_avg: float = 0
    rating_count: int = 0
    instant_book: bool = False
    is_featured: bool = False
    is_favorite: bool = False
    host_name: str = ""
    host_verified: bool = False
    amenities: list[str] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Renseignés quand la recherche contient des dates
    total: Optional[float] = None
    nights: Optional[int] = None


class ReviewRead(BaseModel):
    id: int
    property_id: int
    author_name: str
    rating: int
    cleanliness: int = 0
    accuracy: int = 0
    location: int = 0
    value: int = 0
    comment: str = ""
    host_reply: Optional[str] = None
    is_hidden: bool = False
    property_title: Optional[str] = None
    created_at: datetime


class ReviewSummary(BaseModel):
    avg: float = 0
    count: int = 0
    cleanliness: float = 0
    accuracy: float = 0
    location: float = 0
    value: float = 0
    distribution: dict[int, int] = {}


class PropertyDetail(PropertyCard):
    summary: str = ""
    description: str = ""
    country: str = ""
    address_hint: str = ""  # quartier / ville ; l'adresse exacte n'est donnée qu'après réservation
    cleaning_fee: float = 0
    weekly_discount: float = 0
    monthly_discount: float = 0
    units: int = 1
    min_nights: int = 1
    max_nights: int = 90
    check_in_from: str = "14:00"
    check_out_until: str = "11:00"
    house_rules: str = ""
    cancellation_policy: str = "flexible"
    cancellation_label: str = ""
    cancellation_text: str = ""
    gallery: list[dict] = []
    host: HostPublic
    review_summary: ReviewSummary
    reviews: list[ReviewRead] = []
    similar: list[PropertyCard] = []


class SearchResponse(BaseModel):
    items: list[PropertyCard]
    total: int
    page: int
    pages: int


class CityRead(BaseModel):
    city: str
    country: str = ""
    count: int
    image: Optional[str] = None
    min_price: float = 0


class AmenityRead(BaseModel):
    key: str
    label_fr: str
    label_en: str


class HomeResponse(BaseModel):
    featured: list[PropertyCard]
    latest: list[PropertyCard]
    top_rated: list[PropertyCard]
    cities: list[CityRead]
    types: dict[str, int]
    totals: dict[str, int]


class CalendarDay(BaseModel):
    date: date
    available: bool
    units_left: int
    price: float


# --- Devis & réservation ---------------------------------------------------------

class QuoteRequest(BaseModel):
    property_id: int
    check_in: date
    check_out: date
    guests: int = Field(default=1, ge=1, le=60)
    units: int = Field(default=1, ge=1, le=30)


class QuoteRead(BaseModel):
    property_id: int
    check_in: date
    check_out: date
    nights: int
    guests: int
    units: int
    avg_night: float
    nightly_total: float
    discount: float
    discount_pct: float
    cleaning_fee: float
    total: float
    policy: str
    instant_book: bool
    cancel_free_until: date


class BookRequest(QuoteRequest):
    guest_name: str = Field(min_length=2, max_length=120)
    guest_phone: str = Field(min_length=6, max_length=30)
    arrival_time: str = Field(default="", max_length=20)
    note: str = Field(default="", max_length=1000)
    method: str
    phone: str

    @field_validator("guest_name", "guest_phone", "arrival_time", "note", "method", "phone", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class BookingPropertyMini(BaseModel):
    id: int
    slug: str
    title: str
    city: str
    type: str
    image: Optional[str] = None


class BookingEventRead(BaseModel):
    status: str
    label: str
    note: str = ""
    actor: str = "system"
    created_at: datetime


class MessageRead(BaseModel):
    id: int
    sender_role: str
    body: str
    created_at: datetime
    mine: bool = False


class BookingRead(BaseModel):
    code: str
    status: str
    property: BookingPropertyMini
    check_in: date
    check_out: date
    nights: int
    guests: int
    units: int
    nightly_total: float
    cleaning_fee: float
    discount: float
    total: float
    commission_rate: float = 0
    commission_amount: float = 0
    host_net: float = 0
    refund_amount: float = 0
    guest_name: str = ""
    guest_phone: str = ""
    guest_email: Optional[str] = None
    arrival_time: str = ""
    note: str = ""
    policy: str
    policy_label: str = ""
    escrow_status: str
    created_at: datetime
    paid_at: Optional[datetime] = None
    host_deadline: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    dispute_reason: Optional[str] = None
    dispute_note: Optional[str] = None
    # Calculés
    can_cancel: bool = False
    refund_if_cancelled: float = 0
    can_dispute: bool = False
    can_review: bool = False
    reviewed: bool = False
    # Révélés uniquement une fois la réservation confirmée
    host_name: Optional[str] = None
    host_phone: Optional[str] = None
    host_whatsapp: Optional[str] = None
    address: Optional[str] = None
    check_in_from: Optional[str] = None
    check_out_until: Optional[str] = None
    house_rules: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    events: list[BookingEventRead] = []


class CheckoutResponse(BaseModel):
    reference: str
    total: float
    status: str
    simulated: bool
    booking: BookingRead


class CancelRequest(BaseModel):
    reason: str = Field(default="", max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class DisputeRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=200)
    note: str = Field(default="", max_length=2000)

    @field_validator("reason", "note", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class ReviewCreate(BaseModel):
    booking_code: str
    rating: int = Field(ge=1, le=5)
    cleanliness: int = Field(default=0, ge=0, le=5)
    accuracy: int = Field(default=0, ge=0, le=5)
    location: int = Field(default=0, ge=0, le=5)
    value: int = Field(default=0, ge=0, le=5)
    comment: str = Field(default="", max_length=2000)

    @field_validator("comment", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class ReplyRequest(BaseModel):
    reply: str = Field(min_length=1, max_length=1000)

    @field_validator("reply", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


# --- Hôte ------------------------------------------------------------------------

class HostWrite(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    bio: str = Field(default="", max_length=1500)
    phone: str = Field(default="", max_length=30)
    whatsapp: str = Field(default="", max_length=30)
    languages: str = Field(default="Français, English", max_length=120)
    avatar_path: Optional[str] = None
    mobile_money_operator: str = ""
    mobile_money_phone: str = ""

    @field_validator("display_name", "bio", "phone", "whatsapp", "languages", "mobile_money_operator", "mobile_money_phone", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class HostOwnerRead(BaseModel):
    id: int
    display_name: str
    bio: str = ""
    phone: str = ""
    whatsapp: str = ""
    languages: str = ""
    avatar_path: Optional[str] = None
    mobile_money_operator: str = ""
    mobile_money_phone: str = ""
    is_verified: bool = False
    partner_name: Optional[str] = None
    created_at: datetime


class PropertyWrite(BaseModel):
    title: str = Field(min_length=4, max_length=120)
    summary: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=5000)
    type: str = "lodge"
    country: str = Field(default="Zambie", max_length=60)
    city: str = Field(min_length=2, max_length=80)
    area: str = Field(default="", max_length=100)
    address: str = Field(default="", max_length=240)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    price_per_night: float = Field(gt=0, le=1_000_000)
    cleaning_fee: float = Field(default=0, ge=0, le=100_000)
    weekly_discount: float = Field(default=0, ge=0, le=60)
    monthly_discount: float = Field(default=0, ge=0, le=80)
    max_guests: int = Field(default=2, ge=1, le=60)
    bedrooms: int = Field(default=1, ge=0, le=40)
    beds: int = Field(default=1, ge=1, le=80)
    bathrooms: float = Field(default=1, ge=0, le=40)
    units: int = Field(default=1, ge=1, le=200)
    min_nights: int = Field(default=1, ge=1, le=90)
    max_nights: int = Field(default=90, ge=1, le=365)
    check_in_from: str = Field(default="14:00", max_length=5)
    check_out_until: str = Field(default="11:00", max_length=5)
    amenities: list[str] = []
    house_rules: str = Field(default="", max_length=2000)
    cancellation_policy: str = "flexible"
    instant_book: bool = False
    images: list[str] = []

    @field_validator("title", "summary", "description", "country", "city", "area", "address", "house_rules", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v not in PROPERTY_TYPES:
            raise ValueError("Type de logement invalide.")
        return v

    @field_validator("cancellation_policy")
    @classmethod
    def _policy(cls, v):
        if v not in CANCELLATION_POLICIES:
            raise ValueError("Politique d'annulation invalide.")
        return v

    @field_validator("check_in_from", "check_out_until")
    @classmethod
    def _hour(cls, v):
        parts = v.split(":")
        if len(parts) != 2 or not all(p.isdigit() for p in parts) or int(parts[0]) > 23 or int(parts[1]) > 59:
            raise ValueError("Heure invalide (format HH:MM).")
        return f"{int(parts[0]):02d}:{int(parts[1]):02d}"


class PropertyOwnerRead(PropertyDetail):
    address: str = ""
    status: str
    status_reason: Optional[str] = None
    booked_count: int = 0
    pending_requests: int = 0
    upcoming: int = 0
    blocks: list[dict] = []
    rules: list[dict] = []
    amenity_keys: list[str] = []
    image_paths: list[str] = []


class BlockWrite(BaseModel):
    start_date: date
    end_date: date  # exclue : la nuit du end_date reste libre
    reason: str = Field(default="", max_length=120)

    @field_validator("reason", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class RuleWrite(BaseModel):
    label: str = Field(default="", max_length=60)
    start_date: date
    end_date: date  # incluse
    price_per_night: float = Field(gt=0, le=1_000_000)

    @field_validator("label", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)


class HostStats(BaseModel):
    properties: int
    active: int
    bookings_total: int
    pending_requests: int
    upcoming: int
    in_house: int
    revenue: float
    month_revenue: float
    occupancy_30d: float
    rating_avg: float
    rating_count: int


class WalletRead(BaseModel):
    available: float
    pending: float
    total_earned: float
    total_paid_out: float
    min_payout: float


class PayoutRequest(BaseModel):
    amount: float = Field(gt=0)


class PayoutRead(BaseModel):
    id: int
    reference: str
    host_id: int
    amount: float
    operator: str = ""
    phone: str = ""
    status: str
    admin_note: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None
    host_name: Optional[str] = None


# --- Admin -------------------------------------------------------------------------

class AdminOverview(BaseModel):
    gmv: float
    commission: float
    escrow_held: float
    bookings: int
    properties_pending: int
    properties_active: int
    hosts: int
    disputes_open: int
    payouts_pending: int
    by_status: dict[str, int]


class AdminPropertyStatus(BaseModel):
    status: str
    reason: str = ""
    is_featured: Optional[bool] = None


class AdminPropertyRead(PropertyOwnerRead):
    host_email: Optional[str] = None
    host_phone: Optional[str] = None


class AdminHostRead(HostOwnerRead):
    user_email: Optional[str] = None
    commission_rate: Optional[float] = None
    properties_count: int = 0
    bookings_count: int = 0
    revenue: float = 0


class AdminHostUpdate(BaseModel):
    is_verified: Optional[bool] = None
    commission_rate: Optional[float] = Field(default=None, ge=0, le=60)
    clear_commission: bool = False


class AdminBookingRead(BookingRead):
    guest_email: Optional[str] = None
    host_display: Optional[str] = None


class AdminResolve(BaseModel):
    action: str  # refund | release
    refund_amount: Optional[float] = Field(default=None, ge=0)
    note: str = Field(default="", max_length=1000)

    @field_validator("action")
    @classmethod
    def _a(cls, v):
        if v not in ("refund", "release"):
            raise ValueError("Action invalide.")
        return v


class AdminPayoutUpdate(BaseModel):
    status: str  # paid | rejected
    admin_note: str = Field(default="", max_length=500)


class SettingsWrite(BaseModel):
    values: dict[str, str]
