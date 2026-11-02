import random
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, or_, select

from app.database import get_session
from app.deps import get_current_admin, get_current_partner, get_current_user
from app.models import PartnerApplication, User
from app.partnerhub.services import require_feature
from app.promos.models import Promo

router = APIRouter(prefix="/api/v1/promos", tags=["promos"])

PLACEMENTS = ("any", "app_home", "app_transport", "app_colis", "app_logement", "app_money")
THEMES = ("coffee", "gold", "ink", "cream")
MODULES = ("internal", "lodging", "transport", "shopping", "learning", "restaurant", "tourism", "money", "translate")
MAX_ACTIVE_PER_PARTNER = 5


def _read(p: Promo, full: bool = False) -> dict:
    d = {"id": p.id, "title": p.title, "body": p.body, "image_url": p.image_url, "cta_label": p.cta_label, "link": p.link, "theme": p.theme,
         "module": p.module, "placement": p.placement, "sponsored": p.owner_id is not None}
    if full:
        d.update(status=p.status, reject_reason=p.reject_reason, impressions=p.impressions, clicks=p.clicks, owner_id=p.owner_id,
                 starts_at=p.starts_at.isoformat() if p.starts_at else None, ends_at=p.ends_at.isoformat() if p.ends_at else None,
                 created_at=p.created_at.isoformat())
    return d


class PromoIn(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    body: str = Field(default="", max_length=200)
    image_url: str = Field(default="", max_length=300)
    cta_label: str = Field(default="Découvrir", max_length=24)
    link: str = Field(min_length=1, max_length=300)
    theme: str = "coffee"
    module: str = "internal"
    placement: str = "any"
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    @field_validator("link", "image_url")
    @classmethod
    def safe_url(cls, v: str) -> str:
        v = v.strip()
        if v and not (v.startswith("/") and not v.startswith("//")) and not v.startswith("https://"):
            raise ValueError("Lien invalide : chemin interne (/…) ou https:// uniquement.")
        return v

    @field_validator("theme")
    @classmethod
    def theme_ok(cls, v: str) -> str:
        if v not in THEMES:
            raise ValueError("Thème inconnu.")
        return v

    @field_validator("placement")
    @classmethod
    def placement_ok(cls, v: str) -> str:
        if v not in PLACEMENTS:
            raise ValueError("Emplacement inconnu.")
        return v

    @field_validator("module")
    @classmethod
    def module_ok(cls, v: str) -> str:
        if v not in MODULES:
            raise ValueError("Module inconnu.")
        return v


def _live(session: Session, placement: str):
    now = datetime.utcnow()
    q = select(Promo).where(Promo.status == "active", or_(Promo.starts_at == None, Promo.starts_at <= now),  # noqa: E711
                            or_(Promo.ends_at == None, Promo.ends_at >= now))  # noqa: E711
    if placement != "any":
        q = q.where(or_(Promo.placement == placement, Promo.placement == "any"))
    return session.exec(q).all()


@router.get("")
def serve(placement: str = Query(default="app_home"), limit: int = Query(default=3, ge=1, le=6), session: Session = Depends(get_session)):
    """Publicités à afficher : au moins une de H-Company si elle existe, le reste tiré au hasard parmi les partenaires."""
    rows = _live(session, placement)
    house = [p for p in rows if p.owner_id is None]
    spons = [p for p in rows if p.owner_id is not None]
    random.shuffle(house); random.shuffle(spons)
    picked = (house[:1] + spons)[:limit]
    if len(picked) < limit:
        picked += [p for p in house[1:] if p not in picked][: limit - len(picked)]
    return [_read(p) for p in picked]


@router.post("/{promo_id}/impression", status_code=204)
def impression(promo_id: int, session: Session = Depends(get_session)):
    p = session.get(Promo, promo_id)
    if p and p.status == "active":
        p.impressions += 1
        session.add(p); session.commit()


@router.post("/{promo_id}/click", status_code=204)
def click(promo_id: int, session: Session = Depends(get_session)):
    p = session.get(Promo, promo_id)
    if p and p.status == "active":
        p.clicks += 1
        session.add(p); session.commit()


# --- Partenaires (fonction payante « promotion ») ---------------------------

@router.get("/mine")
def mine(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Promo).where(Promo.owner_id == user.id).order_by(Promo.created_at.desc())).all()
    return [_read(p, True) for p in rows]


