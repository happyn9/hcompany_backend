"""Dashboard partenaire unique : plan, fonctions, marque, revenus par app, invitation, connexion par code."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.admin_security import require_admin_confirmed
from app.deps import get_current_admin, get_current_partner, get_current_user
from app.models import PartnerApplication, PartnerModule, User
from app.partnerhub import services as svc
from app.partnerhub.models import ApplicationInvite, PartnerBranding, PartnerFeature, PartnerPlan
from app.routers.partner_modules import MODULES, _profile_exists
from app.services.notifications.email_channel import send_email

router = APIRouter(prefix="/api/v1/partner/hub", tags=["partner-hub"])
admin_router = APIRouter(prefix="/api/v1/partner/hub/admin", tags=["partner-hub-admin"])
invite_router = APIRouter(prefix="/api/v1/partner/invites", tags=["partner-invites"])


# --- Revenus par app (estimation à partir des commandes/réservations validées) ---

def module_revenue(session: Session, user: User, module: str) -> Optional[dict]:
    """Retourne {gross, net, count} ou None si le module n'a pas de revenu suivi."""
    from sqlmodel import func
    if module == "shopping":
        from app.shopping.models import Shop, ShopOrder
        ids = [s.id for s in session.exec(select(Shop).where(Shop.owner_id == user.id)).all()]
        if not ids:
            return {"gross": 0.0, "net": 0.0, "count": 0}
        rows = session.exec(select(ShopOrder).where(ShopOrder.shop_id.in_(ids), ShopOrder.status.notin_(["pending_payment", "cancelled", "refunded"]))).all()
        return {"gross": round(sum(o.total for o in rows), 2), "net": round(sum(o.seller_net for o in rows), 2), "count": len(rows)}
    if module == "lodging":
        from app.lodging.models import Booking, LodgeHost
        host = session.exec(select(LodgeHost).where(LodgeHost.user_id == user.id)).first()
        if not host:
            return {"gross": 0.0, "net": 0.0, "count": 0}
        rows = session.exec(select(Booking).where(Booking.host_id == host.id, Booking.status.notin_(["pending_host", "declined", "cancelled", "expired"]))).all()
        return {"gross": round(sum(b.total for b in rows), 2), "net": round(sum(b.host_net for b in rows), 2), "count": len(rows)}
    if module == "tourism":
        from app.tourism.models import Tour, TourBooking
        ids = [t.id for t in session.exec(select(Tour).where(Tour.owner_id == user.id)).all()]
        if not ids:
            return {"gross": 0.0, "net": 0.0, "count": 0}
        rows = session.exec(select(TourBooking).where(TourBooking.tour_id.in_(ids), TourBooking.status.notin_(["pending", "declined", "cancelled"]))).all()
        total = round(sum(b.total for b in rows), 2)
        return {"gross": total, "net": total, "count": len(rows)}
    if module == "transport":
        from app.transport.models import TransportBooking, TransportOperator
        op = session.exec(select(TransportOperator).where(TransportOperator.user_id == user.id)).first()
        if not op:
            return {"gross": 0.0, "net": 0.0, "count": 0}
        rows = session.exec(select(TransportBooking).where(TransportBooking.operator_id == op.id, TransportBooking.status.notin_(["pending_payment", "cancelled", "declined"]))).all()
        total = round(sum(b.total for b in rows), 2)
        return {"gross": total, "net": total, "count": len(rows)}
    return None


