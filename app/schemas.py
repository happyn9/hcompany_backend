from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.models import AccountStatus, ActivityCategory, AppStatus, ContractStatus, OfferStatus, OTPChannel, OTPPurpose, PartnerStatus, PaymentMode


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
    # Rempli uniquement pour les clients mobile/desktop (voir en-tête
    # X-Client-Type dans routers/auth.py) — les clients web utilisent le
    # cookie httpOnly à la place, jamais ce champ.
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
