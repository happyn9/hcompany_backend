"""Espaces publicitaires : H-Company (services internes) et partenaires qui ont débloqué la fonction « promotion »."""
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Promo(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)  # vide = H-Company
    module: str = Field(default="internal", index=True)
    title: str
    body: str = ""
    image_url: str = ""
    cta_label: str = "Découvrir"
    link: str  # chemin interne (/shopping…) ou https://…
    theme: str = "coffee"  # coffee | gold | ink | cream — fond du visuel quand il n'y a pas d'image
    placement: str = Field(default="any", index=True)  # any | app_home | app_transport | app_colis | app_logement | app_money
    status: str = Field(default="pending", index=True)  # pending | active | paused | rejected | expired
    reject_reason: str = ""
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    impressions: int = 0
    clicks: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
