"""Module Bus (Lukondo) — structure minimale, à enrichir."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_partner
from app.lukondo.models import BusTicket, BusTrip
from app.lukondo.schemas import BusTicketCreate, BusTicketRead
from app.lukondo.utils import generate_reference_code
from app.models import ActivityCategory, PartnerActivity, PartnerApplication

router = APIRouter(prefix="/api/v1/lukondo/bus", tags=["lukondo-bus"])


@router.get("/trips/{trip_id}/tickets", response_model=List[BusTicketRead])
def list_tickets(
    trip_id: int,
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    trip = session.get(BusTrip, trip_id)
    if not trip or trip.partner_application_id != partner.id:
        raise HTTPException(status_code=404, detail="Trajet introuvable.")
    return session.exec(select(BusTicket).where(BusTicket.trip_id == trip_id)).all()


@router.post("/tickets", response_model=BusTicketRead, status_code=status.HTTP_201_CREATED)
def sell_ticket(
    payload: BusTicketCreate,
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    trip = session.get(BusTrip, payload.trip_id)
    if not trip or trip.partner_application_id != partner.id:
        raise HTTPException(status_code=404, detail="Trajet introuvable.")

    sold = session.exec(select(BusTicket).where(BusTicket.trip_id == trip.id)).all()
    if len(sold) >= trip.seat_count:
        raise HTTPException(status_code=409, detail="Ce trajet est complet.")
    if any(t.seat_number == payload.seat_number for t in sold):
        raise HTTPException(status_code=409, detail="Ce siège est déjà pris.")

    ticket = BusTicket(
        trip_id=trip.id,
        reference_code=generate_reference_code("BUS"),
        passenger_name=payload.passenger_name,
        seat_number=payload.seat_number,
        client_generated_id=payload.client_generated_id,
    )
    session.add(ticket)
    session.flush()

    session.add(
        PartnerActivity(
            partner_application_id=partner.id,
            category=ActivityCategory.ticket,
            label=f"Ticket {ticket.reference_code} vendu",
            detail=f"{payload.passenger_name} — {trip.origin} → {trip.destination}",
        )
    )
    session.commit()
    session.refresh(ticket)
    return ticket