def _hub(session: Session, user: User) -> dict:
    plan = svc.get_plan(session, user.id)
    pro = svc.is_pro(plan)
    lim = svc.limit_for(session, user.id)
    rows = {r.module: r for r in session.exec(select(PartnerModule).where(PartnerModule.user_id == user.id)).all()}
    feats = {f.key: f for f in session.exec(select(PartnerFeature).where(PartnerFeature.user_id == user.id)).all()}
    b = svc.branding_of(session, user.id)
    apps = []
    for m in MODULES:
        active = bool(rows.get(m) and rows[m].active)
        apps.append({"key": m, "active": active, "has_profile": _profile_exists(session, user, m), "revenue": module_revenue(session, user, m) if active else None})
    return {
        "plan": {"name": "pro" if pro else "standard", "max_apps": lim, "pro_until": plan.pro_until.isoformat() if plan.pro_until else None,
                 "upgrade_requested": bool(plan.upgrade_requested_at and not pro), "pro_price_usd": svc.PLAN_PRO_PRICE_USD},
        "apps_used": svc.active_module_count(session, user.id),
        "apps": apps,
        "features": {
            "free": svc.FREE_FEATURES,
            "paid": [{"key": k, **v, "status": "active" if svc.feature_active(session, user.id, k) else (feats[k].status if k in feats else "locked"),
                      "included_in_pro": True} for k, v in svc.PAID_FEATURES.items()],
        },
        "branding": {"display_name": b.display_name, "tagline": b.tagline, "accent": b.accent, "logo_url": b.logo_url} if b and svc.feature_active(session, user.id, "branding") else None,
        "partner_code": user.partner_code,
        "totals": {"net": round(sum((a["revenue"] or {}).get("net", 0) for a in apps), 2), "count": sum((a["revenue"] or {}).get("count", 0) for a in apps)},
    }


@router.get("")
def hub(session: Session = Depends(get_session), partner: PartnerApplication = Depends(get_current_partner), user: User = Depends(get_current_user)):
    return _hub(session, user)


@router.post("/upgrade", status_code=202)
def request_pro(session: Session = Depends(get_session), partner: PartnerApplication = Depends(get_current_partner), user: User = Depends(get_current_user)):
    plan = svc.get_plan(session, user.id)
    if svc.is_pro(plan):
        raise HTTPException(status_code=409, detail="Vous êtes déjà en plan Pro.")
    plan.upgrade_requested_at = datetime.utcnow()
    session.add(plan)
    session.commit()
    return _hub(session, user)


@router.post("/features/{key}/unlock", status_code=202)
def request_feature(key: str, session: Session = Depends(get_session), partner: PartnerApplication = Depends(get_current_partner), user: User = Depends(get_current_user)):
    if key not in svc.PAID_FEATURES:
        raise HTTPException(status_code=404, detail="Fonction inconnue.")
    if svc.feature_active(session, user.id, key):
        raise HTTPException(status_code=409, detail="Déjà débloquée.")
    row = session.exec(select(PartnerFeature).where(PartnerFeature.user_id == user.id, PartnerFeature.key == key)).first()
    if row is None:
        session.add(PartnerFeature(user_id=user.id, key=key))
        session.commit()
    return _hub(session, user)


class BrandingIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    tagline: str = Field(default="", max_length=120)
    accent: str = Field(default="", max_length=7)
    logo_url: str = Field(default="", max_length=300)


@router.put("/branding")
def set_branding(payload: BrandingIn, session: Session = Depends(get_session), partner: PartnerApplication = Depends(get_current_partner), user: User = Depends(get_current_user)):
    svc.require_feature(session, user, "branding")
    if payload.accent and not svc.HEX.match(payload.accent):
        raise HTTPException(status_code=422, detail="Couleur au format #RRGGBB.")
    if payload.logo_url and not payload.logo_url.startswith(("/", "https://")):
        raise HTTPException(status_code=422, detail="Lien du logo invalide.")
    b = session.get(PartnerBranding, user.id) or PartnerBranding(user_id=user.id)
    b.display_name, b.tagline, b.accent, b.logo_url, b.updated_at = payload.display_name.strip(), payload.tagline.strip(), payload.accent, payload.logo_url, datetime.utcnow()
    session.add(b)
    session.commit()
    return _hub(session, user)


# --- Administration : plans, fonctions, invitations ---

class PlanIn(BaseModel):
    plan: str = Field(pattern="^(standard|pro)$")
    months: Optional[int] = Field(default=None, ge=1, le=36)


