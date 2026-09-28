from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_admin
from app.models import CompanyTrainingRequest, Course, User
from app.schemas import (
    TRAINING_PLAN_PRICES,
    CompanyTrainingRequestCreate,
    CompanyTrainingRequestRead,
    CompanyTrainingRequestStatusUpdate,
    CourseRead,
)
from app.services.notifications import send_email

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])


@router.get("/courses", response_model=List[CourseRead])
def list_courses(session: Session = Depends(get_session)):
    return session.exec(select(Course)).all()


# --- Formation d'équipe (entreprise inscrivant plusieurs employés) ---

@router.post("/company-enrollment", response_model=CompanyTrainingRequestRead, status_code=201)
def submit_company_enrollment(
    payload: CompanyTrainingRequestCreate,
    session: Session = Depends(get_session),
):
    """Point d'entrée public du formulaire "Formation d'équipe" — pas
    d'authentification requise : une entreprise intéressée n'a pas
    nécessairement de compte H-Company. Le prix est recalculé ici à partir
    de la grille serveur, jamais reçu tel quel du client."""
    price = TRAINING_PLAN_PRICES.get(payload.plan)
    if price is None:
        raise HTTPException(status_code=422, detail="Formule invalide.")

    request = CompanyTrainingRequest(
        company=payload.company,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        employee_count=payload.employee_count,
        domains=", ".join(payload.domains),
        plan=payload.plan,
        monthly_price_per_employee=price,
        estimated_total=price * payload.employee_count,
        message=payload.message,
    )
    session.add(request)
    session.commit()
    session.refresh(request)

    send_email(
        payload.contact_email,
        "H-Company — Votre demande de formation d'équipe",
        f"Bonjour {payload.contact_name},\n\n"
        f"Nous avons bien reçu votre demande pour {payload.employee_count} employé(s) de {payload.company} "
        f"sur la formule {payload.plan} mois (environ {request.estimated_total:.0f} $/mois, à confirmer). "
        "Notre équipe vous recontactera très prochainement pour finaliser les modalités.\n\n"
        "— L'équipe H-Company",
    )

    return request


@router.get("/admin/company-enrollments", response_model=List[CompanyTrainingRequestRead])
def admin_list_company_enrollments(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    return session.exec(
        select(CompanyTrainingRequest).order_by(CompanyTrainingRequest.created_at.desc())
    ).all()


@router.patch("/admin/company-enrollments/{request_id}/status", response_model=CompanyTrainingRequestRead)
def admin_update_company_enrollment_status(
    request_id: int,
    payload: CompanyTrainingRequestStatusUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    request = session.get(CompanyTrainingRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    request.status = payload.status
    session.add(request)
    session.commit()
    session.refresh(request)
    return request