@router.post("/mine", status_code=201)
def create_mine(payload: PromoIn, session: Session = Depends(get_session), partner: PartnerApplication = Depends(get_current_partner), user: User = Depends(get_current_user)):
    require_feature(session, user, "promotion")
    live = session.exec(select(Promo).where(Promo.owner_id == user.id, Promo.status.in_(["pending", "active", "paused"]))).all()
    if len(live) >= MAX_ACTIVE_PER_PARTNER:
        raise HTTPException(status_code=409, detail=f"Vous pouvez avoir {MAX_ACTIVE_PER_PARTNER} promotions en cours. Supprimez-en une.")
    p = Promo(owner_id=user.id, status="pending", **payload.model_dump())
    session.add(p); session.commit(); session.refresh(p)
    return _read(p, True)


def _own(session: Session, promo_id: int, user: User) -> Promo:
    p = session.get(Promo, promo_id)
    if not p or p.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Promotion introuvable.")
    return p


@router.put("/mine/{promo_id}")
def update_mine(promo_id: int, payload: PromoIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    require_feature(session, user, "promotion")
    p = _own(session, promo_id, user)
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    p.status, p.reject_reason, p.updated_at = "pending", "", datetime.utcnow()  # toute modification repasse en validation
    session.add(p); session.commit()
    return _read(p, True)


class StatePatch(BaseModel):
    paused: bool


@router.patch("/mine/{promo_id}")
def pause_mine(promo_id: int, payload: StatePatch, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _own(session, promo_id, user)
    if p.status not in ("active", "paused"):
        raise HTTPException(status_code=409, detail="Seule une promotion validée peut être mise en pause.")
    p.status = "paused" if payload.paused else "active"
    session.add(p); session.commit()
    return _read(p, True)


@router.delete("/mine/{promo_id}", status_code=204)
def delete_mine(promo_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    session.delete(_own(session, promo_id, user)); session.commit()


# --- Admin ------------------------------------------------------------------

@router.get("/admin/all")
def admin_list(status: Optional[str] = None, session: Session = Depends(get_session), admin: User = Depends(get_current_admin)):
    q = select(Promo)
    if status:
        q = q.where(Promo.status == status)
    out = []
    for p in session.exec(q.order_by(Promo.created_at.desc()).limit(300)).all():
        owner = session.get(User, p.owner_id) if p.owner_id else None
        out.append({**_read(p, True), "owner": (owner.full_name or owner.email) if owner else "H-Company"})
    return out


@router.post("/admin", status_code=201)
def admin_create(payload: PromoIn, session: Session = Depends(get_session), admin: User = Depends(get_current_admin)):
    p = Promo(owner_id=None, status="active", **payload.model_dump())
    session.add(p); session.commit(); session.refresh(p)
    return _read(p, True)


class Decision(BaseModel):
    status: str = Field(pattern="^(active|rejected|paused)$")
    reason: str = Field(default="", max_length=200)


@router.patch("/admin/{promo_id}")
def admin_decide(promo_id: int, payload: Decision, session: Session = Depends(get_session), admin: User = Depends(get_current_admin)):
    p = session.get(Promo, promo_id)
    if not p:
        raise HTTPException(status_code=404, detail="Promotion introuvable.")
    if payload.status == "rejected" and not payload.reason.strip():
        raise HTTPException(status_code=422, detail="Indiquez le motif du refus.")
    p.status, p.reject_reason, p.updated_at = payload.status, payload.reason.strip() if payload.status == "rejected" else "", datetime.utcnow()
    session.add(p); session.commit()
    return _read(p, True)


@router.delete("/admin/{promo_id}", status_code=204)
def admin_delete(promo_id: int, session: Session = Depends(get_session), admin: User = Depends(get_current_admin)):
    p = session.get(Promo, promo_id)
    if p:
        session.delete(p); session.commit()
