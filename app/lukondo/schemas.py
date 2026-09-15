from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.lukondo.models import ParcelStatus, RoomStatus, BusTicketStatus


class ParcelCreate(BaseModel):
    sender_name: str
    recipient_name: str
    recipient_phone: str
    client_generated_id: Optional[str] = None


class ParcelRead(BaseModel):
    id: int
    reference_code: str
    sender_name: str
    recipient_name: str
    recipient_phone: str
    status: ParcelStatus
    created_at: datetime

    class Config:
        from_attributes = True


class ParcelStatusUpdate(BaseModel):
    status: ParcelStatus


class RoomRead(BaseModel):
    id: int
    label: str
    status: RoomStatus

    class Config:
        from_attributes = True


class RoomBookingCreate(BaseModel):
    room_id: int
    guest_name: str
    check_in: datetime
    check_out: datetime
    client_generated_id: Optional[str] = None


class BusTicketCreate(BaseModel):
    trip_id: int
    passenger_name: str
    seat_number: int
    client_generated_id: Optional[str] = None


class BusTicketRead(BaseModel):
    id: int
    reference_code: str
    passenger_name: str
    seat_number: int
    status: BusTicketStatus

    class Config:
        from_attributes = True
