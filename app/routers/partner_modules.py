"""Centralisation du partenariat : un seul dossier partenaire, puis le partenaire
débloque lui-même ses modules (H-Logement, H-Transport, H-Shopping, H-Learning)
depuis son dashboard — plus d'inscription séparée."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.lodging.models import LodgeHost
from app.models import PartnerApplication, PartnerModule, PartnerStatus, User
from app.restaurant.models import Restaurant
from app.shopping.models import Shop
from app.transport.models import TransportOperator

router = APIRouter(prefix="/api/v1/partner/modules", tags=["partner-modules"])

MODULES = ("lodging", "transport", "shopping", "learning", "restaurant")


def _application(session: Session, user: User) -> Optional[PartnerApplication]:
    return session.exec(select(PartnerApplication).where(PartnerApplication.user_id == user.id)).first()


def module_active(session: Session, user: User, module: str) -> bool:
    row = session.exec(select(PartnerModule).where(PartnerModule.user_id == user.id, PartnerModule.module == module)).first()
    return bool(row and row.active)


def require_module(session: Session, user: User, module: str) -> None:
    """Création d'un profil (hôte, agence, boutique) : réservée aux partenaires
    qui ont débloqué le module depuis leur dashboard."""
    if not module_active(session, user, module):
        raise HTTPException(status_code=403, detail="Activez d'abord ce module depuis votre tableau de bord partenaire.")


def _profile_exists(session: Session, user: User, module: str) -> bool:
    if module == "lodging":
        return session.exec(select(LodgeHost).where(LodgeHost.user_id == user.id)).first() is not None
    if module == "transport":
        return session.exec(select(TransportOperator).where(TransportOperator.user_id == user.id)).first() is not None
    if module == "shopping":
        return session.exec(select(Shop).where(Shop.owner_id == user.id)).first() is not None
    if module == "restaurant":
        return session.exec(select(Restaurant).where(Restaurant.owner_id == user.id)).first() is not None
    return False


def _state(session: Session, user: User) -> dict:
    app = _application(session, user)
    rows = {r.module: r for r in session.exec(select(PartnerModule).where(PartnerModule.user_id == user.id)).all()}
    return {
        "partner_status": app.status.value if app else "none",
        "modules": [
            {
                "key": m,
                "active": bool(rows.get(m) and rows[m].active),
                "activated_at": rows[m].activated_at.isoformat() if rows.get(m) and rows[m].active else None,
                "has_profile": _profile_exists(session, user, m),
            }
            for m in MODULES
        ],
    }


def _bootstrap(session: Session, user: User, app: PartnerApplication, module: str) -> None:
    """Crée d'office le profil à partir du dossier partenaire (déjà vérifié) :
    pas de second formulaire pour le logement et le transport."""
    if module == "lodging" and not _profile_exists(session, user, module):
        session.add(LodgeHost(user_id=user.id, display_name=app.company[:120], phone=app.phone or "", whatsapp=app.phone or "", partner_application_id=app.id))
    elif module == "transport" and not _profile_exists(session, user, module):
        session.add(TransportOperator(
            user_id=user.id, name=app.company[:120], phone=app.phone or "", whatsapp=app.phone or "", city="",
            partner_application_id=app.id, status="approved", is_verified=True, approved_at=datetime.utcnow(),
        ))


@router.get("")
def list_modules(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return _state(session, user)


@router.post("/{module}/activate")
def activate(module: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if module not in MODULES:
        raise HTTPException(status_code=404, detail="Module inconnu.")
    app = _application(session, user)
    if not app or app.status != PartnerStatus.approved:
        raise HTTPException(status_code=403, detail="Votre partenariat doit d'abord être accepté par H-Company.")
    row = session.exec(select(PartnerModule).where(PartnerModule.user_id == user.id, PartnerModule.module == module)).first()
    if row:
        row.active, row.deactivated_at = True, None
        if not row.activated_at:
            row.activated_at = datetime.utcnow()
    else:
        row = PartnerModule(user_id=user.id, module=module)
    session.add(row)
    _bootstrap(session, user, app, module)
    session.commit()
    return _state(session, user)


@router.post("/{module}/deactivate")
def deactivate(module: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    row = session.exec(select(PartnerModule).where(PartnerModule.user_id == user.id, PartnerModule.module == module)).first()
    if not row or not row.active:
        raise HTTPException(status_code=404, detail="Module non activé.")
    row.active, row.deactivated_at = False, datetime.utcnow()
    session.add(row)
    session.commit()
    return _state(session, user)
