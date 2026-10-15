"""H-Shopping — modèles de la place de marché : boutiques, catalogue,
commandes (une par boutique), séquestre, expéditions reliées aux colis
Lukondo, avis, coupons, retraits.

Tous les montants sont en monnaie pivot (config `learning_pivot_currency`,
ZMW par défaut) ; les autres devises ne sont que des conversions d'affichage
(table CurrencyRate partagée avec H-Learning).

Les statuts sont des chaînes (pas des enums Postgres) pour pouvoir ajouter
un état sans migration lourde.
"""
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

# --- Statuts ---------------------------------------------------------------
SHOP_STATUSES = ("pending", "approved", "suspended", "rejected")
PRODUCT_STATUSES = ("draft", "active", "archived")
# Cycle de vie d'une commande boutique :
#   pending_payment → paid → processing → shipped → delivered → completed
#   (cancelled / refunded possibles avant livraison, disputed après)
ORDER_STATUSES = (
    "pending_payment", "paid", "processing", "shipped", "delivered",
    "completed", "cancelled", "refunded", "disputed",
)
DELIVERY_MODES = ("agency_pickup", "home_delivery")
ESCROW_STATUSES = ("none", "held", "released", "refunded")


class ShopCategory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    name_fr: str
    name_en: str = ""
    icon: str = "tag"  # nom d'icône lucide côté site
    parent_id: Optional[int] = Field(default=None, foreign_key="shopcategory.id", index=True)
    commission_rate: Optional[float] = None  # % ; vide = taux global
    sort_order: int = 0
    is_active: bool = True


class ShopSetting(SQLModel, table=True):
    """Réglages globaux modifiables dans l'admin (clé/valeur texte)."""
    key: str = Field(primary_key=True)
    value: str = ""


class Shop(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    name: str
    tagline: str = ""
    description: str = ""
    logo_path: Optional[str] = None
    banner_path: Optional[str] = None
    city: str = ""
    address: str = ""
    phone: str = ""
    whatsapp: str = ""
    email: str = ""
    # Lien avec le réseau partenaire : un vendeur peut être aussi un
    # partenaire approuvé (agence, restaurant, atelier...).
    partner_application_id: Optional[int] = Field(default=None, foreign_key="partnerapplication.id")
    # Agence qui prend en charge l'expédition de cette boutique par défaut.
    dispatch_agency_id: Optional[int] = Field(default=None, foreign_key="shopagency.id")
    commission_rate: Optional[float] = None  # surcharge négociée, en %
    status: str = Field(default="pending", index=True)
    status_reason: Optional[str] = None
    is_featured: bool = False
    rating_avg: float = 0
    rating_count: int = 0
    mobile_money_operator: str = ""  # pour les retraits
    mobile_money_phone: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None


class ShopAgency(SQLModel, table=True):
    """Agence partenaire (PartnerApplication approuvée) inscrite comme point
    de retrait / de livraison des commandes H-Shopping."""
    id: Optional[int] = Field(default=None, primary_key=True)
    partner_application_id: int = Field(foreign_key="partnerapplication.id", unique=True, index=True)
    name: str
    city: str = ""
    address: str = ""
    phone: str = ""
    hours: str = ""
    pickup_fee: float = 0
    home_fee: Optional[float] = None  # vide = pas de livraison à domicile
    is_active: bool = True


class ShopProduct(SQLModel, table=True):
    __tablename__ = "shopproduct"
    id: Optional[int] = Field(default=None, primary_key=True)
    shop_id: int = Field(foreign_key="shop.id", index=True)
    category_id: Optional[int] = Field(default=None, foreign_key="shopcategory.id", index=True)
    title: str = Field(index=True)
    description: str = ""
    price: float
    compare_at_price: Optional[float] = None  # ancien prix barré
    stock: int = 0  # utilisé quand le produit n'a pas de variantes
    sku: str = ""
    brand: str = ""
    weight_kg: float = 0
    attributes: str = ""  # « Clé: valeur » par ligne
    tags: str = ""  # séparés par des virgules
    status: str = Field(default="draft", index=True)
    is_featured: bool = False
    sold_count: int = 0
    rating_avg: float = 0
    rating_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ShopProductImage(SQLModel, table=True):
    __tablename__ = "shopproductimage"
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="shopproduct.id", index=True)
    path: str
    sort_order: int = 0


