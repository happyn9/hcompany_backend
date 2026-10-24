"""H-Transport — billetterie de bus : agences, départs, réservations avec
séquestre, passagers (billet QR), avis, retraits.

Les heures de départ sont des heures LOCALES (CAT, UTC+2) sans fuseau.
Les statuts sont des chaînes (pas d'enums Postgres)."""
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

BUS_TYPES = ("standard", "vip", "minibus", "coaster")
OPERATOR_STATUSES = ("pending", "approved", "rejected", "suspended")
TRIP_STATUSES = ("scheduled", "departed", "completed", "cancelled")
# pending_payment → confirmed (séquestre) → boarded → completed
BOOKING_STATUSES = (
    "pending_payment", "confirmed", "boarded", "completed",
    "expired", "cancelled_user", "cancelled_operator", "disputed",
)
# Statuts qui occupent des sièges.
SEAT_HOLD_STATUSES = ("pending_payment", "confirmed", "boarded", "completed", "disputed")


class TransportSetting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str = ""


class TransportOperator(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True, index=True)
    name: str = Field(index=True)
    description: str = ""
    city: str = ""
    phone: str = ""
    whatsapp: str = ""
    status: str = Field(default="pending", index=True)
    status_reason: Optional[str] = None
    is_verified: bool = False
    commission_rate: Optional[float] = None
    partner_application_id: Optional[int] = Field(default=None, foreign_key="partnerapplication.id")
    mobile_money_operator: str = ""
    mobile_money_phone: str = ""
    rating_avg: float = 0
    rating_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None


BUS_LAYOUTS = ("2+2", "2+1", "1+1")


class TransportBus(SQLModel, table=True):
    """Un bus de la flotte d'une agence : plaque, disposition des sièges, équipements."""
    id: Optional[int] = Field(default=None, primary_key=True)
    operator_id: int = Field(foreign_key="transportoperator.id", index=True)
    name: str
    plate: str = Field(index=True)
    bus_type: str = "standard"
    layout: str = "2+2"  # sièges par rangée : gauche+droite
    seats_total: int = 50
    amenities: str = ""
    color: str = "#c89a3d"  # couleur de carrosserie (vue 3D)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TransportTrip(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    operator_id: int = Field(foreign_key="transportoperator.id", index=True)
    bus_id: Optional[int] = Field(default=None, foreign_key="transportbus.id", index=True)
    origin: str = Field(index=True)
    destination: str = Field(index=True)
    origin_stop: str = ""
    destination_stop: str = ""
    stops: str = ""  # arrêts intermédiaires, séparés par des virgules
    departure_at: datetime = Field(index=True)
    arrival_at: datetime
    price: float
    seats_total: int = 50
    bus_type: str = "standard"
    amenities: str = ""
    luggage_note: str = ""
    notes: str = ""
    border_crossing: bool = False
    status: str = Field(default="scheduled", index=True)
    cancel_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TransportCheckout(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(index=True, unique=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    total: float = 0
    method: str = ""
    phone_number: str = ""
    provider_reference: Optional[str] = None
    simulated: bool = True
    status: str = "pending"
    failure_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None


class TransportBooking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # HT-XXXXXX
    trip_id: int = Field(foreign_key="transporttrip.id", index=True)
    operator_id: int = Field(foreign_key="transportoperator.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    checkout_id: Optional[int] = Field(default=None, foreign_key="transportcheckout.id", index=True)
    status: str = Field(default="pending_payment", index=True)
    seats: int = 1
    origin: str = ""
    destination: str = ""
    departure_at: datetime = Field(index=True)
    unit_price: float = 0
    total: float = 0
    commission_rate: float = 0
    commission_amount: float = 0
    operator_net: float = 0
    refund_amount: float = 0
    contact_name: str = ""
    contact_phone: str = ""
    escrow_status: str = "none"  # none | held | released | refunded
    escrow_released_at: Optional[datetime] = None
    dispute_reason: Optional[str] = None
    dispute_note: Optional[str] = None
    dispute_opened_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None


class TransportPassenger(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="transportbooking.id", index=True)
    trip_id: int = Field(foreign_key="transporttrip.id", index=True)
    name: str
    phone: str = ""
    document: str = ""
    seat_number: int
    ticket_code: str = Field(index=True, unique=True)  # T-XXXXXXXX
    boarded_at: Optional[datetime] = None


class TransportEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="transportbooking.id", index=True)
    status: str
    label: str
    note: str = ""
    actor: str = "system"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TransportReview(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    operator_id: int = Field(foreign_key="transportoperator.id", index=True)
    booking_id: int = Field(foreign_key="transportbooking.id", unique=True, index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    author_name: str = ""
    route: str = ""
    rating: int
    comment: str = ""
    reply: Optional[str] = None
    is_hidden: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TransportPayout(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(index=True, unique=True)
    operator_id: int = Field(foreign_key="transportoperator.id", index=True)
    amount: float
    operator: str = ""
    phone: str = ""
    status: str = Field(default="requested", index=True)
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None
