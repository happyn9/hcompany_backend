"""Pays et taux de change — administration."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.crossborder import services as svc
from app.crossborder.models import Country, FxRate
from app.crossborder.routers.public import country_read
from app.database import get_session
from app.admin_security import require_admin_confirmed
from app.deps import get_current_admin
from app.models import User

router = APIRouter(prefix="/api/v1/geo/admin", tags=["geo-admin"])


class CountryIn(BaseModel):
    name_fr: str = Field(min_length=2, max_length=80)
    name_en: str = Field(default="", max_length=80)
    currency: str = Field(min_length=3, max_length=3)
    dial_code: str = Field(default="", max_length=4, pattern=r"^\d*$")
    timezone: str = Field(default="UTC", max_length=40)
    is_active: bool = True
    is_service_country: bool = False
    sort_order: int = 0


class RateIn(BaseModel):
    per_usd: float = Field(gt=0, le=10_000_000)
    margin_pct: float = Field(default=0, ge=0, le=30)


@router.get("/overview")
def overview(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    svc.ensure_seed(session)
    countries = session.exec(select(Country).order_by(Country.sort_order, Country.name_fr)).all()
    rates = session.exec(select(FxRate).order_by(FxRate.currency)).all()
    return {
        "countries": [{**country_read(c), "is_active": c.is_active, "sort_order": c.sort_order} for c in countries],
        "rates": [{"currency": r.currency, "per_usd": r.per_usd, "margin_pct": r.margin_pct, "source": r.source, "updated_at": r.updated_at.isoformat()} for r in rates],
    }


@router.put("/countries/{code}")
def upsert_country(code: str, payload: CountryIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    code = code.upper()
    if len(code) != 2 or not code.isalpha():
        raise HTTPException(status_code=422, detail="Code pays ISO à 2 lettres.")
    cur = payload.currency.upper()
    svc.rate_of(session, cur)  # la devise doit avoir un taux
    row = session.get(Country, code) or Country(code=code, name_fr=payload.name_fr)
    for k, v in payload.model_dump().items():
        setattr(row, k, cur if k == "currency" else v)
    session.add(row)
    session.commit()
    return country_read(row)


@router.put("/rates/{currency}")
def set_rate(currency: str, payload: RateIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    currency = currency.upper()
    if len(currency) != 3 or not currency.isalpha():
        raise HTTPException(status_code=422, detail="Code devise ISO à 3 lettres.")
    if currency == "USD" and payload.per_usd != 1:
        raise HTTPException(status_code=422, detail="Le dollar est la devise pivot (1 USD = 1).")
    row = session.get(FxRate, currency) or FxRate(currency=currency)
    row.per_usd, row.margin_pct, row.source, row.updated_at, row.updated_by = payload.per_usd, payload.margin_pct, "admin", datetime.utcnow(), admin.id
    session.add(row)
    session.commit()
    return {"currency": row.currency, "per_usd": row.per_usd, "margin_pct": row.margin_pct, "source": row.source}
