"""H-Tourisme — excursions, départs (dates avec places), réservations, avis.

Statuts en chaînes (pas d'enums Postgres). Un départ = une date + une heure + une capacité ; les places restantes
se déduisent des réservations en cours (en attente / confirmées)."""
from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

TOUR_STATUSES = ("draft", "pending", "active", "paused", "rejected", "suspended")
BOOKING_STATUSES = ("pending", "confirmed", "completed", "cancelled", "declined", "no_show")
BLOCKING_STATUSES = ("pending", "confirmed")  # occupent des places
CATEGORIES = ("safari", "waterfall", "culture", "adventure", "city", "nature", "boat", "hiking", "food", "wellness")
DIFFICULTIES = ("easy", "moderate", "hard")


class Tour(SQLModel, table=True):
    __tablename__ = "tour"
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(index=True)
    summary: str = ""
    description: str = ""
    category: str = Field(default="nature", index=True)
    country: str = "Zambie"
    city: str = Field(default="", index=True)
    meeting_point: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: str = ""
    whatsapp: str = ""
    duration_hours: float = 3
    difficulty: str = "easy"
    languages: str = "fr,en"          # codes séparés par des virgules
    min_age: int = 0
    price_adult: float = 0            # monnaie pivot, par personne
    price_child: Optional[float] = None  # None = pas de tarif enfant
    max_group: int = 12               # capacité par défaut d'un départ
    includes: str = ""                # une ligne par élément
    excludes: str = ""
    itinerary: str = "[]"             # JSON [{title, text}]
    instant_confirm: bool = False
    cancel_hours: int = 24            # annulation gratuite jusqu'à N h avant
    status: str = Field(default="draft", index=True)
    status_reason: Optional[str] = None
    is_featured: bool = False
    rating_avg: float = 0
    rating_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None


class TourImage(SQLModel, table=True):
    __tablename__ = "tourimage"
    id: Optional[int] = Field(default=None, primary_key=True)
    tour_id: int = Field(foreign_key="tour.id", index=True)
    path: str
    sort_order: int = 0


class TourDeparture(SQLModel, table=True):
    __tablename__ = "tourdeparture"
    id: Optional[int] = Field(default=None, primary_key=True)
    tour_id: int = Field(foreign_key="tour.id", index=True)
    day: date = Field(index=True)
    time: str = "08:00"
    capacity: int = 12
    price_adult: Optional[float] = None   # remplace le tarif de l'excursion pour ce départ
    price_child: Optional[float] = None
    is_open: bool = True


class TourBooking(SQLModel, table=True):
    __tablename__ = "tourbooking"
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    tour_id: int = Field(foreign_key="tour.id", index=True)
    departure_id: int = Field(foreign_key="tourdeparture.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    name: str
    phone: str = ""
    adults: int = 1
    children: int = 0
    total: float = 0
    status: str = Field(default="pending", index=True)
    note: str = ""
    decline_reason: Optional[str] = None
    tour_title: str = ""
    day: date = Field(index=True)
    time: str = "08:00"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TourReview(SQLModel, table=True):
    __tablename__ = "tourreview"
    id: Optional[int] = Field(default=None, primary_key=True)
    tour_id: int = Field(foreign_key="tour.id", index=True)
    booking_id: int = Field(foreign_key="tourbooking.id", unique=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    rating: int
    comment: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
