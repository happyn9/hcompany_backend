import secrets
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


def _generate_public_offer_id() -> str:
    """Identifiant public non séquentiel pour les URLs exposées à un
    partenaire (page de paiement) — même principe qu'un ID de profil
    Facebook (long nombre aléatoire, jamais un simple auto-incrément) :
    on ne peut pas deviner ou énumérer les offres d'un autre partenaire en
    changeant un chiffre dans l'URL."""
    return "".join(secrets.choice("0123456789") for _ in range(18))


# --- Enums ---

class UserRole(str, Enum):
    admin = "admin"
    # Rôle intermédiaire : analyse les candidatures partenaires (pièce
    # d'identité, cohérence des infos) et la maintenance courante, mais ne
    # décide jamais seul — il transmet sa recommandation à l'admin, qui
    # garde le dernier mot (voir AgentReviewStatus / admin_update_status).
    agent = "agent"
    partner = "partner"
    client = "client"


class AgentReviewStatus(str, Enum):
    pending = "pending"      # pas encore examinée par un agent
    forwarded = "forwarded"  # agent favorable → transmise à l'admin pour confirmation finale
    rejected = "rejected"    # agent défavorable → dossier clos, l'admin n'a plus à intervenir


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

    # --- Dossier KYC (formulaire unique de candidature) ---
    phone: Optional[str] = None
    address: Optional[str] = None
    # "national_id" | "voter_card" | "passport"
    id_document_type: Optional[str] = None
    id_document_number: Optional[str] = None
    # Chemin relatif dans le stockage PRIVÉ (jamais servi via /uploads) —
    # une pièce d'identité n'est accessible qu'à travers l'endpoint
    # authentifié agent/admin qui la diffuse après vérification du rôle.
    id_document_path: Optional[str] = None

    # --- Étape de revue par un agent, avant confirmation finale par l'admin ---
    agent_review_status: AgentReviewStatus = Field(default=AgentReviewStatus.pending)
    agent_review_note: Optional[str] = None
    agent_id: Optional[int] = Field(default=None, foreign_key="user.id")
    agent_reviewed_at: Optional[datetime] = None


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
    # Identifiant opaque utilisé dans l'URL publique /paiement/... — voir
    # _generate_public_offer_id ci-dessus. `id` reste la clé primaire
    # interne, jamais exposée dans une URL.
    public_id: str = Field(default_factory=_generate_public_offer_id, unique=True, index=True)
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


class TrainingRequestStatus(str, Enum):
    new = "new"
    contacted = "contacted"
    closed = "closed"


class CompanyTrainingRequest(SQLModel, table=True):
    """Demande d'une entreprise pour inscrire plusieurs de ses employés à
    une formation H-Learning (formulaire "Formation d'équipe"). Volontairement
    distinct de ContactMessage : les champs structurés (nombre d'employés,
    domaines, formule) permettent à l'admin de traiter la demande sans
    reparser un message libre, et `estimated_total` est calculé côté
    serveur pour ne jamais faire confiance à un montant envoyé par le
    client. Le paiement réel (facturation B2B) se négocie ensuite avec
    l'admin — ce n'est pas un montant prélevé automatiquement."""
    id: Optional[int] = Field(default=None, primary_key=True)
    company: str
    contact_name: str
    contact_email: str
    employee_count: int
    domains: str = ""  # domaines choisis, séparés par virgule
    plan: str  # "1" | "6" | "12" (mois)
    monthly_price_per_employee: float
    estimated_total: float
    message: Optional[str] = None
    status: TrainingRequestStatus = Field(default=TrainingRequestStatus.new)
    created_at: datetime = Field(default_factory=datetime.utcnow)


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


# --- Abonnements clients aux services H-Company ---
# (H-Transport, H-Restaurant, H-Learning, H-Money, H-Translate, H-Shopping...)
# Distinct de PartnerApp : ici c'est le CLIENT final qui demande à utiliser
# un service, pas un partenaire qui l'exploite sur la marketplace.

class SubscriptionStatus(str, Enum):
    requested = "requested"  # demandée par le client, en attente d'admin
    active = "active"
    suspended = "suspended"
    rejected = "rejected"


class ServiceCatalogItem(SQLModel, table=True):
    """Catalogue des services H-Company proposés aux clients (H-Transport,
    H-Restaurant, H-Learning...) — gérable depuis l'admin (libellés FR/EN,
    description, logo, activation, ordre d'affichage). Remplace l'ancien
    catalogue codé en dur dans routers/services.py. `key` est une chaîne
    libre (pas un enum fermé) pour que l'admin puisse ajouter de nouveaux
    services sans migration ; ServiceSubscription.service_key y fait
    référence de façon souple (même convention que partner_code sur User)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    label_fr: str
    label_en: str
    description_fr: str = ""
    description_en: str = ""
    # Chemin relatif servi en statique par le backend, ex:
    # "service-logos/h_restaurant.svg" — voir app/main.py pour le montage
    # StaticFiles et routers/services.py pour l'upload admin.
    logo_path: Optional[str] = None
    disabled: bool = Field(default=False)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ServiceSubscription(SQLModel, table=True):
    """Demande d'un utilisateur pour s'abonner à un service H-Company. Une
    fois approuvée par un admin, le service apparaît comme actif dans son
    tableau de bord."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # Référence souple à ServiceCatalogItem.key (chaîne libre, plus un enum
    # fermé) — voir ServiceCatalogItem ci-dessus.
    service_key: str = Field(index=True)
    message: Optional[str] = None
    status: SubscriptionStatus = Field(default=SubscriptionStatus.requested)
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None


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
