from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import (
    AccountStatus,
    ActivityCategory,
    AppStatus,
    ContractStatus,
    OfferStatus,
    OTPChannel,
    OTPPurpose,
    PartnerStatus,
    PaymentMode,
    SubscriptionStatus,
)


# --- Auth ---

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Le mot de passe doit contenir au moins 8 caractères.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class RefreshPayload(BaseModel):
    # Uniquement pour les clients mobile/desktop (voir _is_mobile_client) —
    # un client web n'envoie jamais ce champ, son jeton de rafraîchissement
    # vit dans un cookie httpOnly, pas accessible en JavaScript de toute façon.
    refresh_token: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Le nouveau mot de passe doit contenir au moins 8 caractères.")
        return v


class PasswordReset(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Le nouveau mot de passe doit contenir au moins 8 caractères.")
        return v


class UserRead(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    is_verified: bool

    class Config:
        from_attributes = True


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
    # Toujours rempli, web comme mobile/desktop — les navigateurs modernes
    # bloquent de plus en plus les cookies tiers entre domaines différents
    # (constaté en production avec Vercel + Render), le corps JSON est
    # devenu la source fiable pour tous les clients, pas seulement mobile.
    refresh_token: Optional[str] = None


# --- OTP ---

class OTPRequest(BaseModel):
    identifier: str  # email ou numéro de téléphone
    channel: OTPChannel
    purpose: OTPPurpose = OTPPurpose.login


class OTPVerify(BaseModel):
    identifier: str
    channel: OTPChannel
    purpose: OTPPurpose = OTPPurpose.login
    code: str


# --- Partenaires ---

class PartnerApplicationCreate(BaseModel):
    company: str
    contactName: str
    category: str
    message: Optional[str] = None


class PartnerApplicationRead(BaseModel):
    id: int
    company: str
    contact_name: str
    email: EmailStr
    category: str
    message: Optional[str] = None
    status: PartnerStatus
    created_at: datetime

    class Config:
        from_attributes = True


class PartnerStatusUpdate(BaseModel):
    status: PartnerStatus


class AccountStatusUpdate(BaseModel):
    status: AccountStatus


class AccountStatusRead(BaseModel):
    account_status: AccountStatus
    partner_code: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    trial_days_left: Optional[int] = None
    # Ajoutés pour l'espace "Gérer mon compte" — évite un second aller-retour
    # réseau juste pour afficher l'identité du compte.
    email: Optional[str] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    member_since: Optional[datetime] = None


class ContractRead(BaseModel):
    id: int
    content: str
    status: ContractStatus
    duration_months: Optional[int] = None
    payment_mode: Optional[PaymentMode] = None
    signed_by_name: Optional[str] = None
    signed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ContractSign(BaseModel):
    signed_by_name: str


class ContractUpdate(BaseModel):
    content: str


class OfferCreate(BaseModel):
    title: str
    price: float
    duration_months: int
    payment_mode: PaymentMode = PaymentMode.monthly
    description: Optional[str] = None


class OfferRead(BaseModel):
    id: int
    title: str
    price: float
    duration_months: int
    payment_mode: PaymentMode
    description: Optional[str] = None
    status: OfferStatus
    created_at: datetime

    class Config:
        from_attributes = True


class PartnerActivityRead(BaseModel):
    id: int
    category: ActivityCategory
    label: str
    detail: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityCategoryCount(BaseModel):
    category: ActivityCategory
    count: int


class PartnerStats(BaseModel):
    application_status: PartnerStatus
    contract_status: Optional[ContractStatus] = None
    partner_since: Optional[datetime] = None  # date d'approbation
    total_activities: int
    activities_by_category: list[ActivityCategoryCount]
    activities_last_30_days: int


# --- Apprentissage ---

class CourseRead(BaseModel):
    id: int
    title: str
    level: str
    description: str

    class Config:
        from_attributes = True


# Prix mensuel par employé selon la formule choisie — même grille que celle
# affichée sur la page "Formation d'équipe" (teamTraining.plan*Price côté
# frontend). Recalculé ici pour ne jamais faire confiance à un total envoyé
# par le client.
TRAINING_PLAN_PRICES = {"1": 300.0, "6": 250.0, "12": 200.0}


class CompanyTrainingRequestCreate(BaseModel):
    company: str
    contact_name: str
    contact_email: EmailStr
    employee_count: int = Field(gt=0)
    domains: list[str] = []
    plan: str
    message: Optional[str] = None


class CompanyTrainingRequestRead(BaseModel):
    id: int
    company: str
    contact_name: str
    contact_email: str
    employee_count: int
    domains: str
    plan: str
    monthly_price_per_employee: float
    estimated_total: float
    message: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class CompanyTrainingRequestStatusUpdate(BaseModel):
    status: str


# --- Produits ---

class ProductRead(BaseModel):
    id: int
    name: str
    category: str
    description: str
    partner_name: Optional[str] = None

    class Config:
        from_attributes = True


# --- Contact ---

class ContactCreate(BaseModel):
    name: str
    email: EmailStr
    message: str


class ContactRead(BaseModel):
    id: int
    name: str
    email: EmailStr
    message: str
    status: str
    admin_reply: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ContactAdminReply(BaseModel):
    admin_reply: str


# --- Onboarding ---

class OnboardingSubmit(BaseModel):
    company_size: Optional[str] = None
    primary_interest: Optional[str] = None
    referral_source: Optional[str] = None


class OnboardingSuggestion(BaseModel):
    title: str
    description: str
    cta_label: str
    cta_href: str


class OnboardingRead(BaseModel):
    completed: bool
    company_size: Optional[str] = None
    primary_interest: Optional[str] = None
    suggestions: list[OnboardingSuggestion] = []


# --- Apps partenaire & revenus ---

class PartnerAppCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PartnerAppStatusUpdate(BaseModel):
    status: AppStatus


class RevenueEntryCreate(BaseModel):
    amount: float
    commission_amount: float
    description: Optional[str] = None


class RevenueEntryRead(BaseModel):
    id: int
    amount: float
    commission_amount: float
    description: Optional[str] = None
    paid: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PartnerAppRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    status: AppStatus
    created_at: datetime
    activated_at: Optional[datetime] = None
    total_revenue: float = 0
    total_owed: float = 0

    class Config:
        from_attributes = True


class BillingSummary(BaseModel):
    subscribed: bool
    plan_name: Optional[str] = None
    total_revenue: float
    total_owed: float
    apps_count: int
    active_apps_count: int


# --- Catalogue des services H-Company (gérable depuis l'admin) ---

class ServiceCatalogItemCreate(BaseModel):
    key: str
    label_fr: str
    label_en: str
    description_fr: str = ""
    description_en: str = ""
    disabled: bool = False
    sort_order: int = 0


class ServiceCatalogItemUpdate(BaseModel):
    label_fr: Optional[str] = None
    label_en: Optional[str] = None
    description_fr: Optional[str] = None
    description_en: Optional[str] = None
    disabled: Optional[bool] = None
    sort_order: Optional[int] = None


class ServiceCatalogItemRead(BaseModel):
    id: int
    key: str
    label_fr: str
    label_en: str
    description_fr: str = ""
    description_en: str = ""
    logo_url: Optional[str] = None
    disabled: bool
    sort_order: int

    class Config:
        from_attributes = True


# --- Abonnements clients aux services H-Company ---

class ServiceSubscriptionCreate(BaseModel):
    service_key: str
    message: Optional[str] = None


class ServiceSubscriptionStatusUpdate(BaseModel):
    status: SubscriptionStatus
    admin_note: Optional[str] = None


class ServiceSubscriptionRead(BaseModel):
    id: int
    service_key: str
    message: Optional[str] = None
    status: SubscriptionStatus
    admin_note: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ServiceSubscriptionAdminRead(ServiceSubscriptionRead):
    user_id: int
    user_full_name: Optional[str] = None
    user_email: Optional[str] = None


class MyServicesSummary(BaseModel):
    active_count: int
    total_count: int
    subscriptions: list[ServiceSubscriptionRead] = []


# --- Notifications (in-app + push) ---

class NotificationRead(BaseModel):
    id: int
    title: str
    body: str
    channel: str
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AdminSendNotification(BaseModel):
    user_id: int
    title: str
    body: str
    also_email: bool = False


class UserLookupRead(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


# --- Paiement d'une offre (simulé — pas de vrai processeur branché) ---

class PaymentCreate(BaseModel):
    offer_id: int
    method: str  # "card" | "airtel_money" | "mtn_momo"
    phone_number: Optional[str] = None  # requis pour airtel_money / mtn_momo


class PaymentRead(BaseModel):
    id: int
    offer_id: int
    amount: float
    method: str
    status: str
    phone_number: Optional[str] = None
    reference: str
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
