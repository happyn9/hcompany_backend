from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


# --- Enums ---

class UserRole(str, Enum):
    admin = "admin"
    partner = "partner"
    client = "client"


class AccountStatus(str, Enum):
    active = "active"
    disabled = "disabled"  # désactivé par l'admin (ex: abonnement expiré)
    blocked = "blocked"    # bloqué par l'admin (ex: abus, litige)


class PartnerStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ContractStatus(str, Enum):
    awaiting_signature = "awaiting_signature"
    signed = "signed"


class OTPPurpose(str, Enum):
    register = "register"
    login = "login"
    reset_password = "reset_password"


class OTPChannel(str, Enum):
    email = "email"
    whatsapp = "whatsapp"


# --- Utilisateurs ---

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    phone: Optional[str] = Field(default=None, index=True)
    # Le mot de passe vit désormais dans le service d'authentification
    # commune (voir auth/) — ce champ n'est plus utilisé pour vérifier une
    # connexion, gardé nullable pour ne pas casser les lignes déjà en base.
    hashed_password: Optional[str] = None
    # Lien vers le compte central (auth/) — c'est ce `uid`-là qui identifie
    # réellement la personne à travers les trois applications. `id` reste
    # l'identifiant local utilisé par toutes les clés étrangères de cette
    # base (PartnerApplication.user_id, etc.), inchangé pour ne pas
    # perturber les données déjà en place.
    auth_uid: Optional[int] = Field(default=None, unique=True, index=True)
    full_name: Optional[str] = None
    role: UserRole = Field(default=UserRole.client)
    is_verified: bool = Field(default=False)
    is_active: bool = Field(default=True)
    # --- Spécifique aux comptes partenaires ---
    account_status: AccountStatus = Field(default=AccountStatus.active)
    partner_code: Optional[str] = Field(default=None, unique=True, index=True)
    trial_ends_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Codes OTP (email ou WhatsApp) ---

class OTPCode(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    identifier: str = Field(index=True)  # email ou numéro de téléphone
    channel: OTPChannel
    purpose: OTPPurpose
    hashed_code: str
    attempts: int = Field(default=0)
    consumed: bool = Field(default=False)
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Partenaires ---

class PartnerApplication(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company: str
    contact_name: str
    email: str
    category: str
    message: Optional[str] = None
    status: PartnerStatus = Field(default=PartnerStatus.pending)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None


class PaymentMode(str, Enum):
    monthly = "monthly"
    quarterly = "quarterly"
    annual = "annual"
    one_time = "one_time"


class OfferStatus(str, Enum):
    proposed = "proposed"
    accepted = "accepted"
    declined = "declined"


class Offer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    title: str  # ex: "Starter", "Pro", "Sur mesure"
    price: float
    duration_months: int
    payment_mode: PaymentMode = Field(default=PaymentMode.monthly)
    description: Optional[str] = None
    status: OfferStatus = Field(default=OfferStatus.proposed)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Contract(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    content: str  # texte du contrat (peut être du markdown/HTML simple)
    status: ContractStatus = Field(default=ContractStatus.awaiting_signature)
    duration_months: Optional[int] = None
    payment_mode: Optional[PaymentMode] = None
    offer_id: Optional[int] = Field(default=None, foreign_key="offer.id")
    signed_by_name: Optional[str] = None
    signed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PaymentMethod(str, Enum):
    card = "card"
    airtel_money = "airtel_money"
    mtn_momo = "mtn_momo"


class PaymentStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


class Payment(SQLModel, table=True):
    """Paiement d'une offre par un partenaire. Aucun vrai processeur de
    paiement n'est branché (pas de vraies clés API Stripe/Airtel/MTN
    disponibles) — ce modèle simule le flux pour que l'expérience et
    l'interface soient prêtes à recevoir une vraie intégration plus tard."""
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    offer_id: int = Field(foreign_key="offer.id")
    amount: float
    method: PaymentMethod
    status: PaymentStatus = Field(default=PaymentStatus.pending)
    phone_number: Optional[str] = None  # pour Airtel Money / MTN MoMo
    reference: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class AppStatus(str, Enum):
    requested = "requested"  # demandée par le partenaire, en attente d'admin
    active = "active"
    suspended = "suspended"
    rejected = "rejected"


class PartnerApp(SQLModel, table=True):
    """Un service/module concret qu'un partenaire exploite sur le réseau
    (ex: module Colis pour Lukondo, un site vitrine, etc.). Un partenaire
    peut en avoir plusieurs, chacune avec ses propres revenus."""
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    name: str
    description: Optional[str] = None
    status: AppStatus = Field(default=AppStatus.requested)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    activated_at: Optional[datetime] = None


class RevenueEntry(SQLModel, table=True):
    """Une ligne de revenu générée par une app partenaire, avec la
    commission correspondante due à H-Company (sauf si le partenaire est
    couvert par un abonnement — voir Contract.status == signed)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_app_id: int = Field(foreign_key="partnerapp.id")
    amount: float  # revenu généré par le partenaire sur cette transaction
    commission_amount: float  # part due à H-Company
    description: Optional[str] = None
    paid: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ActivityCategory(str, Enum):
    contract = "contract"
    parcel = "parcel"
    booking = "booking"
    ticket = "ticket"
    system = "system"


class PartnerActivity(SQLModel, table=True):
    """Journal d'activité affiché dans le dashboard partenaire.
    Alimenté plus tard par les modules Lukondo (colis, hôtel, bus) ou
    manuellement par l'équipe H-Company en attendant."""
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id")
    category: ActivityCategory = Field(default=ActivityCategory.system)
    label: str
    detail: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Apprentissage (H-Learning) ---

class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    level: str
    description: str


# --- Produits / marketplace ---

class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    category: str
    description: str
    partner_name: Optional[str] = None


class UserProfile(SQLModel, table=True):
    """Rempli lors de l'onboarding après la première connexion. Sert à
    personnaliser les suggestions affichées (pas de ML, juste des règles
    simples basées sur ces réponses)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True)
    company_size: Optional[str] = None  # "solo" | "small" | "medium" | "large"
    primary_interest: Optional[str] = None  # ex: "Cybersécurité", "Formation"...
    referral_source: Optional[str] = None
    completed_at: datetime = Field(default_factory=datetime.utcnow)


class NotificationChannel(str, Enum):
    in_app = "in_app"  # visible dans le site ou l'app, jamais poussée
    push = "push"       # aussi envoyée en notification push (mobile/desktop)


class Notification(SQLModel, table=True):
    """Notification destinée à un utilisateur — lue depuis le site comme
    depuis la future app mobile/desktop, puisque les deux partagent ce
    même backend et donc les mêmes données."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str
    body: str
    channel: NotificationChannel = Field(default=NotificationChannel.in_app)
    read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Contact ---

class ContactStatus(str, Enum):
    new = "new"
    answered = "answered"


class ContactMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str
    message: str
    status: ContactStatus = Field(default=ContactStatus.new)
    admin_reply: Optional[str] = None
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
