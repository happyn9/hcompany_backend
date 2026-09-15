from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models import User, UserProfile
from app.schemas import OnboardingRead, OnboardingSubmit, OnboardingSuggestion

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])

# Règles simples (pas de ML) : une suggestion par centre d'intérêt déclaré.
SUGGESTIONS_BY_INTEREST = {
    "Cybersécurité": OnboardingSuggestion(
        title="Audit cybersécurité",
        description="Un premier état des lieux de vos systèmes, avant de choisir une formule.",
        cta_label="Voir nos formules",
        cta_href="/#services",
    ),
    "Développement web & mobile": OnboardingSuggestion(
        title="Développement sur mesure",
        description="Discutons de votre projet et de la meilleure approche technique.",
        cta_label="Réserver une démo",
        cta_href="/#demo",
    ),
    "Formation": OnboardingSuggestion(
        title="H-learning",
        description="Des parcours courts pour monter en compétence, à votre rythme.",
        cta_label="Explorer les parcours",
        cta_href="/#h-learning",
    ),
    "Devenir partenaire": OnboardingSuggestion(
        title="Rejoindre le réseau",
        description="Présentez votre entreprise et recevez des demandes qualifiées.",
        cta_label="Postuler",
        cta_href="/#rejoindre",
    ),
}

DEFAULT_SUGGESTION = OnboardingSuggestion(
    title="Parler à un membre de l'équipe",
    description="Décrivez votre besoin, on vous oriente vers la bonne offre.",
    cta_label="Nous contacter",
    cta_href="/#rejoindre",
)


@router.get("/me", response_model=OnboardingRead)
def get_onboarding(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    profile = session.exec(select(UserProfile).where(UserProfile.user_id == current_user.id)).first()
    if not profile:
        return OnboardingRead(completed=False)

    suggestion = SUGGESTIONS_BY_INTEREST.get(profile.primary_interest, DEFAULT_SUGGESTION)
    return OnboardingRead(
        completed=True,
        company_size=profile.company_size,
        primary_interest=profile.primary_interest,
        suggestions=[suggestion],
    )


@router.post("/me", response_model=OnboardingRead)
def submit_onboarding(
    payload: OnboardingSubmit,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    profile = session.exec(select(UserProfile).where(UserProfile.user_id == current_user.id)).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)

    profile.company_size = payload.company_size
    profile.primary_interest = payload.primary_interest
    profile.referral_source = payload.referral_source
    session.add(profile)
    session.commit()

    suggestion = SUGGESTIONS_BY_INTEREST.get(payload.primary_interest, DEFAULT_SUGGESTION)
    return OnboardingRead(
        completed=True,
        company_size=payload.company_size,
        primary_interest=payload.primary_interest,
        suggestions=[suggestion],
    )
