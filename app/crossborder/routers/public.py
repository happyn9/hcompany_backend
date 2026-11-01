"""Pays, taux et bénéficiaires — routes publiques et acheteur."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.crossborder import services as svc
from app.crossborder.models import Beneficiary, Country, FxRate
from app.database import get_session
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/v1/geo", tags=["geo"])

SERVICES = ("shop", "lodge", "resto", "tourism", "transport", "parcel")


def country_read(c: Country) -> dict:
    return {"code": c.code, "name_fr": c.name_fr, "name_en": c.name_en, "currency": c.currency, "dial_code": c.dial_code,
            "timezone": c.timezone, "is_service_country": c.is_service_country}


@router.get("/countries")
def countries(session: Session = Depends(get_session)):
    svc.ensure_seed(session)
    rows = session.exec(select(Country).where(Country.is_active == True).order_by(Country.sort_order, Country.name_fr)).all()  # noqa: E712
    return [country_read(c) for c in rows]


@router.get("/rates")
def rates(session: Session = Depends(get_session)):
    """Taux par rapport au dollar. Le site s'en sert pour afficher les prix dans la devise du visiteur."""
    svc.ensure_seed(session)
    rows = session.exec(select(FxRate)).all()
    return {"base": "USD", "rates": {r.currency: {"per_usd": r.per_usd, "margin_pct": r.margin_pct} for r in rows},
            "reviewed": all(r.source != "seed" for r in rows if r.currency != "USD")}


@router.get("/convert")
def convert(amount: float = Query(ge=0), source: str = Query(alias="from", min_length=3, max_length=3),
            target: str = Query(alias="to", min_length=3, max_length=3), session: Session = Depends(get_session)):
    return {"amount": svc.convert(session, amount, source, target), "from": source.upper(), "to": target.upper()}


class BeneficiaryIn(BaseModel):
    service: str
    ref: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=24)
    country_code: str = Field(default="ZM", min_length=2, max_length=2)
    message: str = Field(default="", max_length=300)


def _read(b: Beneficiary) -> dict:
    return {"id": b.id, "service": b.service, "ref": b.ref, "name": b.name, "phone": b.phone, "country_code": b.country_code,
            "message": b.message, "created_at": b.created_at.isoformat()}


@router.post("/beneficiaries", status_code=201)
def add_beneficiary(payload: BeneficiaryIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if payload.service not in SERVICES:
        raise HTTPException(status_code=422, detail="Service inconnu.")
    code = payload.country_code.upper()
    if session.get(Country, code) is None:
        raise HTTPException(status_code=422, detail="Pays inconnu.")
    existing = session.exec(select(Beneficiary).where(Beneficiary.user_id == user.id, Beneficiary.service == payload.service, Beneficiary.ref == payload.ref)).first()
    row = existing or Beneficiary(user_id=user.id, service=payload.service, ref=payload.ref, name="", phone="")
    row.name, row.phone, row.country_code, row.message = payload.name.strip(), svc.clean_phone(payload.phone), code, payload.message.strip()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read(row)


@router.get("/beneficiaries")
def my_beneficiaries(service: Optional[str] = None, ref: Optional[str] = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    q = select(Beneficiary).where(Beneficiary.user_id == user.id)
    if service:
        q = q.where(Beneficiary.service == service)
    if ref:
        q = q.where(Beneficiary.ref == ref)
    return [_read(b) for b in session.exec(q.order_by(Beneficiary.created_at.desc())).all()]
