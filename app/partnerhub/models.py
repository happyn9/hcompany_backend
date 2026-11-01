"""Le dashboard partenaire unique : plan, fonctions payantes, marque, invitations."""
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class PartnerPlan(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    plan: str = "standard"  # standard (2 apps) | pro (illimité + fonctions payantes incluses)
    pro_until: Optional[datetime] = None  # vide = pas de date de fin
    upgrade_requested_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PartnerFeature(SQLModel, table=True):
    """Fonction payante débloquée à l'unité (promotion, marque…). `requested` = demandée,
    en attente de la confirmation du paiement par H-Company ; `active` = débloquée."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    key: str = Field(index=True)
    status: str = "requested"  # requested | active | off
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    unlocked_at: Optional[datetime] = None
    reference: str = ""  # référence du paiement saisie par l'admin


class PartnerBranding(SQLModel, table=True):
    """Le dashboard au nom de l'entreprise (fonction payante « marque »)."""
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    display_name: str = ""
    tagline: str = ""
    accent: str = ""  # #RRGGBB
    logo_url: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ApplicationInvite(SQLModel, table=True):
    """Lien « demande de partenariat » envoyé par e-mail. Seul le hash est stocké."""
    id: Optional[int] = Field(default=None, primary_key=True)
    token_hash: str = Field(index=True, unique=True)
    email: str = Field(index=True)
    note: str = ""
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    used_at: Optional[datetime] = None
