from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.transport.models import BUS_LAYOUTS, BUS_TYPES


def _clean(v: Optional[str]) -> str:
    return (v or "").strip()


class Stripped(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


# --- Flotte ---------------------------------------------------------------------

class BusWrite(Stripped):
    name: str = Field(min_length=2, max_length=60)
    plate: str = Field(min_length=3, max_length=20)
    bus_type: str = "standard"
    layout: str = "2+2"
    seats_total: int = Field(ge=4, le=80)
    amenities: list[str] = []
    color: str = Field(default="#c89a3d", pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("bus_type")
    @classmethod
    def _t(cls, v):
        if v not in BUS_TYPES:
            raise ValueError("Type de bus inconnu.")
        return v

    @field_validator("layout")
    @classmethod
    def _l(cls, v):
        if v not in BUS_LAYOUTS:
            raise ValueError("Disposition inconnue.")
        return v


class BusRead(BaseModel):
    id: int
    name: str
    plate: str
    bus_type: str
    layout: str
    seats_total: int
    amenities: list[str] = []
    color: str = "#c89a3d"
    is_active: bool = True
    upcoming_trips: int = 0


# --- Lecture publique ---------------------------------------------------------

class OperatorPublic(BaseModel):
    id: int
    name: str
    description: str = ""
    city: str = ""
    is_verified: bool = False
    rating_avg: float = 0
    rating_count: int = 0
    trips_count: int = 0


class TripCard(BaseModel):
    id: int
    origin: str
    destination: str
    origin_stop: str = ""
    destination_stop: str = ""
    departure_at: datetime
    arrival_at: datetime
    duration_minutes: int
    price: float
    bus_type: str
    amenities: list[str] = []
    seats_total: int
    seats_left: int
    bus_layout: str = "2+2"
    bus: Optional[BusRead] = None
    border_crossing: bool = False
    bookable: bool = True
    closed_reason: Optional[str] = None
    operator: OperatorPublic


class TripDetail(TripCard):
    stops: list[str] = []
    luggage_note: str = ""
    notes: str = ""
    taken_seats: list[int] = []
    status: str = "scheduled"
    max_per_booking: int = 8
    free_cancel_hours: float = 48
    partial_cancel_hours: float = 12
    reviews: list["ReviewRead"] = []


class ReviewRead(BaseModel):
    id: int
    operator_id: int
    author_name: str
    route: str = ""
    rating: int
    comment: str = ""
    reply: Optional[str] = None
    is_hidden: bool = False
    operator_name: Optional[str] = None
    created_at: datetime


TripDetail.model_rebuild()


class PopularRoute(BaseModel):
    origin: str
    destination: str
    min_price: float
    trips: int


# --- Réservation --------------------------------------------------------------

class PassengerIn(Stripped):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(default="", max_length=30)
    document: str = Field(default="", max_length=40)
    seat: Optional[int] = None


class BookRequest(Stripped):
    trip_id: int
    passengers: list[PassengerIn] = Field(min_length=1, max_length=20)
    contact_name: str = Field(min_length=2, max_length=120)
    contact_phone: str = Field(min_length=6, max_length=30)
    method: str
    phone: str


class CancelRequest(Stripped):
    reason: str = Field(default="", max_length=500)


class DisputeRequest(Stripped):
    reason: str = Field(min_length=3, max_length=200)
    note: str = Field(default="", max_length=2000)


class PassengerRead(BaseModel):
    id: int
    name: str
    phone: str = ""
    document: str = ""
    seat_number: int
    ticket_code: str
    boarded: bool = False
    boarded_at: Optional[datetime] = None


class EventRead(BaseModel):
    status: str
    label: str
    note: str = ""
    actor: str = "system"
    created_at: datetime


class BookingRead(BaseModel):
    code: str
    status: str
    trip_id: int
    origin: str
    destination: str
    origin_stop: str = ""
    destination_stop: str = ""
    departure_at: datetime
    arrival_at: Optional[datetime] = None
    bus_type: str = "standard"
    seats: int
    unit_price: float
    total: float
    commission_rate: float = 0
    commission_amount: float = 0
    operator_net: float = 0
    refund_amount: float = 0
    escrow_status: str = "none"
    contact_name: str = ""
    contact_phone: str = ""
    user_email: Optional[str] = None
    operator_id: int
    operator_name: str = ""
    operator_display: str = ""
    operator_phone: Optional[str] = None
    operator_whatsapp: Optional[str] = None
    passengers: list[PassengerRead] = []
    events: list[EventRead] = []
    dispute_reason: Optional[str] = None
    dispute_note: Optional[str] = None
    cancel_reason: Optional[str] = None
    can_cancel: bool = False
    refund_if_cancelled: Optional[float] = None
    can_dispute: bool = False
    can_review: bool = False
    reviewed: bool = False
    created_at: datetime
    paid_at: Optional[datetime] = None


class CheckoutResponse(BaseModel):
    reference: str
    total: float
    status: str
    simulated: bool = True
    booking: BookingRead


class ReviewCreate(Stripped):
    booking_code: str
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


# --- Agence --------------------------------------------------------------------

class OperatorWrite(Stripped):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    city: str = Field(default="", max_length=80)
    phone: str = Field(default="", max_length=30)
    whatsapp: str = Field(default="", max_length=30)
    mobile_money_operator: str = Field(default="", max_length=30)
    mobile_money_phone: str = Field(default="", max_length=30)


class OperatorOwnerRead(BaseModel):
    id: int
    name: str
    description: str = ""
    city: str = ""
    phone: str = ""
    whatsapp: str = ""
    status: str
    status_reason: Optional[str] = None
    is_verified: bool = False
    commission_rate: float
    mobile_money_operator: str = ""
    mobile_money_phone: str = ""
    rating_avg: float = 0
    rating_count: int = 0


class TripWrite(Stripped):
    origin: str = Field(min_length=2, max_length=80)
    destination: str = Field(min_length=2, max_length=80)
    origin_stop: str = Field(default="", max_length=120)
    destination_stop: str = Field(default="", max_length=120)
    stops: list[str] = []
    departure_at: datetime
    arrival_at: datetime
    price: float = Field(gt=0, le=100000)
    bus_id: Optional[int] = None
    seats_total: Optional[int] = Field(default=None, ge=1, le=80)
    bus_type: str = "standard"
    amenities: list[str] = []
    luggage_note: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=1000)
    border_crossing: bool = False

    @field_validator("bus_type")
    @classmethod
    def _bus(cls, v):
        if v not in BUS_TYPES:
            raise ValueError("Type de bus inconnu.")
        return v

    @model_validator(mode="after")
    def _times(self):
        if self.bus_id is None and self.seats_total is None:
            raise ValueError("Choisissez un bus ou indiquez le nombre de sièges.")
        if self.origin.strip().lower() == self.destination.strip().lower():
            raise ValueError("Le départ et l'arrivée doivent être différents.")
        if self.arrival_at <= self.departure_at:
            raise ValueError("L'arrivée doit être après le départ.")
        return self


class TripOwnerRead(TripCard):
    stops: list[str] = []
    luggage_note: str = ""
    notes: str = ""
    status: str
    cancel_reason: Optional[str] = None
    booked_seats: int = 0
    revenue: float = 0
    boarded: int = 0


class BoardingRequest(Stripped):
    ticket_code: str
    undo: bool = False


class BoardingResult(BaseModel):
    ok: bool = True
    passenger: PassengerRead
    booking_code: str
    trip_id: int
    seat_number: int
    already: bool = False


class ManifestRead(BaseModel):
    trip: TripOwnerRead
    passengers: list[dict]


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
    amount: float
    operator: str = ""
    phone: str = ""
    status: str
    admin_note: Optional[str] = None
    operator_name: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None


class ReplyRequest(Stripped):
    reply: str = Field(min_length=2, max_length=1000)


class OperatorOverview(BaseModel):
    wallet: WalletRead
    trips_upcoming: int
    bookings_today: int
    seats_sold_upcoming: int
    next_trips: list[TripOwnerRead] = []


# --- Admin ---------------------------------------------------------------------

class AdminOverview(BaseModel):
    gmv: float
    commission: float
    escrow_held: float
    bookings: int
    operators_pending: int
    operators_active: int
    trips_upcoming: int
    disputes_open: int
    payouts_pending: int
    by_status: dict[str, int] = {}


class AdminOperatorRead(OperatorOwnerRead):
    email: Optional[str] = None
    trips_count: int = 0
    bookings_count: int = 0


class AdminOperatorUpdate(Stripped):
    status: Optional[str] = None
    reason: str = ""
    is_verified: Optional[bool] = None
    commission_rate: Optional[float] = Field(default=None, ge=0, le=60)
    clear_commission: bool = False


class AdminTripRead(TripOwnerRead):
    pass


class ResolveRequest(Stripped):
    action: str
    refund_amount: Optional[float] = Field(default=None, ge=0)
    note: str = Field(default="", max_length=1000)


class PayoutUpdate(Stripped):
    status: str
    admin_note: str = ""


class SettingsWrite(BaseModel):
    values: dict[str, str]
