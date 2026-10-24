"""H-Transport Colis — fret par camion : l'agence enregistre ses véhicules
(fourgon, canter, fuso, camion, semi-remorque) et publie des départs ; le client
réserve des kilos, paie (séquestre) et suit son colis ; la remise se valide avec un
code de livraison que le destinataire donne au chauffeur."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlmodel import Field as F, Session, SQLModel, func, select

from app.database import get_session
from app.deps import get_current_user
from app.models import PaymentMethod, User
from app.routers.learning_plans import OPERATOR_LABELS, OPERATOR_PREFIXES, normalize_zm_phone
from app.services.payments import charge as charge_payment
from app.services.rate_limit import limiter
from app.shopping.services import money
from app.transport.models import TransportOperator
from app.transport.services import commission_rate_for, notify_user, now_local

VEHICLE_KINDS = {
    "van": {"fr": "Fourgon", "en": "Van", "kg": 1200, "m3": 8},
    "canter": {"fr": "Canter", "en": "Canter", "kg": 3500, "m3": 20},
    "fuso": {"fr": "Fuso", "en": "Fuso", "kg": 8000, "m3": 38},
    "truck": {"fr": "Camion", "en": "Truck", "kg": 15000, "m3": 60},
    "trailer": {"fr": "Semi-remorque", "en": "Trailer", "kg": 30000, "m3": 90},
}
CATEGORIES = ("general", "fragile", "food", "electronics", "documents", "construction")
TRIP_STATUSES = ("scheduled", "loading", "in_transit", "delivered", "cancelled")
HOLD = ("pending_payment", "confirmed", "in_transit", "delivered")
SALES_CLOSE_HOURS = 6
USER_FREE_CANCEL_HOURS = 12


class CargoVehicle(SQLModel, table=True):
    id: Optional[int] = F(default=None, primary_key=True)
    operator_id: int = F(foreign_key="transportoperator.id", index=True)
    kind: str = "canter"
    name: str = ""
    plate: str = F(index=True)
    capacity_kg: float = 3500
    capacity_m3: float = 20
    refrigerated: bool = False
    is_active: bool = True
    created_at: datetime = F(default_factory=datetime.utcnow)


class CargoTrip(SQLModel, table=True):
    id: Optional[int] = F(default=None, primary_key=True)
    operator_id: int = F(foreign_key="transportoperator.id", index=True)
    vehicle_id: int = F(foreign_key="cargovehicle.id", index=True)
    origin: str = F(index=True)
    destination: str = F(index=True)
    departure_at: datetime = F(index=True)
    arrival_at: datetime
    price_per_kg: float
    min_kg: float = 1
    notes: str = ""
    status: str = F(default="scheduled", index=True)
    current_location: str = ""
    cancel_reason: Optional[str] = None
    created_at: datetime = F(default_factory=datetime.utcnow)


class CargoBooking(SQLModel, table=True):
    id: Optional[int] = F(default=None, primary_key=True)
    code: str = F(index=True, unique=True)  # HC-XXXXXX
    trip_id: int = F(foreign_key="cargotrip.id", index=True)
    operator_id: int = F(foreign_key="transportoperator.id", index=True)
    user_id: int = F(foreign_key="user.id", index=True)
    status: str = F(default="pending_payment", index=True)
    weight_kg: float = 0
    description: str = ""
    category: str = "general"
    receiver_name: str = ""
    receiver_phone: str = ""
    delivery_code: str = ""
    origin: str = ""
    destination: str = ""
    departure_at: datetime = F(index=True)
    total: float = 0
    commission_rate: float = 0
    commission_amount: float = 0
    operator_net: float = 0
    refund_amount: float = 0
    escrow_status: str = "none"  # none | held | released | refunded
    payment_reference: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_at: datetime = F(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None


class CargoEvent(SQLModel, table=True):
    id: Optional[int] = F(default=None, primary_key=True)
    booking_id: int = F(foreign_key="cargobooking.id", index=True)
    status: str
    label: str
    note: str = ""
    created_at: datetime = F(default_factory=datetime.utcnow)


# --- Schémas -------------------------------------------------------------------

class VehicleWrite(BaseModel):
    kind: str
    name: str = Field(default="", max_length=60)
    plate: str = Field(min_length=3, max_length=20)
    capacity_kg: float = Field(gt=0, le=60000)
    capacity_m3: float = Field(gt=0, le=200)
    refrigerated: bool = False

    @field_validator("kind")
    @classmethod
    def _k(cls, v):
        if v not in VEHICLE_KINDS:
            raise ValueError("Type de véhicule inconnu.")
        return v


class VehicleRead(BaseModel):
    id: int
    kind: str
    name: str
    plate: str
    capacity_kg: float
    capacity_m3: float
    refrigerated: bool
    is_active: bool
    upcoming_trips: int = 0


class CargoTripWrite(BaseModel):
    vehicle_id: int
    origin: str = Field(min_length=2, max_length=80)
    destination: str = Field(min_length=2, max_length=80)
    departure_at: datetime
    arrival_at: datetime
    price_per_kg: float = Field(gt=0, le=10000)
    min_kg: float = Field(default=1, gt=0, le=1000)
    notes: str = Field(default="", max_length=600)

    @model_validator(mode="after")
    def _t(self):
        if self.origin.strip().lower() == self.destination.strip().lower():
            raise ValueError("Le départ et l'arrivée doivent être différents.")
        if self.arrival_at <= self.departure_at:
            raise ValueError("L'arrivée doit être après le départ.")
        return self


class CargoTripRead(BaseModel):
    id: int
    origin: str
    destination: str
    departure_at: datetime
    arrival_at: datetime
    price_per_kg: float
    min_kg: float
    notes: str = ""
    status: str
    current_location: str = ""
    vehicle: VehicleRead
    operator_id: int
    operator_name: str
    operator_verified: bool = False
    kg_left: float
    kg_booked: float
    bookable: bool
    closed_reason: Optional[str] = None
    revenue: Optional[float] = None


class CargoBook(BaseModel):
    trip_id: int
    weight_kg: float = Field(gt=0, le=60000)
    description: str = Field(min_length=3, max_length=300)
    category: str = "general"
    receiver_name: str = Field(min_length=2, max_length=80)
    receiver_phone: str = Field(min_length=6, max_length=30)
    method: str
    phone: str

    @field_validator("category")
    @classmethod
    def _c(cls, v):
        if v not in CATEGORIES:
            raise ValueError("Catégorie inconnue.")
        return v


class EventRead(BaseModel):
    status: str
    label: str
    note: str = ""
    created_at: datetime


class CargoBookingRead(BaseModel):
    id: int
    code: str
    status: str
    weight_kg: float
    description: str
    category: str
    receiver_name: str
    receiver_phone: str
    delivery_code: Optional[str] = None
    origin: str
    destination: str
    departure_at: datetime
    total: float
    escrow_status: str
    refund_amount: float = 0
    trip_status: str = "scheduled"
    current_location: str = ""
    operator_name: str = ""
    vehicle_label: str = ""
    sender_name: Optional[str] = None
    events: list[EventRead] = []
    created_at: datetime


class StatusUpdate(BaseModel):
    status: str
    location: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=300)


class DeliverBody(BaseModel):
    code: str = Field(min_length=4, max_length=10)


# --- Logique ---------------------------------------------------------------------

def _code(session: Session) -> str:
    for _ in range(10):
        c = "HC-" + secrets.token_hex(3).upper()
        if not session.exec(select(CargoBooking).where(CargoBooking.code == c)).first():
            return c
    raise HTTPException(status_code=500, detail="Impossible de générer la référence.")


def kg_booked(session: Session, trip_id: int) -> float:
    return float(session.exec(select(func.coalesce(func.sum(CargoBooking.weight_kg), 0)).where(CargoBooking.trip_id == trip_id, CargoBooking.status.in_(HOLD))).one())


def _event(session: Session, b: CargoBooking, status: str, label: str, note: str = "") -> None:
    session.add(CargoEvent(booking_id=b.id, status=status, label=label, note=note))


def closed_reason(session: Session, t: CargoTrip) -> Optional[str]:
    if t.status != "scheduled":
        return "Ce camion est déjà en chargement ou parti." if t.status != "cancelled" else "Départ annulé."
    if t.departure_at - timedelta(hours=SALES_CLOSE_HOURS) <= now_local():
        return f"Réservations closes {SALES_CLOSE_HOURS} h avant le départ."
    return None


def vehicle_read(session: Session, v: CargoVehicle, with_count=False) -> VehicleRead:
    n = int(session.exec(select(func.count(CargoTrip.id)).where(CargoTrip.vehicle_id == v.id, CargoTrip.status == "scheduled")).one()) if with_count else 0
    return VehicleRead(id=v.id, kind=v.kind, name=v.name, plate=v.plate, capacity_kg=v.capacity_kg, capacity_m3=v.capacity_m3,
                       refrigerated=v.refrigerated, is_active=v.is_active, upcoming_trips=n)


def trip_read(session: Session, t: CargoTrip, owner: bool = False) -> CargoTripRead:
    v, op = session.get(CargoVehicle, t.vehicle_id), session.get(TransportOperator, t.operator_id)
    booked = kg_booked(session, t.id)
    left = max(0.0, v.capacity_kg - booked)
    reason = closed_reason(session, t)
    if not reason and left < t.min_kg:
        reason = "Camion complet."
    rev = None
    if owner:
        rev = float(session.exec(select(func.coalesce(func.sum(CargoBooking.total), 0)).where(CargoBooking.trip_id == t.id, CargoBooking.status.in_(("confirmed", "in_transit", "delivered")))).one())
    return CargoTripRead(id=t.id, origin=t.origin, destination=t.destination, departure_at=t.departure_at, arrival_at=t.arrival_at,
                         price_per_kg=t.price_per_kg, min_kg=t.min_kg, notes=t.notes, status=t.status, current_location=t.current_location,
                         vehicle=vehicle_read(session, v), operator_id=op.id, operator_name=op.name, operator_verified=op.is_verified,
                         kg_left=round(left, 1), kg_booked=round(booked, 1), bookable=reason is None, closed_reason=reason, revenue=rev)


def booking_read(session: Session, b: CargoBooking, *, role: str = "user") -> CargoBookingRead:
    t = session.get(CargoTrip, b.trip_id)
    v = session.get(CargoVehicle, t.vehicle_id)
    op = session.get(TransportOperator, b.operator_id)
    sender = session.get(User, b.user_id)
    ev = session.exec(select(CargoEvent).where(CargoEvent.booking_id == b.id).order_by(CargoEvent.created_at, CargoEvent.id)).all()
    return CargoBookingRead(
        id=b.id, code=b.code, status=b.status, weight_kg=b.weight_kg, description=b.description, category=b.category,
        receiver_name=b.receiver_name, receiver_phone=b.receiver_phone,
        delivery_code=b.delivery_code if role == "user" and b.status in ("confirmed", "in_transit") else None,
        origin=b.origin, destination=b.destination, departure_at=b.departure_at, total=b.total, escrow_status=b.escrow_status,
        refund_amount=b.refund_amount, trip_status=t.status, current_location=t.current_location, operator_name=op.name if op else "",
        vehicle_label=f"{VEHICLE_KINDS.get(v.kind, {}).get('fr', v.kind)} · {v.plate}", sender_name=(sender.full_name or sender.email) if role == "operator" and sender else None,
        events=[EventRead(status=e.status, label=e.label, note=e.note, created_at=e.created_at) for e in ev], created_at=b.created_at)


def _refund(session: Session, b: CargoBooking, amount: float, label: str) -> None:
    b.refund_amount, b.escrow_status = money(amount), "refunded" if amount > 0 else b.escrow_status
    session.add(b)


def cargo_wallet(session: Session, operator_id: int) -> dict:
    def tot(*w):
        return float(session.exec(select(func.coalesce(func.sum(CargoBooking.operator_net), 0)).where(CargoBooking.operator_id == operator_id, *w)).one())
    return {"released": tot(CargoBooking.escrow_status == "released"), "held": tot(CargoBooking.escrow_status == "held")}


# --- Routes publiques / client ------------------------------------------------------

public = APIRouter(prefix="/api/v1/transport/cargo", tags=["transport-cargo"])
operator = APIRouter(prefix="/api/v1/transport/operator/cargo", tags=["transport-cargo-operator"])


@public.get("/meta")
def meta():
    return {"kinds": [{"key": k, "fr": v["fr"], "en": v["en"], "kg": v["kg"], "m3": v["m3"]} for k, v in VEHICLE_KINDS.items()],
            "categories": list(CATEGORIES), "sales_close_hours": SALES_CLOSE_HOURS, "free_cancel_hours": USER_FREE_CANCEL_HOURS}


@public.get("/trips", response_model=list[CargoTripRead])
def search(origin: str = "", destination: str = "", kind: str = "", min_kg: float = 0, session: Session = Depends(get_session)):
    stmt = (select(CargoTrip).join(TransportOperator, TransportOperator.id == CargoTrip.operator_id)
            .where(CargoTrip.status == "scheduled", CargoTrip.departure_at > now_local(), TransportOperator.status == "approved"))
    if origin.strip():
        stmt = stmt.where(func.lower(CargoTrip.origin) == origin.strip().lower())
    if destination.strip():
        stmt = stmt.where(func.lower(CargoTrip.destination) == destination.strip().lower())
    if kind:
        stmt = stmt.join(CargoVehicle, CargoVehicle.id == CargoTrip.vehicle_id).where(CargoVehicle.kind == kind)
    rows = [trip_read(session, t) for t in session.exec(stmt.order_by(CargoTrip.departure_at).limit(100)).all()]
    return [r for r in rows if r.kg_left >= max(min_kg, 0)]


@public.get("/trips/{trip_id}", response_model=CargoTripRead)
def one(trip_id: int, session: Session = Depends(get_session)):
    t = session.get(CargoTrip, trip_id)
    if not t:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    return trip_read(session, t)


@public.post("/book", response_model=CargoBookingRead, status_code=201)
@limiter.limit("20/hour")
def book(request: Request, payload: CargoBook, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if payload.method not in OPERATOR_PREFIXES:
        raise HTTPException(status_code=422, detail="Choisissez un moyen de paiement mobile money.")
    phone = normalize_zm_phone(payload.phone)
    if not phone or phone[1:3] not in OPERATOR_PREFIXES[payload.method]:
        raise HTTPException(status_code=422, detail=f"Numéro {OPERATOR_LABELS[payload.method]} invalide (ex. 097 1234567).")
    t = session.get(CargoTrip, payload.trip_id)
    if not t:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    op = session.get(TransportOperator, t.operator_id)
    if op.user_id == user.id:
        raise HTTPException(status_code=422, detail="Vous ne pouvez pas expédier sur un départ de votre propre agence.")
    reason = closed_reason(session, t)
    if reason:
        raise HTTPException(status_code=409, detail=reason)
    v = session.get(CargoVehicle, t.vehicle_id)
    if payload.weight_kg < t.min_kg:
        raise HTTPException(status_code=422, detail=f"Minimum {t.min_kg:g} kg pour ce départ.")
    if payload.category == "food" and False:
        pass
    if payload.weight_kg > v.capacity_kg - kg_booked(session, t.id) + 1e-9:
        raise HTTPException(status_code=409, detail="Il ne reste pas assez de capacité sur ce camion.")
    total = money(payload.weight_kg * t.price_per_kg)
    rate = commission_rate_for(session, op)
    commission = money(total * rate / 100)
    b = CargoBooking(code=_code(session), trip_id=t.id, operator_id=op.id, user_id=user.id, weight_kg=payload.weight_kg, description=payload.description.strip(),
                     category=payload.category, receiver_name=payload.receiver_name.strip(), receiver_phone=payload.receiver_phone.strip(),
                     delivery_code=f"{secrets.randbelow(10**6):06d}", origin=t.origin, destination=t.destination, departure_at=t.departure_at,
                     total=total, commission_rate=rate, commission_amount=commission, operator_net=money(total - commission))
    session.add(b)
    session.commit()
    session.refresh(b)
    ref = "CG" + secrets.token_hex(5).upper()
    result = charge_payment(PaymentMethod(payload.method), b.total, ref, phone)
    if not result.success:
        b.status, b.cancel_reason = "expired", result.failure_reason or "Paiement refusé."
        session.add(b)
        _event(session, b, "expired", "Paiement refusé — capacité libérée", b.cancel_reason)
        session.commit()
        raise HTTPException(status_code=402, detail=b.cancel_reason)
    b.status, b.escrow_status, b.paid_at, b.payment_reference = "confirmed", "held", now_local(), ref
    session.add(b)
    _event(session, b, "confirmed", "Paiement reçu — fonds en séquestre", f"Réf. {ref}")
    session.commit()
    notify_user(session, user.id, f"Colis confirmé {b.code}", f"{b.weight_kg:g} kg {b.origin} → {b.destination}. Code de livraison : {b.delivery_code} (à donner à {b.receiver_name}).", user.email)
    opu = session.get(User, op.user_id)
    notify_user(session, op.user_id, f"Nouveau colis {b.code}", f"{b.weight_kg:g} kg {b.origin} → {b.destination}, départ le {b.departure_at:%d/%m à %H:%M}.", opu.email if opu else None)
    session.commit()
    return booking_read(session, b)


@public.get("/me/bookings", response_model=list[CargoBookingRead])
def mine(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(CargoBooking).where(CargoBooking.user_id == user.id, CargoBooking.paid_at != None).order_by(CargoBooking.created_at.desc())).all()  # noqa: E711
    return [booking_read(session, b) for b in rows]


@public.get("/track/{code}", response_model=CargoBookingRead)
def track(code: str, session: Session = Depends(get_session)):
    """Suivi public par référence : ni code de livraison, ni nom de l'expéditeur."""
    b = session.exec(select(CargoBooking).where(CargoBooking.code == code.strip().upper(), CargoBooking.paid_at != None)).first()  # noqa: E711
    if not b:
        raise HTTPException(status_code=404, detail="Référence introuvable.")
    out = booking_read(session, b, role="public")
    out.receiver_phone = ""
    return out


