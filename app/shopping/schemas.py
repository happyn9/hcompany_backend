from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _clean(v: Optional[str]) -> str:
    return (v or "").strip()


# --- Catalogue public -------------------------------------------------------

class CategoryRead(BaseModel):
    id: int
    slug: str
    name_fr: str
    name_en: str
    icon: str
    parent_id: Optional[int] = None
    sort_order: int = 0
    product_count: int = 0

    model_config = {"from_attributes": True}


class ShopMini(BaseModel):
    id: int
    slug: str
    name: str
    logo: Optional[str] = None
    city: str = ""
    rating_avg: float = 0
    rating_count: int = 0


class ProductCard(BaseModel):
    id: int
    title: str
    price: float
    compare_at_price: Optional[float] = None
    discount_pct: int = 0
    image: Optional[str] = None
    shop: ShopMini
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    rating_avg: float = 0
    rating_count: int = 0
    sold_count: int = 0
    in_stock: bool = True
    has_variants: bool = False
    is_favorite: bool = False
    colors: list[dict] = []
    model3d: str = ""


class ProductPage(BaseModel):
    items: list[ProductCard]
    total: int
    page: int
    pages: int


class VariantRead(BaseModel):
    id: int
    label: str
    sku: str = ""
    price: float
    stock: int
    is_active: bool = True


class ReviewRead(BaseModel):
    id: int
    author_name: str
    rating: int
    comment: str
    seller_reply: Optional[str] = None
    created_at: datetime
    product_id: Optional[int] = None
    product_title: Optional[str] = None


class ProductDetail(BaseModel):
    id: int
    title: str
    description: str
    price: float
    compare_at_price: Optional[float] = None
    discount_pct: int = 0
    images: list[str] = []
    variants: list[VariantRead] = []
    stock: int = 0
    in_stock: bool = True
    brand: str = ""
    sku: str = ""
    weight_kg: float = 0
    attributes: list[dict] = []
    tags: list[str] = []
    colors: list[dict] = []
    model3d: str = ""
    category: Optional[CategoryRead] = None
    shop: ShopMini
    rating_avg: float = 0
    rating_count: int = 0
    sold_count: int = 0
    is_favorite: bool = False
    created_at: datetime
    status: str = "active"


class ShopPublic(BaseModel):
    id: int
    slug: str
    name: str
    tagline: str = ""
    description: str = ""
    logo: Optional[str] = None
    banner: Optional[str] = None
    city: str = ""
    address: str = ""
    phone: str = ""
    whatsapp: str = ""
    email: str = ""
    rating_avg: float = 0
    rating_count: int = 0
    product_count: int = 0
    sold_count: int = 0
    is_partner: bool = False
    is_featured: bool = False
    created_at: datetime


class AgencyRead(BaseModel):
    id: int
    name: str
    city: str = ""
    address: str = ""
    phone: str = ""
    hours: str = ""
    pickup_fee: float = 0
    home_fee: Optional[float] = None
    is_active: bool = True


class HomeResponse(BaseModel):
    categories: list[CategoryRead]
    featured: list[ProductCard]
    newest: list[ProductCard]
    best_sellers: list[ProductCard]
    shops: list[ShopPublic]
    stats: dict
    free_shipping_threshold: float = 0


# --- Panier / paiement ------------------------------------------------------

class CartItem(BaseModel):
    product_id: int
    variant_id: Optional[int] = None
    color: Optional[str] = Field(default=None, max_length=30)
    quantity: int = Field(default=1, ge=1, le=99)


class QuoteRequest(BaseModel):
    items: list[CartItem]
    delivery_mode: str = "agency_pickup"
    agency_id: Optional[int] = None
    coupon_code: Optional[str] = None


class CheckoutRequest(QuoteRequest):
    recipient_name: str = Field(min_length=2, max_length=120)
    recipient_phone: str = Field(min_length=6, max_length=30)
    address: str = ""
    city: str = ""
    note: str = Field(default="", max_length=500)
    method: str
    phone: str = ""  # numéro mobile money
    currency: str = "ZMW"

    @field_validator("recipient_name", "recipient_phone", "address", "city", "note")
    @classmethod
    def strip(cls, v: str) -> str:
        return _clean(v)


class OrderItemRead(BaseModel):
    id: int
    product_id: Optional[int] = None
    title: str
    variant_label: str = ""
    image_path: Optional[str] = None
    unit_price: float
    quantity: int
    line_total: float
    reviewed: bool = False

    model_config = {"from_attributes": True}


