import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_admin, get_current_agent, get_current_user
from app.models import ServiceCatalogItem, ServiceSubscription, SubscriptionStatus, User
from app.schemas import (
    MyServicesSummary,
    ServiceCatalogItemCreate,
    ServiceCatalogItemRead,
    ServiceCatalogItemUpdate,
    ServiceSubscriptionAdminRead,
    ServiceSubscriptionCreate,
    ServiceSubscriptionRead,
    ServiceSubscriptionStatusUpdate,
)
from app.services.notifications import create_in_app_notification, send_email

router = APIRouter(prefix="/api/v1/services", tags=["services"])

# Catalogue des services H-Company proposés aux CLIENTS (H-Transport,
# H-Restaurant, H-Learning...) — désormais géré en base (ServiceCatalogItem),
# éditable depuis l'admin (libellés FR/EN, description, logo, activation),
# plutôt que codé en dur ici. Voir la migration b4f7a1c9d2e6 pour le
# catalogue de départ.

# Fichiers statiques (logos) — servis via le montage StaticFiles dans
# app/main.py sous /uploads. LOGO_DIR est créé au chargement du module pour
# que l'upload fonctionne dès le premier déploiement sans étape manuelle.
UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads"
LOGO_DIR = UPLOAD_ROOT / "service-logos"
LOGO_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "image/webp": ".webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 Mo

STATUS_LABELS = {
    SubscriptionStatus.active: "activé",
    SubscriptionStatus.rejected: "refusé",
    SubscriptionStatus.suspended: "suspendu",
    SubscriptionStatus.requested: "remis en attente",
}


def _catalog_read(item: ServiceCatalogItem) -> ServiceCatalogItemRead:
    return ServiceCatalogItemRead(
        id=item.id,
        key=item.key,
        label_fr=item.label_fr,
        label_en=item.label_en,
        description_fr=item.description_fr,
        description_en=item.description_en,
        logo_url=f"/uploads/{item.logo_path}" if item.logo_path else None,
        disabled=item.disabled,
        sort_order=item.sort_order,
    )


def _get_catalog_item(session: Session, key: str) -> Optional[ServiceCatalogItem]:
    return session.exec(select(ServiceCatalogItem).where(ServiceCatalogItem.key == key)).first()


@router.get("/catalog", response_model=List[ServiceCatalogItemRead])
def get_catalog(session: Session = Depends(get_session)):
    """Catalogue public des services H-Company — alimente les sections
    'Explore our services' / formulaire d'abonnement côté site."""
    items = session.exec(select(ServiceCatalogItem).order_by(ServiceCatalogItem.sort_order)).all()
    return [_catalog_read(i) for i in items]


def _with_user(session: Session, sub: ServiceSubscription) -> ServiceSubscriptionAdminRead:
    user = session.get(User, sub.user_id)
    return ServiceSubscriptionAdminRead(
        id=sub.id,
        service_key=sub.service_key,
        message=sub.message,
        status=sub.status,
        admin_note=sub.admin_note,
        created_at=sub.created_at,
        reviewed_at=sub.reviewed_at,
        activated_at=sub.activated_at,
        user_id=sub.user_id,
        user_full_name=user.full_name if user else None,
        user_email=user.email if user else None,
    )


