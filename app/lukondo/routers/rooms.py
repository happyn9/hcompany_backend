"""Module Hôtel (Lukondo) — structure minimale, à enrichir."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_partner
from app.lukondo.models import Room, RoomBooking, RoomStatus
from app.lukondo.schemas import RoomRead, RoomBookingCreate
from app.models import ActivityCategory, PartnerActivity, PartnerApplication

router = APIRouter(prefix="/api/v1/lukondo/rooms", tags=["lukondo-rooms"])


@router.get("", response_model=List[RoomRead])
def list_rooms(
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    return session.exec(
        select(Room).where(Room.partner_application_id == partner.id)
    ).all()


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: RoomBookingCreate,
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    room = session.exec(
        select(Room).where(
            Room.id == payload.room_id,
            Room.partner_application_id == partner.id,
        )
    ).first()
    if not room:
        raise HTTPException(status_code=404, detail="Chambre introuvable.")
    if room.status == RoomStatus.occupied:
        raise HTTPException(status_code=409, detail="Cette chambre est déjà occupée.")

    booking = RoomBooking(
        room_id=room.id,
        guest_name=payload.guest_name,
        check_in=payload.check_in,
        check_out=payload.check_out,
        client_generated_id=payload.client_generated_id,
    )
    room.status = RoomStatus.occupied
    session.add(booking)
    session.add(room)
    session.flush()

    session.add(
        PartnerActivity(
            partner_application_id=partner.id,
            category=ActivityCategory.booking,
            label=f"Réservation — {room.label}",
            detail=f"{payload.guest_name}",
        )
    )
    session.commit()
    session.refresh(booking)
    return booking
