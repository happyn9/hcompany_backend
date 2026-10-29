"""H-Restaurant — restaurants, menus, plan de salle (tables), réservations, avis.

Statuts en chaînes (pas d'enums Postgres). Le plan de salle est en mètres : `x`/`z` = centre de la table
dans une salle de `room_w` × `room_d` ; il sert au plan 2D de l'éditeur et à la salle 3D du client."""
from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

RESTAURANT_STATUSES = ("draft", "pending", "active", "paused", "rejected", "suspended")
RESERVATION_STATUSES = ("pending", "confirmed", "seated", "completed", "cancelled", "declined", "no_show")
BLOCKING_STATUSES = ("pending", "confirmed", "seated")  # occupent une table
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