class OrderEventRead(BaseModel):
    status: str
    label: str
    note: str = ""
    actor: str = "system"
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderRead(BaseModel):
    id: int
    code: str
    status: str
    shop: ShopMini
    items: list[OrderItemRead] = []
    events: list[OrderEventRead] = []
    subtotal: float
    discount: float
    delivery_fee: float
    total: float
    coupon_code: Optional[str] = None
    delivery_mode: str
    agency: Optional[AgencyRead] = None
    recipient_name: str = ""
    recipient_phone: str = ""
    address: str = ""
    city: str = ""
    note: str = ""
    escrow_status: str = "none"
    tracking_code: Optional[str] = None
    dispute_reason: Optional[str] = None
    dispute_note: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_at: datetime
    paid_at: Optional[datetime] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    can_confirm: bool = False
    can_cancel: bool = False
    can_dispute: bool = False
    auto_release_at: Optional[datetime] = None
    # visibles uniquement côté vendeur / admin
    commission_amount: Optional[float] = None
    seller_net: Optional[float] = None
    buyer_name: Optional[str] = None


class CheckoutResponse(BaseModel):
    reference: str
    total: float
    status: str
    simulated: bool = True
    orders: list[OrderRead]


class DisputeRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=60)
    note: str = Field(default="", max_length=1000)


class CancelRequest(BaseModel):
    reason: str = Field(default="", max_length=300)


class ReviewCreate(BaseModel):
    order_code: str
    product_id: int
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1500)


class TrackingResponse(BaseModel):
    code: str
    status: str
    shop_name: str
    tracking_code: Optional[str] = None
    delivery_mode: str
    agency: Optional[AgencyRead] = None
    events: list[OrderEventRead]
    item_count: int = 0
    recipient_first_name: str = ""


# --- Vendeur ----------------------------------------------------------------

class ShopCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    tagline: str = Field(default="", max_length=140)
    description: str = Field(default="", max_length=3000)
    city: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=30)
    whatsapp: str = Field(default="", max_length=30)
    email: str = Field(default="", max_length=120)
    dispatch_agency_id: Optional[int] = None
    mobile_money_operator: str = ""
    mobile_money_phone: str = ""

    @field_validator("name", "tagline", "description", "city", "address", "phone", "whatsapp", "email")
    @classmethod
    def strip(cls, v: str) -> str:
        return _clean(v)


class ShopUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    tagline: Optional[str] = Field(default=None, max_length=140)
    description: Optional[str] = Field(default=None, max_length=3000)
    city: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    logo_path: Optional[str] = None
    banner_path: Optional[str] = None
    dispatch_agency_id: Optional[int] = None
    mobile_money_operator: Optional[str] = None
    mobile_money_phone: Optional[str] = None


class ShopOwnerRead(ShopPublic):
    status: str
    status_reason: Optional[str] = None
    dispatch_agency_id: Optional[int] = None
    mobile_money_operator: str = ""
    mobile_money_phone: str = ""
    commission_rate: float = 0  # taux global appliqué (informatif)
    partner_application_id: Optional[int] = None


