import hashlib
import re
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.models import PartnerModule, User
from app.partnerhub.models import PartnerBranding, PartnerFeature, PartnerPlan

STANDARD_MAX_MODULES = 2

# Fonctions gratuites : toujours disponibles (publier, inventaire, commandes, revenus).
FREE_FEATURES = ["publish", "inventory", "orders", "revenue"]
# Fonctions payantes : prix de départ à valider par H-Company. Incluses dans le plan Pro.
PAID_FEATURES = {
    "promotion": {"label": "Promotions & mise en avant", "price_usd": 15, "per": "mois"},
    "branding": {"label": "Dashboard à votre nom (splash, logo, couleur)", "price_usd": 10, "per": "mois"},
    "lodge_boost": {"label": "H-Logement Premium : vos annonces en tête et badge « Recommandé »", "price_usd": 12, "per": "mois"},
    "transport_boost": {"label": "H-Transport Premium : vos départs en tête et badge « Recommandé »", "price_usd": 12, "per": "mois"},
}
PLAN_PRO_PRICE_USD = 29  # par mois — à valider


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_plan(session: Session, user_id: int) -> PartnerPlan:
    row = session.get(PartnerPlan, user_id)
    if row is None:
        row = PartnerPlan(user_id=user_id)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def is_pro(plan: PartnerPlan) -> bool:
    return plan.plan == "pro" and (plan.pro_until is None or plan.pro_until > datetime.utcnow())


def active_module_count(session: Session, user_id: int) -> int:
    return session.exec(select(func.count(PartnerModule.id)).where(PartnerModule.user_id == user_id, PartnerModule.active == True)).one()  # noqa: E712


def limit_for(session: Session, user_id: int) -> Optional[int]:
    return None if is_pro(get_plan(session, user_id)) else STANDARD_MAX_MODULES


def check_can_activate(session: Session, user: User, module: str) -> None:
    row = session.exec(select(PartnerModule).where(PartnerModule.user_id == user.id, PartnerModule.module == module)).first()
    if row and row.active:
        return
    lim = limit_for(session, user.id)
    if lim is not None and active_module_count(session, user.id) >= lim:
        raise HTTPException(status_code=402, detail=f"Le plan Standard permet {lim} apps. Passez au plan Pro pour en activer davantage.")


def feature_active(session: Session, user_id: int, key: str) -> bool:
    if key in FREE_FEATURES:
        return True
    if key not in PAID_FEATURES:
        return False
    if is_pro(get_plan(session, user_id)):
        return True
    row = session.exec(select(PartnerFeature).where(PartnerFeature.user_id == user_id, PartnerFeature.key == key)).first()
    return bool(row and row.status == "active")


def require_feature(session: Session, user: User, key: str) -> None:
    if not feature_active(session, user.id, key):
        raise HTTPException(status_code=402, detail="Fonction payante : débloquez-la depuis votre dashboard.")


HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def branding_of(session: Session, user_id: int) -> Optional[PartnerBranding]:
    return session.get(PartnerBranding, user_id)


def boosted_users(session: Session, key: str) -> set:
    """Utilisateurs dont la fonction premium `key` est active (ou qui sont en plan Pro, qui inclut tout)."""
    ids = {r.user_id for r in session.exec(select(PartnerFeature).where(PartnerFeature.key == key, PartnerFeature.status == "active")).all()}
    for plan in session.exec(select(PartnerPlan).where(PartnerPlan.plan == "pro")).all():
        if is_pro(plan):
            ids.add(plan.user_id)
    return ids
