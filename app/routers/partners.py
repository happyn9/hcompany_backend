import logging
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import settings
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_admin, get_current_agent, get_current_partner, get_current_user
from app.models import (
    AccountStatus,
    ActivityCategory,
    AgentReviewStatus,
    AppStatus,
    Contract,
    ContractStatus,
    Offer,
    OfferStatus,
    PartnerActivity,
    PartnerApplication,
    PartnerApp,
    PartnerStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    RevenueEntry,
    User,
    UserRole,
)
from app.schemas import (
    AccountStatusRead,
    AccountStatusUpdate,
    ActivityCategoryCount,
    AgentReviewDecision,
    BillingSummary,
    ContractRead,
    ContractSign,
    ContractUpdate,
    OfferCreate,
    OfferRead,
    PartnerActivityRead,
    PartnerAppCreate,
    PartnerAppRead,
    PartnerAppStatusUpdate,
    PartnerApplicationAgentRead,
    PartnerApplicationRead,
    PartnerStats,
    PartnerStatusUpdate,
    PaymentCreate,
    PaymentRead,
    RevenueEntryCreate,
    RevenueEntryRead,
    UserLookupRead,
    UserRoleUpdate,
)
from app.security import hash_password
from app.services.accounts import (
    generate_partner_code,
    generate_partner_password,
    get_or_create_user,
    notify_new_dashboard_access,
    notify_partner_approved,
    notify_partner_credentials,
)
from app.services.notifications import create_in_app_notification, send_email
from app.services.payments import charge as charge_payment

router = APIRouter(prefix="/api/v1/partners", tags=["partners"])
logger = logging.getLogger("hcompany.partners")

# --- Stockage KYC (pièces d'identité) ---
# Volontairement HORS du dossier "uploads/" monté en StaticFiles dans
# main.py — une pièce d'identité ne doit jamais être accessible par une URL
# publique. Seul l'endpoint /agent/{id}/document (agent ou admin authentifié)
# peut la lire, après vérification du rôle.
PRIVATE_UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "private_uploads"
KYC_DIR = PRIVATE_UPLOAD_ROOT / "kyc"
KYC_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_ID_DOCUMENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "application/pdf": ".pdf",
}
MAX_ID_DOCUMENT_SIZE = 5 * 1024 * 1024  # 5 Mo
VALID_ID_DOCUMENT_TYPES = {"national_id", "voter_card", "passport"}

DEFAULT_CONTRACT_TEMPLATE = """\
CONTRAT DE PARTENARIAT — H-COMPANY

Ce contrat encadre la mise à disposition, à titre gratuit pendant la phase
pilote, des outils numériques H-Company pour {company}.

Aucun engagement financier n'est requis pour démarrer. Les modalités de
commission éventuelles seront discutées séparément une fois la phase pilote
validée par les deux parties.

En signant ce document, {company} confirme avoir pris connaissance des
conditions ci-dessus et accepte de démarrer la phase pilote avec H-Company.
"""


# --- Candidature publique (formulaire unique, KYC inclus) ---