@public.post("/me/bookings/{code}/cancel", response_model=CargoBookingRead)
def cancel(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    b = session.exec(select(CargoBooking).where(CargoBooking.code == code.upper(), CargoBooking.user_id == user.id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable.")
    if b.status != "confirmed":
        raise HTTPException(status_code=409, detail="Ce colis ne peut plus être annulé.")
    t = session.get(CargoTrip, b.trip_id)
    if t.status != "scheduled" or t.departure_at - timedelta(hours=USER_FREE_CANCEL_HOURS) <= now_local():
        raise HTTPException(status_code=409, detail=f"Annulation gratuite possible jusqu'à {USER_FREE_CANCEL_HOURS} h avant le départ.")
    b.status, b.cancel_reason = "cancelled_user", "Annulé par l'expéditeur"
    _refund(session, b, b.total, "")
    _event(session, b, "cancelled_user", "Annulé — remboursement intégral", f"{b.total:.2f} ZMW")
    session.commit()
    return booking_read(session, b)


# --- Espace agence ------------------------------------------------------------------

def _op(session: Session, user: User) -> TransportOperator:
    op = session.exec(select(TransportOperator).where(TransportOperator.user_id == user.id)).first()
    if not op:
        raise HTTPException(status_code=404, detail="Créez d'abord le profil de votre agence.")
    if op.status != "approved":
        raise HTTPException(status_code=403, detail="Votre agence doit d'abord être validée par H-Company.")
    return op


def _apply_vehicle(v: CargoVehicle, p: VehicleWrite) -> None:
    v.kind, v.name, v.plate, v.capacity_kg, v.capacity_m3, v.refrigerated = p.kind, p.name.strip(), p.plate.strip().upper(), p.capacity_kg, p.capacity_m3, p.refrigerated


@operator.get("/vehicles", response_model=list[VehicleRead])
def vehicles(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    return [vehicle_read(session, v, True) for v in session.exec(select(CargoVehicle).where(CargoVehicle.operator_id == op.id).order_by(CargoVehicle.plate)).all()]


@operator.post("/vehicles", response_model=VehicleRead, status_code=201)
def add_vehicle(p: VehicleWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    if session.exec(select(CargoVehicle).where(CargoVehicle.operator_id == op.id, CargoVehicle.plate == p.plate.strip().upper())).first():
        raise HTTPException(status_code=409, detail="Un véhicule avec cette plaque existe déjà.")
    v = CargoVehicle(operator_id=op.id, plate=p.plate.strip().upper())
    _apply_vehicle(v, p)
    session.add(v)
    session.commit()
    session.refresh(v)
    return vehicle_read(session, v, True)


def _veh(session: Session, vid: int, op: TransportOperator) -> CargoVehicle:
    v = session.get(CargoVehicle, vid)
    if not v or v.operator_id != op.id:
        raise HTTPException(status_code=404, detail="Véhicule introuvable.")
    return v


@operator.put("/vehicles/{vid}", response_model=VehicleRead)
def edit_vehicle(vid: int, p: VehicleWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    v = _veh(session, vid, op)
    if p.capacity_kg < v.capacity_kg and session.exec(select(func.count(CargoTrip.id)).where(CargoTrip.vehicle_id == v.id, CargoTrip.status == "scheduled")).one():
        raise HTTPException(status_code=409, detail="Des départs sont programmés : la capacité ne peut plus baisser.")
    _apply_vehicle(v, p)
    session.add(v)
    session.commit()
    return vehicle_read(session, v, True)


@operator.delete("/vehicles/{vid}", status_code=204)
def del_vehicle(vid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    v = _veh(session, vid, op)
    if session.exec(select(func.count(CargoTrip.id)).where(CargoTrip.vehicle_id == v.id, CargoTrip.status.in_(("scheduled", "loading", "in_transit")))).one():
        raise HTTPException(status_code=409, detail="Ce véhicule a des départs en cours ou programmés.")
    if session.exec(select(func.count(CargoTrip.id)).where(CargoTrip.vehicle_id == v.id)).one():
        v.is_active = False
        session.add(v)
    else:
        session.delete(v)
    session.commit()


@operator.get("/trips", response_model=list[CargoTripRead])
def my_trips(scope: str = "active", session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    stmt = select(CargoTrip).where(CargoTrip.operator_id == op.id)
    stmt = stmt.where(CargoTrip.status.in_(("delivered", "cancelled"))) if scope == "history" else stmt.where(CargoTrip.status.in_(("scheduled", "loading", "in_transit")))
    return [trip_read(session, t, True) for t in session.exec(stmt.order_by(CargoTrip.departure_at.desc() if scope == "history" else CargoTrip.departure_at).limit(200)).all()]


@operator.post("/trips", response_model=CargoTripRead, status_code=201)
def add_trip(p: CargoTripWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    v = _veh(session, p.vehicle_id, op)
    if not v.is_active:
        raise HTTPException(status_code=422, detail="Ce véhicule est désactivé.")
    dep, arr = p.departure_at.replace(tzinfo=None), p.arrival_at.replace(tzinfo=None)
    if dep <= now_local():
        raise HTTPException(status_code=422, detail="Le départ doit être dans le futur.")
    gap = timedelta(hours=4)
    clash = next((x for x in session.exec(select(CargoTrip).where(CargoTrip.vehicle_id == v.id, CargoTrip.status.in_(("scheduled", "loading", "in_transit")))).all()
                  if x.departure_at < arr + gap and x.arrival_at + gap > dep), None)
    if clash:
        raise HTTPException(status_code=409, detail=f"Ce véhicule est déjà affecté à {clash.origin} → {clash.destination} le {clash.departure_at:%d/%m à %H:%M} (4 h de battement).")
    t = CargoTrip(operator_id=op.id, vehicle_id=v.id, origin=p.origin.strip(), destination=p.destination.strip(), departure_at=dep, arrival_at=arr,
                  price_per_kg=p.price_per_kg, min_kg=p.min_kg, notes=p.notes.strip(), current_location=p.origin.strip())
    session.add(t)
    session.commit()
    session.refresh(t)
    return trip_read(session, t, True)


def _mytrip(session: Session, tid: int, op: TransportOperator) -> CargoTrip:
    t = session.get(CargoTrip, tid)
    if not t or t.operator_id != op.id:
        raise HTTPException(status_code=404, detail="Départ introuvable.")
    return t


@operator.get("/trips/{tid}/bookings", response_model=list[CargoBookingRead])
def trip_bookings(tid: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    t = _mytrip(session, tid, op)
    rows = session.exec(select(CargoBooking).where(CargoBooking.trip_id == t.id, CargoBooking.paid_at != None).order_by(CargoBooking.created_at)).all()  # noqa: E711
    return [booking_read(session, b, role="operator") for b in rows]


FLOW = {"scheduled": ("loading", "cancelled"), "loading": ("in_transit",), "in_transit": ("in_transit", "delivered")}
LABELS = {"loading": "Chargement du camion", "in_transit": "En route", "delivered": "Livré"}


@operator.post("/trips/{tid}/status", response_model=CargoTripRead)
def set_status(tid: int, p: StatusUpdate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    t = _mytrip(session, tid, op)
    if p.status == "cancelled":
        if t.status != "scheduled":
            raise HTTPException(status_code=409, detail="Un départ en route ne peut plus être annulé.")
        t.status, t.cancel_reason = "cancelled", p.note or "Annulé par l'agence"
        for b in session.exec(select(CargoBooking).where(CargoBooking.trip_id == t.id, CargoBooking.status == "confirmed")).all():
            b.status = "cancelled_operator"
            _refund(session, b, b.total, "")
            _event(session, b, "cancelled_operator", "Départ annulé par l'agence — remboursement intégral", t.cancel_reason)
            notify_user(session, b.user_id, f"Départ annulé — {b.code}", f"Votre colis {b.origin} → {b.destination} est remboursé ({b.total:.2f} ZMW).")
        session.add(t)
        session.commit()
        return trip_read(session, t, True)
    if p.status not in FLOW.get(t.status, ()) :
        raise HTTPException(status_code=409, detail="Changement de statut impossible depuis l'état actuel.")
    if p.status == "delivered":
        raise HTTPException(status_code=422, detail="La livraison se valide colis par colis avec le code du destinataire.")
    t.status = p.status
    if p.location.strip():
        t.current_location = p.location.strip()
    elif p.status == "loading":
        t.current_location = t.origin
    session.add(t)
    label = LABELS[p.status] + (f" — {t.current_location}" if t.current_location else "")
    for b in session.exec(select(CargoBooking).where(CargoBooking.trip_id == t.id, CargoBooking.status.in_(("confirmed", "in_transit")))).all():
        if p.status == "in_transit":
            b.status = "in_transit"
            session.add(b)
        _event(session, b, p.status, label, p.note)
    session.commit()
    return trip_read(session, t, True)


@operator.post("/bookings/{code}/deliver", response_model=CargoBookingRead)
def deliver(code: str, p: DeliverBody, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    op = _op(session, user)
    b = session.exec(select(CargoBooking).where(CargoBooking.code == code.upper(), CargoBooking.operator_id == op.id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Colis introuvable.")
    if b.status != "in_transit":
        raise HTTPException(status_code=409, detail="Ce colis n'est pas en route.")
    if not secrets.compare_digest(b.delivery_code, p.code.strip()):
        raise HTTPException(status_code=422, detail="Code de livraison incorrect.")
    b.status, b.delivered_at, b.escrow_status = "delivered", datetime.utcnow(), "released"
    session.add(b)
    _event(session, b, "delivered", f"Livré à {b.receiver_name}", "Paiement versé à l'agence")
    t = session.get(CargoTrip, b.trip_id)
    left = session.exec(select(func.count(CargoBooking.id)).where(CargoBooking.trip_id == t.id, CargoBooking.status.in_(("confirmed", "in_transit")))).one()
    if not left:
        t.status = "delivered"
        session.add(t)
    notify_user(session, b.user_id, f"Colis livré — {b.code}", f"Votre colis a été remis à {b.receiver_name}.")
    session.commit()
    return booking_read(session, b, role="operator")