@router.post("/me", response_model=ServiceSubscriptionRead, status_code=status.HTTP_201_CREATED)
def request_subscription(
    payload: ServiceSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    item = _get_catalog_item(session, payload.service_key)
    if not item:
        raise HTTPException(status_code=400, detail="Service inconnu.")
    if item.disabled:
        raise HTTPException(status_code=400, detail="Ce service n'est pas encore disponible.")

    existing = session.exec(
        select(ServiceSubscription).where(
            ServiceSubscription.user_id == current_user.id,
            ServiceSubscription.service_key == payload.service_key,
            ServiceSubscription.status.in_(
                [SubscriptionStatus.requested, SubscriptionStatus.active]
            ),
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Vous avez déjà une demande en cours ou active pour ce service.",
        )

    sub = ServiceSubscription(
        user_id=current_user.id,
        service_key=payload.service_key,
        message=payload.message,
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return sub


@router.get("/me", response_model=MyServicesSummary)
def my_subscriptions(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    subs = session.exec(
        select(ServiceSubscription)
        .where(ServiceSubscription.user_id == current_user.id)
        .order_by(ServiceSubscription.created_at.desc())
    ).all()
    return MyServicesSummary(
        active_count=sum(1 for s in subs if s.status == SubscriptionStatus.active),
        total_count=len(subs),
        subscriptions=subs,
    )


@router.get("/admin/pending", response_model=List[ServiceSubscriptionAdminRead])
def admin_pending_subscriptions(
    session: Session = Depends(get_session),
    # Lecture seule ouverte aux agents (analyse/maintenance) — seule
    # l'écriture (statut) reste réservée à l'admin ci-dessous.
    _agent: User = Depends(get_current_agent),
):
    subs = session.exec(
        select(ServiceSubscription)
        .where(ServiceSubscription.status == SubscriptionStatus.requested)
        .order_by(ServiceSubscription.created_at.asc())
    ).all()
    return [_with_user(session, s) for s in subs]


@router.get("/admin", response_model=List[ServiceSubscriptionAdminRead])
def admin_list_subscriptions(
    session: Session = Depends(get_session),
    _agent: User = Depends(get_current_agent),
):
    subs = session.exec(
        select(ServiceSubscription).order_by(ServiceSubscription.created_at.desc())
    ).all()
    return [_with_user(session, s) for s in subs]


@router.patch("/admin/{subscription_id}/status", response_model=ServiceSubscriptionAdminRead)
def admin_update_subscription_status(
    subscription_id: int,
    payload: ServiceSubscriptionStatusUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    sub = session.get(ServiceSubscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Demande introuvable.")

    sub.status = payload.status
    if payload.admin_note is not None:
        sub.admin_note = payload.admin_note
    sub.reviewed_at = datetime.utcnow()
    if payload.status == SubscriptionStatus.active and not sub.activated_at:
        sub.activated_at = datetime.utcnow()
    session.add(sub)
    session.flush()

    item = _get_catalog_item(session, sub.service_key)
    label = item.label_fr if item else sub.service_key
    status_label = STATUS_LABELS.get(payload.status, payload.status.value)

    create_in_app_notification(
        session,
        user_id=sub.user_id,
        title=f"{label} : {status_label}",
        body=f"Votre demande d'abonnement à {label} a été {status_label}."
        + (f" Note : {payload.admin_note}" if payload.admin_note else ""),
    )
    session.commit()
    session.refresh(sub)

    user = session.get(User, sub.user_id)
    if user:
        send_email(
            user.email,
            f"H-Company — {label}",
            f"Bonjour {user.full_name or ''},\n\n"
            f"Votre demande d'abonnement à {label} a été {status_label}."
            + (f"\n\nNote de l'équipe : {payload.admin_note}" if payload.admin_note else ""),
        )

    return _with_user(session, sub)


# --- Gestion du catalogue (admin) ---

@router.get("/admin/catalog", response_model=List[ServiceCatalogItemRead])
def admin_list_catalog(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    """Comme /catalog mais inclut aussi les services désactivés — pour que
    l'admin puisse les retrouver et les réactiver."""
    items = session.exec(select(ServiceCatalogItem).order_by(ServiceCatalogItem.sort_order)).all()
    return [_catalog_read(i) for i in items]


@router.post("/admin/catalog", response_model=ServiceCatalogItemRead, status_code=status.HTTP_201_CREATED)
def admin_create_catalog_item(
    payload: ServiceCatalogItemCreate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    if _get_catalog_item(session, payload.key):
        raise HTTPException(status_code=409, detail="Un service avec cette clé existe déjà.")
    item = ServiceCatalogItem(**payload.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return _catalog_read(item)


@router.patch("/admin/catalog/{item_id}", response_model=ServiceCatalogItemRead)
def admin_update_catalog_item(
    item_id: int,
    payload: ServiceCatalogItemUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    item = session.get(ServiceCatalogItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _catalog_read(item)


@router.delete("/admin/catalog/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_catalog_item(
    item_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    item = session.get(ServiceCatalogItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    if item.logo_path:
        logo_file = UPLOAD_ROOT / item.logo_path
        if logo_file.exists():
            logo_file.unlink()
    session.delete(item)
    session.commit()
    return None


@router.post("/admin/catalog/{item_id}/logo", response_model=ServiceCatalogItemRead)
def admin_upload_catalog_logo(
    item_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    item = session.get(ServiceCatalogItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Service introuvable.")

    ext = ALLOWED_LOGO_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(
            status_code=400,
            detail="Format d'image non supporté (PNG, JPEG, SVG ou WebP uniquement).",
        )

    contents = file.file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="Le logo ne doit pas dépasser 2 Mo.")

    # Ancien fichier supprimé s'il existe (évite d'accumuler des logos morts
    # à chaque remplacement, notamment si l'extension change).
    if item.logo_path:
        old_file = UPLOAD_ROOT / item.logo_path
        if old_file.exists():
            old_file.unlink()

    filename = f"{item.key}-{uuid.uuid4().hex[:8]}{ext}"
    dest = LOGO_DIR / filename
    with open(dest, "wb") as f:
        f.write(contents)

    item.logo_path = f"service-logos/{filename}"
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _catalog_read(item)