@router.post("/apply", response_model=PartnerApplicationRead, status_code=status.HTTP_201_CREATED)
def apply(
    company: str = Form(...),
    contactName: str = Form(...),
    category: str = Form(...),
    message: Optional[str] = Form(None),
    phone: str = Form(...),
    address: str = Form(...),
    id_document_type: str = Form(...),
    id_document_number: str = Form(...),
    id_document: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Demande de partenariat — formulaire unique et complet (KYC inclus) :
    nécessite d'être connecté. L'e-mail vient du compte authentifié, jamais
    du formulaire, pour ne jamais laisser quelqu'un soumettre une
    candidature au nom d'une autre adresse. La pièce d'identité est stockée
    hors du dossier public /uploads — elle ne sera lue que par un agent ou
    un admin, via un endpoint authentifié dédié, avant toute confirmation."""
    if id_document_type not in VALID_ID_DOCUMENT_TYPES:
        raise HTTPException(status_code=422, detail="Type de pièce d'identité invalide.")

    ext = ALLOWED_ID_DOCUMENT_TYPES.get(id_document.content_type)
    if not ext:
        raise HTTPException(
            status_code=400,
            detail="Format de pièce d'identité non accepté (formats acceptés : JPG, PNG, PDF).",
        )
    raw = id_document.file.read()
    if len(raw) > MAX_ID_DOCUMENT_SIZE:
        raise HTTPException(status_code=400, detail="La pièce d'identité ne doit pas dépasser 5 Mo.")

    filename = f"{uuid.uuid4().hex}{ext}"
    (KYC_DIR / filename).write_bytes(raw)

    application = PartnerApplication(
        company=company,
        contact_name=contactName,
        email=current_user.email,
        category=category,
        message=message,
        user_id=current_user.id,
        phone=phone,
        address=address,
        id_document_type=id_document_type,
        id_document_number=id_document_number,
        id_document_path=f"kyc/{filename}",
    )
    session.add(application)
    session.commit()
    session.refresh(application)

    notify_new_dashboard_access(current_user.email, contactName)
    return application


# --- Espace admin (liste + décision) ---

@router.get("/admin", response_model=List[PartnerApplicationRead])
def admin_list_applications(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    return session.exec(select(PartnerApplication)).all()


@router.get("/admin/payments", response_model=List[PaymentRead])
def admin_list_payments(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    # Doit être déclarée AVANT /admin/{application_id} ci-dessous — les deux
    # ont la même forme (/admin/X), et FastAPI teste les routes dans
    # l'ordre : la route générique aurait sinon intercepté "payments" comme
    # s'il s'agissait d'un application_id.
    return session.exec(select(Payment).order_by(Payment.created_at.desc())).all()


@router.get("/admin/agents", response_model=List[UserLookupRead])
def admin_list_agents(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    # Doit être déclarée AVANT /admin/{application_id} ci-dessous, pour la
    # même raison que /admin/payments ci-dessus (sinon "agents" serait
    # interprété comme un application_id).
    return session.exec(select(User).where(User.role == UserRole.agent)).all()


@router.get("/admin/{application_id}", response_model=PartnerApplicationRead)
def admin_get_application(
    application_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    application = session.get(PartnerApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Candidature introuvable.")
    return application


@router.get("/admin/{application_id}/contract", response_model=ContractRead)
def admin_get_contract(
    application_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    contract = session.exec(
        select(Contract).where(Contract.partner_application_id == application_id)
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Aucun contrat pour cette candidature.")
    return contract


@router.patch("/admin/{application_id}/contract", response_model=ContractRead)
def admin_update_contract(
    application_id: int,
    payload: ContractUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    contract = session.exec(
        select(Contract).where(Contract.partner_application_id == application_id)
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Aucun contrat pour cette candidature.")
    if contract.status == ContractStatus.signed:
        raise HTTPException(status_code=400, detail="Ce contrat est déjà signé, il ne peut plus être modifié.")

    contract.content = payload.content
    session.add(contract)
    session.commit()
    session.refresh(contract)
    return contract


@router.patch("/admin/{application_id}/status", response_model=PartnerApplicationRead)
def admin_update_status(
    application_id: int,
    payload: PartnerStatusUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    application = session.get(PartnerApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Candidature introuvable.")

    if payload.status == PartnerStatus.approved and application.agent_review_status != AgentReviewStatus.forwarded:
        # Le dashboard partenaire ne doit jamais s'activer sans passage par
        # un agent : celui-ci vérifie la pièce d'identité et la cohérence du
        # dossier avant de le transmettre. L'admin garde le dernier mot
        # (confirmation ou refus) mais ne peut pas court-circuiter cette
        # étape pour une candidature encore non transmise.
        raise HTTPException(
            status_code=400,
            detail="Cette candidature doit d'abord être examinée et transmise par un agent avant confirmation.",
        )

    application.status = payload.status
    application.reviewed_at = datetime.utcnow()

    if payload.status == PartnerStatus.approved:
        # L'apply() a déjà créé le compte à la soumission ; on s'assure
        # juste que son rôle reflète maintenant le statut partenaire.
        user = session.get(User, application.user_id) if application.user_id else None
        if not user:
            user = session.exec(select(User).where(User.email == application.email)).first()
        if not user:
            user = User(
                email=application.email,
                hashed_password=hash_password(secrets.token_urlsafe(32)),
                full_name=application.contact_name,
                role=UserRole.partner,
            )
            session.add(user)
            session.flush()
        elif user.role == UserRole.client:
            user.role = UserRole.partner
            session.add(user)

        # Génère le code partenaire seulement la toute première fois — une
        # ré-approbation ne le régénère pas. Depuis que candidater exige
        # d'être déjà connecté, l'utilisateur a nécessairement déjà un
        # moyen de connexion fonctionnel (mot de passe choisi, OTP,
        # Google...) : on ne génère plus de mot de passe ici, et surtout on
        # n'écrase plus celui qu'il utilise déjà.
        first_approval = not user.partner_code
        if first_approval:
            user.partner_code = generate_partner_code()

        user.account_status = AccountStatus.active
        user.trial_ends_at = datetime.utcnow() + timedelta(days=7)
        session.add(user)

        application.user_id = user.id

        existing_contract = session.exec(
            select(Contract).where(Contract.partner_application_id == application.id)
        ).first()
        if not existing_contract:
            session.add(
                Contract(
                    partner_application_id=application.id,
                    content=DEFAULT_CONTRACT_TEMPLATE.format(company=application.company),
                )
            )
            session.add(
                PartnerActivity(
                    partner_application_id=application.id,
                    category=ActivityCategory.system,
                    label="Candidature approuvée",
                    detail="Bienvenue dans le réseau H-Company.",
                )
            )

    session.add(application)
    session.commit()
    session.refresh(application)

    # Notifications envoyées seulement après le commit : un appel SMTP est
    # une I/O réseau potentiellement lente ou bloquante, et la faire pendant
    # que la transaction est encore ouverte garderait le verrou Postgres sur
    # la ligne "user" tant que l'e-mail n'est pas parti — bloquant au passage
    # toute autre requête touchant ce même utilisateur (ex. /auth/refresh).
    if payload.status == PartnerStatus.approved:
        if first_approval:
            notify_partner_approved(application.email, application.contact_name, user.partner_code)
        else:
            send_email(
                application.email,
                "Votre demande de partenariat H-Company est approuvée",
                f"Bonjour {application.contact_name},\n\n"
                f"Votre demande pour {application.company} a été réapprouvée. "
                "Connectez-vous avec votre e-mail et votre mot de passe habituel pour "
                "accéder à votre espace partenaire.",
            )

    return application


# --- Espace agent (revue KYC avant confirmation finale par l'admin) ---

def _agent_read(application: PartnerApplication) -> PartnerApplicationAgentRead:
    return PartnerApplicationAgentRead(
        id=application.id,
        company=application.company,
        contact_name=application.contact_name,
        email=application.email,
        category=application.category,
        message=application.message,
        status=application.status,
        created_at=application.created_at,
        phone=application.phone,
        address=application.address,
        id_document_type=application.id_document_type,
        id_document_number=application.id_document_number,
        agent_review_status=application.agent_review_status,
        agent_review_note=application.agent_review_note,
        agent_reviewed_at=application.agent_reviewed_at,
        id_document_available=bool(application.id_document_path),
    )


@router.get("/agent/queue", response_model=List[PartnerApplicationAgentRead])
def agent_queue(
    session: Session = Depends(get_session),
    _agent: User = Depends(get_current_agent),
):
    """File d'attente de l'agent — candidatures pas encore examinées."""
    applications = session.exec(
        select(PartnerApplication)
        .where(PartnerApplication.agent_review_status == AgentReviewStatus.pending)
        .order_by(PartnerApplication.created_at.asc())
    ).all()
    return [_agent_read(a) for a in applications]


@router.get("/agent/history", response_model=List[PartnerApplicationAgentRead])
def agent_history(
    session: Session = Depends(get_session),
    _agent: User = Depends(get_current_agent),
):
    """Historique des candidatures déjà traitées par un agent (transmises ou rejetées)."""
    applications = session.exec(
        select(PartnerApplication)
        .where(PartnerApplication.agent_review_status != AgentReviewStatus.pending)
        .order_by(PartnerApplication.agent_reviewed_at.desc())
    ).all()
    return [_agent_read(a) for a in applications]


@router.get("/agent/{application_id}", response_model=PartnerApplicationAgentRead)
def agent_get_application(
    application_id: int,
    session: Session = Depends(get_session),
    _agent: User = Depends(get_current_agent),
):
    application = session.get(PartnerApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Candidature introuvable.")
    return _agent_read(application)


@router.get("/agent/{application_id}/document")
def agent_get_document(
    application_id: int,
    session: Session = Depends(get_session),
    _agent: User = Depends(get_current_agent),
):
    """Diffuse la pièce d'identité jointe — réservé aux agents et admins.
    Jamais servi via /uploads (public) : chaque accès repasse par cette
    vérification de rôle."""
    application = session.get(PartnerApplication, application_id)
    if not application or not application.id_document_path:
        raise HTTPException(status_code=404, detail="Aucune pièce d'identité pour cette candidature.")
    file_path = PRIVATE_UPLOAD_ROOT / application.id_document_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur.")
    return FileResponse(file_path)


@router.patch("/agent/{application_id}/review", response_model=PartnerApplicationAgentRead)
def agent_review_application(
    application_id: int,
    payload: AgentReviewDecision,
    session: Session = Depends(get_session),
    agent: User = Depends(get_current_agent),
):
    """L'agent examine le dossier (identité, cohérence) puis :
    - `forwarded` : transmet à l'admin, qui pourra alors confirmer
      l'activation du dashboard (voir admin_update_status ci-dessus) ;
    - `rejected` : clôture directement le dossier, l'admin n'a plus à
      intervenir — le candidat est notifié immédiatement."""
    if payload.decision not in (AgentReviewStatus.forwarded, AgentReviewStatus.rejected):
        raise HTTPException(status_code=422, detail="Décision invalide — utiliser 'forwarded' ou 'rejected'.")

    application = session.get(PartnerApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Candidature introuvable.")

    application.agent_review_status = payload.decision
    application.agent_review_note = payload.note
    application.agent_id = agent.id
    application.agent_reviewed_at = datetime.utcnow()

    if payload.decision == AgentReviewStatus.rejected:
        application.status = PartnerStatus.rejected
        application.reviewed_at = datetime.utcnow()

    session.add(application)
    session.commit()
    session.refresh(application)

    if payload.decision == AgentReviewStatus.rejected:
        send_email(
            application.email,
            "Votre candidature partenaire H-Company",
            f"Bonjour {application.contact_name},\n\n"
            f"Après examen de votre dossier pour {application.company}, nous ne sommes "
            "malheureusement pas en mesure d'y donner suite pour le moment."
            + (f"\n\nMotif : {payload.note}" if payload.note else "")
            + "\n\nVous pouvez nous contacter si vous souhaitez plus de précisions.",
        )
    else:
        send_email(
            application.email,
            "Votre candidature partenaire H-Company avance",
            f"Bonjour {application.contact_name},\n\n"
            f"Votre dossier pour {application.company} a été examiné et transmis pour "
            "confirmation finale. Vous recevrez un e-mail dès que votre espace partenaire "
            "sera activé.",
        )

    return _agent_read(application)


# --- Gestion des comptes agents (admin uniquement) ---
# (la liste GET /admin/agents est déclarée plus haut, avant /admin/{application_id})

@router.patch("/admin/users/{user_id}/role", response_model=UserLookupRead)
def admin_set_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin),
):
    """Promeut un utilisateur au rôle agent, ou l'y retire (retour à
    'client'). Volontairement limité à ces deux valeurs : cet écran rapide
    n'est pas fait pour créer d'autres admins ni pour toucher au rôle
    'partner' (qui se gère par l'approbation d'une candidature)."""
    if payload.role not in ("agent", "client"):
        raise HTTPException(status_code=422, detail="Rôle invalide — seuls 'agent' et 'client' sont gérés ici.")

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de modifier votre propre rôle.")
    if user.role == UserRole.admin:
        raise HTTPException(status_code=400, detail="Impossible de modifier le rôle d'un administrateur depuis cet écran.")
    if user.role == UserRole.partner and payload.role == "agent":
        raise HTTPException(status_code=400, detail="Ce compte est déjà partenaire — retirez-le du réseau avant d'en faire un agent.")

    user.role = UserRole(payload.role)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# --- Espace partenaire (dashboard) ---

@router.get("/me", response_model=PartnerApplicationRead)
def my_application(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    application = session.exec(
        select(PartnerApplication).where(PartnerApplication.user_id == current_user.id)
    ).first()
    if not application:
        raise HTTPException(status_code=404, detail="Aucune candidature associée à ce compte.")
    return application


@router.get("/me/contract", response_model=ContractRead)
def my_contract(
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    contract = session.exec(
        select(Contract).where(Contract.partner_application_id == partner.id)
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Aucun contrat disponible pour l'instant.")
    return contract


@router.post("/me/contract/sign", response_model=ContractRead)
def sign_contract(
    payload: ContractSign,
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    contract = session.exec(
        select(Contract).where(Contract.partner_application_id == partner.id)
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Aucun contrat disponible pour l'instant.")
    if contract.status == ContractStatus.signed:
        raise HTTPException(status_code=400, detail="Ce contrat est déjà signé.")

    contract.status = ContractStatus.signed
    contract.signed_by_name = payload.signed_by_name
    contract.signed_at = datetime.utcnow()
    session.add(contract)

    session.add(
        PartnerActivity(
            partner_application_id=partner.id,
            category=ActivityCategory.contract,
            label="Contrat signé",
            detail=f"Signé par {payload.signed_by_name}",
        )
    )
    session.commit()
    session.refresh(contract)
    return contract


@router.get("/me/activities", response_model=List[PartnerActivityRead])
def my_activities(
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    return session.exec(
        select(PartnerActivity)
        .where(PartnerActivity.partner_application_id == partner.id)
        .order_by(PartnerActivity.created_at.desc())
    ).all()


@router.get("/me/stats", response_model=PartnerStats)
def my_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    application = session.exec(
        select(PartnerApplication).where(PartnerApplication.user_id == current_user.id)
    ).first()
    if not application:
        raise HTTPException(status_code=404, detail="Aucune candidature associée à ce compte.")

    activities = session.exec(
        select(PartnerActivity).where(PartnerActivity.partner_application_id == application.id)
    ).all()

    contract = session.exec(
        select(Contract).where(Contract.partner_application_id == application.id)
    ).first()

    counts: dict[ActivityCategory, int] = {}
    for a in activities:
        counts[a.category] = counts.get(a.category, 0) + 1

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_count = sum(1 for a in activities if a.created_at >= thirty_days_ago)

    return PartnerStats(
        application_status=application.status,
        contract_status=contract.status if contract else None,
        partner_since=application.reviewed_at,
        total_activities=len(activities),
        activities_by_category=[
            ActivityCategoryCount(category=cat, count=count) for cat, count in counts.items()
        ],
        activities_last_30_days=recent_count,
    )


# --- Offres (admin envoie, partenaire accepte) ---

MAX_OFFERS_PER_APPLICATION = 3


@router.post("/admin/{application_id}/offers", response_model=OfferRead, status_code=status.HTTP_201_CREATED)
def admin_create_offer(
    application_id: int,
    payload: OfferCreate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    application = session.get(PartnerApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Candidature introuvable.")

    existing = session.exec(
        select(Offer).where(Offer.partner_application_id == application_id)
    ).all()
    if len(existing) >= MAX_OFFERS_PER_APPLICATION:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_OFFERS_PER_APPLICATION} offres par candidature.",
        )

    offer = Offer(
        partner_application_id=application_id,
        title=payload.title,
        price=payload.price,
        duration_months=payload.duration_months,
        payment_mode=payload.payment_mode,
        description=payload.description,
    )
    session.add(offer)
    session.commit()
    session.refresh(offer)
    return offer


@router.get("/admin/{application_id}/offers", response_model=List[OfferRead])
def admin_list_offers(
    application_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    return session.exec(
        select(Offer).where(Offer.partner_application_id == application_id)
    ).all()


@router.get("/me/offers", response_model=List[OfferRead])
def my_offers(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    application = session.exec(
        select(PartnerApplication).where(PartnerApplication.user_id == current_user.id)
    ).first()
    if not application:
        raise HTTPException(status_code=404, detail="Aucune candidature associée à ce compte.")
    return session.exec(
        select(Offer).where(Offer.partner_application_id == application.id)
    ).all()


@router.post("/me/offers/{offer_id}/accept", response_model=ContractRead)
def accept_offer(
    offer_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # NB : action déclenchée depuis le tableau de bord (jamais depuis une
    # URL partagée), donc l'id interne reste acceptable ici — seule la page
    # de paiement, elle, est adressée via Offer.public_id (voir create_payment).
    application = session.exec(
        select(PartnerApplication).where(PartnerApplication.user_id == current_user.id)
    ).first()
    if not application:
        raise HTTPException(status_code=404, detail="Aucune candidature associée à ce compte.")

    offer = session.get(Offer, offer_id)
    if not offer or offer.partner_application_id != application.id:
        raise HTTPException(status_code=404, detail="Offre introuvable.")
    if offer.status != OfferStatus.proposed:
        raise HTTPException(status_code=400, detail="Cette offre n'est plus disponible.")

    offer.status = OfferStatus.accepted
    session.add(offer)

    # Les autres offres proposées deviennent caduques une fois qu'une est acceptée.
    others = session.exec(
        select(Offer).where(
            Offer.partner_application_id == application.id,
            Offer.id != offer.id,
            Offer.status == OfferStatus.proposed,
        )
    ).all()
    for o in others:
        o.status = OfferStatus.declined
        session.add(o)

    contract = session.exec(
        select(Contract).where(Contract.partner_application_id == application.id)
    ).first()
    contract_content = (
        f"CONTRAT DE PARTENARIAT — H-COMPANY\n\n"
        f"Offre acceptée : {offer.title}\n"
        f"Montant : {offer.price:.0f} $ — {offer.payment_mode.value}\n"
        f"Durée : {offer.duration_months} mois\n\n"
        f"{offer.description or ''}"
    )
    if contract:
        contract.content = contract_content
        contract.duration_months = offer.duration_months
        contract.payment_mode = offer.payment_mode
        contract.offer_id = offer.id
        contract.status = ContractStatus.awaiting_signature
    else:
        contract = Contract(
            partner_application_id=application.id,
            content=contract_content,
            duration_months=offer.duration_months,
            payment_mode=offer.payment_mode,
            offer_id=offer.id,
        )
    session.add(contract)

    session.add(
        PartnerActivity(
            partner_application_id=application.id,
            category=ActivityCategory.contract,
            label=f"Offre acceptée — {offer.title}",
            detail=f"{offer.price:.0f} $ / {offer.duration_months} mois",
        )
    )

    session.commit()
    session.refresh(contract)
    return contract


# --- Statut de compte (essai, actif/désactivé/bloqué) ---

@router.get("/me/account", response_model=AccountStatusRead)
def my_account_status(current_user: User = Depends(get_current_user)):
    days_left = None
    if current_user.trial_ends_at:
        days_left = max(0, (current_user.trial_ends_at - datetime.utcnow()).days)
    return AccountStatusRead(
        account_status=current_user.account_status,
        partner_code=current_user.partner_code,
        trial_ends_at=current_user.trial_ends_at,
        trial_days_left=days_left,
        email=current_user.email,
        phone=current_user.phone,
        full_name=current_user.full_name,
        role=current_user.role.value,
        member_since=current_user.created_at,
    )


@router.patch("/admin/{application_id}/account-status", response_model=AccountStatusRead)
def admin_update_account_status(
    application_id: int,
    payload: AccountStatusUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    application = session.get(PartnerApplication, application_id)
    if not application or not application.user_id:
        raise HTTPException(status_code=404, detail="Candidature ou compte introuvable.")

    user = session.get(User, application.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Compte introuvable.")

    user.account_status = payload.status
    session.add(user)

    session.add(
        PartnerActivity(
            partner_application_id=application.id,
            category=ActivityCategory.system,
            label=f"Statut du compte : {payload.status.value}",
        )
    )

    status_labels = {
        AccountStatus.active: "réactivé",
        AccountStatus.disabled: "désactivé",
        AccountStatus.blocked: "bloqué",
    }
    create_in_app_notification(
        session,
        user_id=user.id,
        title="Statut de votre compte",
        body=f"Votre compte partenaire a été {status_labels[payload.status]}.",
    )
    session.commit()

    send_email(
        user.email,
        "Mise à jour de votre compte H-Company",
        f"Bonjour {application.contact_name},\n\n"
        f"Votre compte partenaire a été {status_labels[payload.status]}. "
        "Si vous pensez qu'il s'agit d'une erreur, contactez-nous directement "
        "depuis votre tableau de bord.",
    )

    days_left = None
    if user.trial_ends_at:
        days_left = max(0, (user.trial_ends_at - datetime.utcnow()).days)
    return AccountStatusRead(
        account_status=user.account_status,
        partner_code=user.partner_code,
        trial_ends_at=user.trial_ends_at,
        trial_days_left=days_left,
    )


# --- Apps du partenaire + revenus ---

def _app_with_revenue(session: Session, app: PartnerApp) -> PartnerAppRead:
    entries = session.exec(select(RevenueEntry).where(RevenueEntry.partner_app_id == app.id)).all()
    total_revenue = sum(e.amount for e in entries)
    total_owed = sum(e.commission_amount for e in entries if not e.paid)
    return PartnerAppRead(
        id=app.id,
        name=app.name,
        description=app.description,
        status=app.status,
        created_at=app.created_at,
        activated_at=app.activated_at,
        total_revenue=total_revenue,
        total_owed=total_owed,
    )


@router.post("/me/apps", response_model=PartnerAppRead, status_code=status.HTTP_201_CREATED)
def request_app(
    payload: PartnerAppCreate,
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    app_row = PartnerApp(
        partner_application_id=partner.id,
        name=payload.name,
        description=payload.description,
    )
    session.add(app_row)
    session.flush()

    session.add(
        PartnerActivity(
            partner_application_id=partner.id,
            category=ActivityCategory.system,
            label=f"Nouvelle app demandée — {payload.name}",
        )
    )
    session.commit()
    session.refresh(app_row)
    return _app_with_revenue(session, app_row)


@router.get("/me/apps", response_model=List[PartnerAppRead])
def my_apps(
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    apps = session.exec(
        select(PartnerApp).where(PartnerApp.partner_application_id == partner.id)
    ).all()
    return [_app_with_revenue(session, a) for a in apps]


@router.get("/me/billing", response_model=BillingSummary)
def my_billing(
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    apps = session.exec(
        select(PartnerApp).where(PartnerApp.partner_application_id == partner.id)
    ).all()
    app_ids = [a.id for a in apps]

    total_revenue = 0.0
    total_owed = 0.0
    if app_ids:
        entries = session.exec(
            select(RevenueEntry).where(RevenueEntry.partner_app_id.in_(app_ids))
        ).all()
        total_revenue = sum(e.amount for e in entries)
        total_owed = sum(e.commission_amount for e in entries if not e.paid)

    contract = session.exec(
        select(Contract).where(Contract.partner_application_id == partner.id)
    ).first()
    subscribed = bool(contract and contract.status == ContractStatus.signed)
    plan_name = None
    if subscribed and contract.offer_id:
        offer = session.get(Offer, contract.offer_id)
        plan_name = offer.title if offer else None

    return BillingSummary(
        subscribed=subscribed,
        plan_name=plan_name,
        total_revenue=total_revenue,
        # Un partenaire abonné n'a rien à devoir à la commission : son
        # abonnement couvre déjà l'accès aux fonctionnalités.
        total_owed=0.0 if subscribed else total_owed,
        apps_count=len(apps),
        active_apps_count=sum(1 for a in apps if a.status == AppStatus.active),
    )


@router.get("/admin/apps/pending", response_model=List[PartnerAppRead])
def admin_pending_apps(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    apps = session.exec(select(PartnerApp).where(PartnerApp.status == AppStatus.requested)).all()
    return [_app_with_revenue(session, a) for a in apps]


@router.get("/admin/{application_id}/apps", response_model=List[PartnerAppRead])
def admin_list_partner_apps(
    application_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    apps = session.exec(
        select(PartnerApp).where(PartnerApp.partner_application_id == application_id)
    ).all()
    return [_app_with_revenue(session, a) for a in apps]


@router.patch("/admin/apps/{app_id}/status", response_model=PartnerAppRead)
def admin_update_app_status(
    app_id: int,
    payload: PartnerAppStatusUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    app_row = session.get(PartnerApp, app_id)
    if not app_row:
        raise HTTPException(status_code=404, detail="App introuvable.")

    app_row.status = payload.status
    if payload.status == AppStatus.active and not app_row.activated_at:
        app_row.activated_at = datetime.utcnow()
    session.add(app_row)

    session.add(
        PartnerActivity(
            partner_application_id=app_row.partner_application_id,
            category=ActivityCategory.system,
            label=f"App « {app_row.name} » — {payload.status.value}",
        )
    )
    session.commit()
    session.refresh(app_row)
    return _app_with_revenue(session, app_row)


@router.post("/admin/apps/{app_id}/revenue", response_model=RevenueEntryRead, status_code=status.HTTP_201_CREATED)
def admin_add_revenue(
    app_id: int,
    payload: RevenueEntryCreate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    app_row = session.get(PartnerApp, app_id)
    if not app_row:
        raise HTTPException(status_code=404, detail="App introuvable.")

    entry = RevenueEntry(
        partner_app_id=app_id,
        amount=payload.amount,
        commission_amount=payload.commission_amount,
        description=payload.description,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


# --- Paiement d'une offre (simulé — voir schemas.PaymentCreate) ---

def _generate_payment_reference() -> str:
    return f"PAY-{secrets.token_hex(6).upper()}"


@router.post("/me/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate,
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    offer = session.exec(select(Offer).where(Offer.public_id == payload.offer_public_id)).first()
    if not offer or offer.partner_application_id != partner.id:
        raise HTTPException(status_code=404, detail="Offre introuvable.")

    try:
        method = PaymentMethod(payload.method)
    except ValueError:
        raise HTTPException(status_code=422, detail="Méthode de paiement invalide.")

    if method in (PaymentMethod.airtel_money, PaymentMethod.mtn_momo) and not payload.phone_number:
        raise HTTPException(status_code=422, detail="Numéro de téléphone requis pour ce mode de paiement.")

    payment = Payment(
        partner_application_id=partner.id,
        offer_id=offer.id,
        amount=offer.price,
        method=method,
        phone_number=payload.phone_number,
        reference=_generate_payment_reference(),
    )
    session.add(payment)
    session.add(
        PartnerActivity(
            partner_application_id=partner.id,
            category=ActivityCategory.contract,
            label=f"Paiement initié — {offer.title}",
            detail=f"{offer.price:.0f} $ via {method.value}",
        )
    )
    session.commit()
    session.refresh(payment)

    # `charge_payment` simule une confirmation immédiate tant qu'aucune clé
    # de fournisseur (Stripe/Airtel Money/MTN MoMo) n'est configurée — voir
    # app/services/payments/gateway.py. Dès qu'une clé est renseignée, cet
    # appel bascule automatiquement sur le vrai fournisseur sans qu'il soit
    # nécessaire de toucher à cet endpoint.
    result = charge_payment(method, offer.price, payment.reference, payload.phone_number)
    payment.status = PaymentStatus.completed if result.success else PaymentStatus.failed
    if result.completed_at:
        payment.completed_at = result.completed_at
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


@router.get("/me/payments", response_model=List[PaymentRead])
def my_payments(
    partner: PartnerApplication = Depends(get_current_partner),
    session: Session = Depends(get_session),
):
    return session.exec(
        select(Payment)
        .where(Payment.partner_application_id == partner.id)
        .order_by(Payment.created_at.desc())
    ).all()

