"""Pays, taux de change et bénéficiaires : la base des services transfrontaliers.

Quatre « pays » distincts par commande : où vit le client, où le service est rendu,
dans quelle devise le partenaire est payé, dans quelle devise le client paie.
"""
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Country(SQLModel, table=True):
    code: str = Field(primary_key=True, max_length=2)  # ISO 3166-1 alpha-2 : ZM, CD, FR…
    name_fr: str
    name_en: str = ""
    currency: str = "USD"  # ISO 4217 : ZMW, CDF, USD, EUR…
    dial_code: str = ""  # sans « + » : 260, 243…
    timezone: str = "UTC"
    is_active: bool = True  # le pays est proposé dans les sélecteurs
    is_service_country: bool = False  # des partenaires y rendent des services
    sort_order: int = 0


class FxRate(SQLModel, table=True):
    """Taux par rapport au dollar (pivot) : 1 USD = `per_usd` unités de la devise."""
    currency: str = Field(primary_key=True, max_length=3)
    per_usd: float = 1.0
    margin_pct: float = 0  # marge H-Company ajoutée quand on convertit VERS cette devise
    source: str = "seed"  # seed = valeur par défaut à vérifier | admin
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[int] = Field(default=None, foreign_key="user.id")


class Beneficiary(SQLModel, table=True):
    """« Je commande pour quelqu'un d'autre » : la personne qui recevra le billet,
    le colis ou le service, éventuellement dans un autre pays."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # l'acheteur
    service: str = Field(index=True)  # shop | lodge | resto | tourism | transport | parcel
    ref: str = Field(index=True)  # code de la commande / réservation
    name: str
    phone: str  # format international, chiffres uniquement
    country_code: str = "ZM"
    message: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
