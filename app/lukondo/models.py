"""Modèles du futur module Lukondo (colis, chambres, tickets de bus).

Ce module partage la même base de données et le même système d'auth/OTP que
H-Company : un partenaire (ex. Lukondo Transport) est un `PartnerApplication`
approuvé, lié à un `User` de rôle `partner`. Ces modèles posent la structure
de données ; les routers correspondants (voir app/lukondo/routers/) exposent
des endpoints minimaux pour l'instant, à enrichir au fil du développement de
l'app Flutter (mobile + desktop).
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


class ParcelStatus(str, Enum):
    received = "received"
    in_transit = "in_transit"
    available = "available"
    picked_up = "picked_up"


class Parcel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reference_code: str = Field(index=True, unique=True)  # ex: HC-4821
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    sender_name: str
    recipient_name: str
    recipient_phone: str
    status: ParcelStatus = Field(default=ParcelStatus.received)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # champs de synchronisation offline (desktop agence) :
    client_generated_id: Optional[str] = Field(default=None, index=True)
    synced_at: Optional[datetime] = None


class RoomStatus(str, Enum):
    available = "available"
    occupied = "occupied"


class Room(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    label: str  # ex: "Chambre 12"
    status: RoomStatus = Field(default=RoomStatus.available)


class RoomBooking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id")
    guest_name: str
    check_in: datetime
    check_out: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    client_generated_id: Optional[str] = Field(default=None, index=True)
    synced_at: Optional[datetime] = None


class BusTicketStatus(str, Enum):
    reserved = "reserved"
    paid = "paid"
    used = "used"


class BusTrip(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    origin: str
    destination: str
    departure_at: datetime
    seat_count: int


class BusTicket(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    trip_id: int = Field(foreign_key="bustrip.id")
    reference_code: str = Field(index=True, unique=True)
    passenger_name: str
    seat_number: int
    status: BusTicketStatus = Field(default=BusTicketStatus.reserved)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    client_generated_id: Optional[str] = Field(default=None, index=True)
    synced_at: Optional[datetime] = None