@admin_router.get("/requests")
def pending_requests(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    plans = session.exec(select(PartnerPlan).where(PartnerPlan.upgrade_requested_at != None, PartnerPlan.plan != "pro")).all()  # noqa: E711
    feats = session.exec(select(PartnerFeature).where(PartnerFeature.status == "requested")).all()
    def who(uid):
        u = session.get(User, uid)
        return {"user_id": uid, "email": u.email if u else "", "name": u.full_name if u else "", "partner_code": u.partner_code if u else None}
    return {"upgrades": [{**who(p.user_id), "requested_at": p.upgrade_requested_at.isoformat()} for p in plans],
            "features": [{**who(f.user_id), "id": f.id, "key": f.key, "requested_at": f.requested_at.isoformat()} for f in feats]}


@admin_router.put("/users/{user_id}/plan")
def set_plan(user_id: int, payload: PlanIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    if session.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    plan = svc.get_plan(session, user_id)
    plan.plan = payload.plan
    plan.pro_until = datetime.utcnow() + timedelta(days=30 * payload.months) if payload.plan == "pro" and payload.months else None
    plan.upgrade_requested_at = None
    plan.updated_at = datetime.utcnow()
    session.add(plan)
    session.commit()
    return {"user_id": user_id, "plan": plan.plan, "pro_until": plan.pro_until.isoformat() if plan.pro_until else None}


class FeatureDecision(BaseModel):
    status: str = Field(pattern="^(active|off)$")
    reference: str = Field(default="", max_length=80)


@admin_router.put("/features/{feature_id}")
def decide_feature(feature_id: int, payload: FeatureDecision, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    f = session.get(PartnerFeature, feature_id)
    if f is None:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    f.status, f.reference = payload.status, payload.reference
    f.unlocked_at = datetime.utcnow() if payload.status == "active" else None
    session.add(f)
    session.commit()
    return {"id": f.id, "key": f.key, "status": f.status}


class InviteIn(BaseModel):
    email: EmailStr
    note: str = Field(default="", max_length=300)
    days: int = Field(default=14, ge=1, le=60)


@admin_router.post("/invites", status_code=201)
def create_invite(payload: InviteIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    token = secrets.token_urlsafe(24)
    inv = ApplicationInvite(token_hash=svc.hash_token(token), email=payload.email.lower(), note=payload.note, created_by=admin.id,
                            expires_at=datetime.utcnow() + timedelta(days=payload.days))
    session.add(inv)
    session.commit()
    link = f"{settings.frontend_url.rstrip('/')}/demande-partenariat?token={token}"
    send_email(payload.email, "H-Company : votre demande de partenariat",
               f"Bonjour,\n\nPour rejoindre H-Company, remplissez le formulaire de partenariat (identité et activité) :\n{link}\n\n"
               f"Ce lien est personnel et valable {payload.days} jours.\n\nL'équipe H-Company")
    return {"id": inv.id, "email": inv.email, "link": link, "expires_at": inv.expires_at.isoformat()}


@admin_router.get("/invites")
def list_invites(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    rows = session.exec(select(ApplicationInvite).order_by(ApplicationInvite.created_at.desc()).limit(200)).all()
    return [{"id": i.id, "email": i.email, "created_at": i.created_at.isoformat(), "expires_at": i.expires_at.isoformat(),
             "used": bool(i.used_at), "expired": i.expires_at < datetime.utcnow() and not i.used_at} for i in rows]


def find_valid_invite(session: Session, token: str) -> ApplicationInvite:
    inv = session.exec(select(ApplicationInvite).where(ApplicationInvite.token_hash == svc.hash_token(token or ""))).first()
    if not inv or inv.used_at or inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Ce lien n'est plus valide. Demandez-en un nouveau à H-Company.")
    return inv


@invite_router.get("/{token}")
def check_invite(token: str, session: Session = Depends(get_session)):
    inv = find_valid_invite(session, token)
    return {"email": inv.email, "expires_at": inv.expires_at.isoformat()}
