"""Module Colis (Lukondo) — structure minimale, prête à enrichir.

Chaque endpoint est scopé au partenaire connecté (son PartnerApplication
approuvée) : un partenaire ne voit jamais les colis d'un autre partenaire.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_partner
from app.lukondo.models import Parcel
from app.lukondo.schemas import ParcelCreate, ParcelRead, ParcelStatusUpdate
from app.lukondo.utils import generate_reference_code
from app.models import ActivityCategory, PartnerActivity, PartnerApplication

router = APIRouter(prefix="/api/v1/lukondo/parcels", tags=["lukondo-parcels"])


@router.post("", response_model=ParcelRead, status_code=status.HTTP_201_CREATED)
def create_parcel(
    payload: ParcelCreate,
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    # Évite les doublons si le desktop renvoie deux fois la même création
    # (retry après coupure réseau, cf. logique offline de l'app Flutter).
    if payload.client_generated_id:
        existing = session.exec(
            select(Parcel).where(Parcel.client_generated_id == payload.client_generated_id)
        ).first()
        if existing:
            return existing

    parcel = Parcel(
        reference_code=generate_reference_code(),
        partner_application_id=partner.id,
        sender_name=payload.sender_name,
        recipient_name=payload.recipient_name,
        recipient_phone=payload.recipient_phone,
        client_generated_id=payload.client_generated_id,
    )
    session.add(parcel)
    session.flush()

    session.add(
        PartnerActivity(
            partner_application_id=partner.id,
            category=ActivityCategory.parcel,
            label=f"Colis {parcel.reference_code} enregistré",
            detail=f"{payload.sender_name} → {payload.recipient_name}",
        )
    )
    session.commit()
    session.refresh(parcel)
    return parcel


@router.get("", response_model=List[ParcelRead])
def list_parcels(
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    return session.exec(
        select(Parcel).where(Parcel.partner_application_id == partner.id)
    ).all()


@router.get("/{reference_code}", response_model=ParcelRead)
def get_parcel(
    reference_code: str,
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    parcel = session.exec(
        select(Parcel).where(
            Parcel.reference_code == reference_code,
            Parcel.partner_application_id == partner.id,
        )
    ).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Colis introuvable.")
    return parcel


@router.patch("/{reference_code}/status", response_model=ParcelRead)
def update_parcel_status(
    reference_code: str,
    payload: ParcelStatusUpdate,
    session: Session = Depends(get_session),
    partner: PartnerApplication = Depends(get_current_partner),
):
    parcel = session.exec(
        select(Parcel).where(
            Parcel.reference_code == reference_code,
            Parcel.partner_application_id == partner.id,
        )
    ).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Colis introuvable.")
    parcel.status = payload.status
    session.add(parcel)
    session.commit()
    session.refresh(parcel)
    # TODO: déclencher la notification WhatsApp/email au destinataire ici
    # (voir app/services/notifications.py) une fois le module câblé en entier.
    return parcel