class ShopProductVariant(SQLModel, table=True):
    __tablename__ = "shopproductvariant"
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="shopproduct.id", index=True)
    label: str  # ex: « M · Rouge »
    sku: str = ""
    price: Optional[float] = None  # vide = prix du produit
    stock: int = 0
    is_active: bool = True


class Favorite(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    product_id: int = Field(foreign_key="shopproduct.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Coupon(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    shop_id: Optional[int] = Field(default=None, foreign_key="shop.id", index=True)  # vide = toute la place de marché (admin)
    percent: Optional[float] = None
    amount: Optional[float] = None
    min_total: float = 0
    max_uses: Optional[int] = None
    used: int = 0
    expires_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CheckoutGroup(SQLModel, table=True):
    """Un paiement (mobile money) qui couvre une ou plusieurs commandes
    boutique — un panier multi-boutiques = un seul paiement, N commandes."""
    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(index=True, unique=True)
    buyer_id: int = Field(foreign_key="user.id", index=True)
    total: float = 0
    method: str = ""
    phone_number: str = ""
    provider_reference: Optional[str] = None
    simulated: bool = True
    status: str = "pending"  # pending | paid | failed
    failure_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None


class ShopOrder(SQLModel, table=True):
    __tablename__ = "shoporder"
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # ex: HS-7K3M9Q
    group_id: int = Field(foreign_key="checkoutgroup.id", index=True)
    shop_id: int = Field(foreign_key="shop.id", index=True)
    buyer_id: int = Field(foreign_key="user.id", index=True)
    status: str = Field(default="pending_payment", index=True)
    # Montants
    subtotal: float = 0
    discount: float = 0
    delivery_fee: float = 0
    total: float = 0
    commission_rate: float = 0
    commission_amount: float = 0
    seller_net: float = 0  # total − frais de livraison − commission
    coupon_code: Optional[str] = None
    # Livraison
    delivery_mode: str = "agency_pickup"
    agency_id: Optional[int] = Field(default=None, foreign_key="shopagency.id", index=True)
    recipient_name: str = ""
    recipient_phone: str = ""
    address: str = ""
    city: str = ""
    note: str = ""
    # Séquestre
    escrow_status: str = "none"
    escrow_released_at: Optional[datetime] = None
    # Expédition (colis Lukondo)
    parcel_id: Optional[int] = Field(default=None, foreign_key="parcel.id")
    tracking_code: Optional[str] = Field(default=None, index=True)
    # Litige
    dispute_reason: Optional[str] = None
    dispute_note: Optional[str] = None
    dispute_opened_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    # Dates
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ShopOrderItem(SQLModel, table=True):
    __tablename__ = "shoporderitem"
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="shoporder.id", index=True)
    product_id: Optional[int] = Field(default=None, foreign_key="shopproduct.id", index=True)
    variant_id: Optional[int] = Field(default=None, foreign_key="shopproductvariant.id")
    title: str
    variant_label: str = ""
    image_path: Optional[str] = None
    unit_price: float
    quantity: int = 1
    line_total: float = 0


class OrderEvent(SQLModel, table=True):
    """Historique de suivi affiché à l'acheteur (frise de suivi colis)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="shoporder.id", index=True)
    status: str
    label: str
    note: str = ""
    actor: str = "system"  # system | buyer | seller | agency | admin
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShopReview(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="shopproduct.id", index=True)
    shop_id: int = Field(foreign_key="shop.id", index=True)
    order_id: int = Field(foreign_key="shoporder.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    author_name: str = ""
    rating: int
    comment: str = ""
    seller_reply: Optional[str] = None
    is_hidden: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShopPayout(SQLModel, table=True):
    """Demande de retrait du solde vendeur (fonds du séquestre libérés)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(index=True, unique=True)
    shop_id: int = Field(foreign_key="shop.id", index=True)
    amount: float
    operator: str = ""
    phone: str = ""
    status: str = Field(default="requested", index=True)  # requested | paid | rejected
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None