class ColorWrite(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    hex: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class VariantWrite(BaseModel):
    id: Optional[int] = None
    label: str = Field(min_length=1, max_length=80)
    sku: str = Field(default="", max_length=60)
    price: Optional[float] = Field(default=None, ge=0)
    stock: int = Field(default=0, ge=0, le=1_000_000)
    is_active: bool = True


class ProductWrite(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    description: str = Field(default="", max_length=6000)
    category_id: Optional[int] = None
    price: float = Field(ge=0.5, le=10_000_000)
    compare_at_price: Optional[float] = Field(default=None, ge=0)
    stock: int = Field(default=0, ge=0, le=1_000_000)
    sku: str = Field(default="", max_length=60)
    brand: str = Field(default="", max_length=60)
    weight_kg: float = Field(default=0, ge=0, le=1000)
    attributes: str = Field(default="", max_length=2000)
    tags: str = Field(default="", max_length=300)
    status: str = "draft"
    images: list[str] = Field(default_factory=list, max_length=10)
    colors: list[ColorWrite] = Field(default_factory=list, max_length=8)
    model3d: str = Field(default="", max_length=20)
    variants: list[VariantWrite] = Field(default_factory=list, max_length=60)

    @field_validator("model3d")
    @classmethod
    def model3d_ok(cls, v: str) -> str:
        from app.shopping.models import MODEL3D_KINDS
        if v and v not in MODEL3D_KINDS:
            raise ValueError("Forme 3D inconnue.")
        return v

    @field_validator("status")
    @classmethod
    def status_ok(cls, v: str) -> str:
        if v not in ("draft", "active", "archived"):
            raise ValueError("Statut invalide.")
        return v

    @field_validator("title", "description", "sku", "brand", "attributes", "tags")
    @classmethod
    def strip(cls, v: str) -> str:
        return _clean(v)


class ProductOwnerRead(ProductDetail):
    category_id: Optional[int] = None


class ProductStatusPatch(BaseModel):
    status: Optional[str] = None
    stock: Optional[int] = Field(default=None, ge=0)
    price: Optional[float] = Field(default=None, ge=0.5)
    is_featured: Optional[bool] = None


class ShipRequest(BaseModel):
    note: str = Field(default="", max_length=300)


class StatsRead(BaseModel):
    revenue: float
    orders: int
    orders_open: int
    products: int
    low_stock: int
    pending_review: int = 0
    by_day: list[dict]
    top_products: list[dict]


class WalletRead(BaseModel):
    available: float
    pending: float
    total_earned: float
    total_paid_out: float
    min_payout: float


class PayoutRead(BaseModel):
    id: int
    reference: str
    shop_id: int
    shop_name: Optional[str] = None
    amount: float
    operator: str
    phone: str
    status: str
    admin_note: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None


class PayoutRequest(BaseModel):
    amount: float = Field(gt=0)
    operator: str = ""
    phone: str = ""


class CouponWrite(BaseModel):
    code: str = Field(min_length=3, max_length=30)
    percent: Optional[float] = Field(default=None, gt=0, le=90)
    amount: Optional[float] = Field(default=None, gt=0)
    min_total: float = Field(default=0, ge=0)
    max_uses: Optional[int] = Field(default=None, ge=1)
    expires_at: Optional[datetime] = None
    is_active: bool = True


class CouponRead(BaseModel):
    id: int
    code: str
    shop_id: Optional[int] = None
    percent: Optional[float] = None
    amount: Optional[float] = None
    min_total: float = 0
    max_uses: Optional[int] = None
    used: int = 0
    expires_at: Optional[datetime] = None
    is_active: bool = True

    model_config = {"from_attributes": True}


class ReplyWrite(BaseModel):
    reply: str = Field(min_length=1, max_length=800)


# --- Agence -----------------------------------------------------------------

class AgencyStatusUpdate(BaseModel):
    status: str  # received | in_transit | available | picked_up
    note: str = Field(default="", max_length=300)


# --- Admin ------------------------------------------------------------------

class CategoryWrite(BaseModel):
    slug: Optional[str] = None
    name_fr: str = Field(min_length=2, max_length=80)
    name_en: str = Field(default="", max_length=80)
    icon: str = "tag"
    parent_id: Optional[int] = None
    commission_rate: Optional[float] = Field(default=None, ge=0, le=60)
    sort_order: int = 0
    is_active: bool = True


class CategoryAdminRead(CategoryRead):
    commission_rate: Optional[float] = None
    is_active: bool = True


class AdminShopRead(ShopOwnerRead):
    owner_email: Optional[str] = None
    owner_name: Optional[str] = None
    shop_commission_rate: Optional[float] = None
    orders_count: int = 0
    revenue: float = 0


class AdminShopStatus(BaseModel):
    status: str  # approved | rejected | suspended | pending
    reason: Optional[str] = Field(default=None, max_length=300)
    commission_rate: Optional[float] = Field(default=None, ge=0, le=60)
    is_featured: Optional[bool] = None


class AdminAgencyWrite(BaseModel):
    partner_application_id: int
    name: str = Field(min_length=2, max_length=100)
    city: str = ""
    address: str = ""
    phone: str = ""
    hours: str = ""
    pickup_fee: float = Field(default=0, ge=0)
    home_fee: Optional[float] = Field(default=None, ge=0)
    is_active: bool = True


class PartnerChoice(BaseModel):
    id: int
    company: str
    category: str = ""
    already_agency: bool = False


class AdminResolve(BaseModel):
    decision: str  # release | refund
    note: str = Field(default="", max_length=500)


class AdminPayoutUpdate(BaseModel):
    status: str  # paid | rejected
    note: Optional[str] = Field(default=None, max_length=300)


class SettingsWrite(BaseModel):
    commission_rate: Optional[float] = Field(default=None, ge=0, le=60)
    free_shipping_threshold: Optional[float] = Field(default=None, ge=0)
    auto_release_days: Optional[int] = Field(default=None, ge=1, le=60)
    dispute_window_days: Optional[int] = Field(default=None, ge=1, le=60)
    min_payout: Optional[float] = Field(default=None, ge=0)


class AdminOverview(BaseModel):
    gmv: float
    commission: float
    escrow_held: float
    orders: int
    shops_pending: int
    shops_approved: int
    products_active: int
    disputes_open: int
    payouts_pending: int
    by_status: dict
