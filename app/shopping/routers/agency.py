"""H-Shopping — côté agence partenaire : colis à réceptionner, remise au
client. L'agence travaille avec son compte partenaire existant."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_partner
from app.lukondo.models import Parcel, ParcelStatus
from app.models import PartnerApplication
from app.shopping import schemas as S
from app.shopping import views
from app.shopping.models import ShopAgency, ShopOrder
from app.shopping.services import apply_parcel_status

router = APIRouter(prefix="/api/v1/shopping/agency", tags=["shopping-agency"])


def _my_agency(session: Session, partner: PartnerApplication) -> ShopAgency:
    agency = session.exec(select(ShopAgency).where(ShopAgency.partner_application_id == partner.id)).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Votre agence n'est pas encore inscrite comme point H-Shopping. Contactez H-Company.")
    return agency


@router.get("/me", response_model=S.AgencyRead)
def me(session: Session = Depends(get_session), partner: PartnerApplication = Depends(get_current_partner)):
    return views.agency_read(_my_agency(session, partner))


@router.get("/orders", response_model=list[S.OrderRead])
def orders(session: Session = Depends(get_session), partner: PartnerApplication = Depends(get_current_partner)):
    agency = _my_agency(session, partner)
    rows = session.exec(
        select(ShopOrder).where(ShopOrder.agency_id == agency.id, ShopOrder.parcel_id != None,  # noqa: E711
                                ShopOrder.status.in_(("shipped", "delivered", "completed", "disputed")))
        .order_by(ShopOrder.created_at.desc()).limit(200)
    ).all()
    return [views.order_read(session, o, viewer="seller") for o in rows]


@router.post("/orders/{code}/status", response_model=S.OrderRead)
def update_status(code: str, payload: S.AgencyStatusUpdate, session: Session = Depends(get_session),
                  partner: PartnerApplication = Depends(get_current_partner)):
    agency = _my_agency(session, partner)
    o = session.exec(select(ShopOrder).where((ShopOrder.code == code.upper()) | (ShopOrder.tracking_code == code.upper()), ShopOrder.agency_id == agency.id)).first()
    if not o or not o.parcel_id:
        raise HTTPException(status_code=404, detail="Colis introuvable pour votre agence.")
    try:
        new = ParcelStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=422, detail="Statut invalide.")
    parcel = session.get(Parcel, o.parcel_id)
    parcel.status = new
    from datetime import datetime
    parcel.updated_at = datetime.utcnow()
    session.add(parcel)
    apply_parcel_status(session, o, new.value, actor="agency", note=payload.note)
    session.commit()
    return views.order_read(session, o, viewer="seller")
