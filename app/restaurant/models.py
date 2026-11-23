"""H-Restaurant — restaurants, menus, plan de salle (tables), réservations, avis.

Statuts en chaînes (pas d'enums Postgres). Le plan de salle est en mètres : `x`/`z` = centre de la table
dans une salle de `room_w` × `room_d` ; il sert au plan 2D de l'éditeur et à la salle 3D du client."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

RESTAURANT_STATUSES = ("draft", "pending", "active", "paused", "rejected", "suspended")
RESERVATION_STATUSES = ("pending", "confirmed", "seated", "completed", "cancelled", "declined", "no_show")
BLOCKING_STATUSES = ("pending", "confirmed", "seated")  # occupent une table
SELLER_TYPES = ("restaurant", "individual")  # A2 : établissement avec salle / vendeur individuel (sans salle ni réservation)
# C2 : commandes. Le statut de commande et le statut de paiement sont SÉPARÉS (paiement manuel, vendeur par vendeur).
# D1 : transitions autorisées côté vendeur (après acceptation)
SELLER_TRANSITIONS = {"accepted": ("preparing", "ready", "completed", "cancelled"), "preparing": ("ready", "completed", "cancelled"), "ready": ("completed", "cancelled")}
ORDER_STATUSES = ("pending", "accepted", "declined", "preparing", "ready", "completed", "cancelled")
PAYMENT_STATUSES = ("unpaid", "declared", "confirmed")
FULFILMENTS = ("delivery", "pickup")
TABLE_SHAPES = ("round", "square", "rect")
TABLE_ZONES = ("indoor", "terrace", "vip")
CUISINES = ("zambian", "african", "congolese", "indian", "italian", "chinese", "grill", "seafood", "fastfood", "vegetarian", "cafe", "bakery", "international")
DISH_TAGS = ("vegetarian", "vegan", "halal", "spicy", "gluten_free", "new", "signature")


class Restaurant(SQLModel, table=True):
    __tablename__ = "restaurant"
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    partner_application_id: Optional[int] = Field(default=None, foreign_key="partnerapplication.id")
    name: str = Field(index=True)
    summary: str = ""
    description: str = ""
    cuisines: str = ""  # clés de CUISINES séparées par des virgules
    country: str = "Zambie"
    city: str = Field(default="", index=True)
    area: str = ""
    address: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: str = ""
    whatsapp: str = ""
    price_level: int = 2  # 1 = $, 2 = $$, 3 = $$$
    open_time: str = "11:00"
    close_time: str = "22:00"
    closed_days: str = ""  # jours fermés, 0 = lundi … 6 = dimanche
    slot_minutes: int = 90  # durée d'occupation d'une table
    max_party: int = 12
    instant_confirm: bool = False
    accepts_preorder: bool = True
    has_terrace: bool = False
    room_w: float = 14
    room_d: float = 10
    # --- A2 : type de vendeur, livraison et conditions de vente (contact direct, paiement manuel) ---
    seller_type: str = Field(default="restaurant", index=True)  # 'restaurant' | 'individual'
    offers_delivery: bool = False
    delivery_zones: str = ""
    delivery_fee: Optional[float] = None  # None = « à convenir », 0 = gratuite
    delivery_fee_note: str = ""
    delivery_terms: str = ""
    sale_notes: str = ""
    status: str = Field(default="draft", index=True)
    status_reason: Optional[str] = None
    is_featured: bool = False
    rating_avg: float = 0
    rating_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None


class RestaurantImage(SQLModel, table=True):
    __tablename__ = "restaurantimage"
    id: Optional[int] = Field(default=None, primary_key=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    path: str
    sort_order: int = 0


class MenuCategory(SQLModel, table=True):
    __tablename__ = "menucategory"
    id: Optional[int] = Field(default=None, primary_key=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    name: str
    sort_order: int = 0


class MenuItem(SQLModel, table=True):
    __tablename__ = "menuitem"
    id: Optional[int] = Field(default=None, primary_key=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    category_id: Optional[int] = Field(default=None, foreign_key="menucategory.id")
    name: str
    description: str = ""
    price: float
    image_path: Optional[str] = None
    tags: str = ""
    is_available: bool = True
    sort_order: int = 0


class DiningTable(SQLModel, table=True):
    __tablename__ = "diningtable"
    id: Optional[int] = Field(default=None, primary_key=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    label: str
    seats: int = 4
    shape: str = "round"
    zone: str = "indoor"
    x: float = 2
    z: float = 2
    rotation: float = 0  # degrés (0 ou 90 pour les tables rectangulaires)
    is_active: bool = True


class Reservation(SQLModel, table=True):
    __tablename__ = "reservation"
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    table_id: Optional[int] = Field(default=None, foreign_key="diningtable.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    name: str
    phone: str = ""
    party_size: int = 2
    day: date = Field(index=True)
    time: str = "19:00"  # HH:MM
    duration_minutes: int = 90
    # Plage d'occupation de la table [start_at, end_at) en heure locale du restaurant (naïve).
    # Sert de base à la contrainte d'exclusion PostgreSQL `reservation_no_table_overlap`
    # (migration `d1a2b3c4e5f6`) : deux réservations bloquantes ne peuvent pas se
    # chevaucher sur une même table. NULL pour les anciennes lignes non migrées.
    start_at: Optional[datetime] = Field(default=None)
    end_at: Optional[datetime] = Field(default=None)
    status: str = Field(default="pending", index=True)
    note: str = ""
    preorder: str = "[]"  # JSON [{item_id,name,qty,price}]
    preorder_total: float = 0
    restaurant_name: str = ""
    table_label: str = ""
    decline_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RestaurantReview(SQLModel, table=True):
    __tablename__ = "restaurantreview"
    id: Optional[int] = Field(default=None, primary_key=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    reservation_id: int = Field(foreign_key="reservation.id", unique=True)
    user_id: int = Field(foreign_key="user.id")
    rating: int
    comment: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FoodOrder(SQLModel, table=True):
    """Commande PARENT du client (C2). Elle regroupe une sous-commande indépendante par vendeur ; elle ne porte aucune
    logique vendeur. `idempotency_key` + `user_id` sont uniques : rejouer un checkout ne crée jamais de doublon."""
    __tablename__ = "foodorder"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_foodorder_user_idem"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    idempotency_key: str = Field(index=True)
    request_hash: str = ""
    contact_name: str = ""
    phone: str = ""
    note: str = ""
    currency: str = "ZMW"
    items_total: float = 0
    fees_known_total: float = 0  # somme des frais de livraison CONNUS (les frais « à convenir » ne sont pas inclus)
    fees_pending: bool = False
    grand_total: float = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FoodSubOrder(SQLModel, table=True):
    """Sous-commande d'UN vendeur : articles, montants, modalités, statut et paiement indépendants des autres vendeurs."""
    __tablename__ = "foodsuborder"
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    order_id: int = Field(foreign_key="foodorder.id", index=True)
    restaurant_id: int = Field(foreign_key="restaurant.id", index=True)
    restaurant_name: str = ""
    seller_type: str = "restaurant"
    fulfilment: str = "delivery"
    delivery_address: str = ""
    delivery_zone: str = ""
    delivery_fee: Optional[float] = None  # None = à convenir ; 0 = gratuite (instantané au moment de la commande)
    delivery_fee_note: str = ""
    delivery_terms: str = ""
    items_total: float = 0
    total_known: float = 0
    fee_pending: bool = False
    status: str = Field(default="pending", index=True)
    payment_status: str = Field(default="unpaid", index=True)
    decline_reason: Optional[str] = None
    note: str = ""
    payment_method: Optional[str] = None  # D1 : paiement MANUEL — texte libre (ex. « Airtel Money »), jamais traité par HFood
    payment_ref: Optional[str] = None
    payment_note: Optional[str] = None
    status_note: Optional[str] = None  # motif d'annulation par le vendeur, etc.
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class FoodOrderItem(SQLModel, table=True):
    """Ligne figée (nom et prix au moment de la commande) : modifier ou supprimer un plat ne change pas les commandes passées."""
    __tablename__ = "foodorderitem"
    id: Optional[int] = Field(default=None, primary_key=True)
    sub_order_id: int = Field(foreign_key="foodsuborder.id", index=True)
    menu_item_id: Optional[int] = Field(default=None, index=True)
    name: str
    unit_price: float
    qty: int
    line_total: float
