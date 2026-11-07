import re

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models import User, UserProfile
from app.schemas import ONBOARDING_PURPOSES, ONBOARDING_SERVICES, OnboardingRead, OnboardingSubmit, OnboardingSuggestion

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])

S = OnboardingSuggestion
# Règles simples (pas de ML) : une suggestion par service ou objectif déclaré.
BY_SERVICE = {
    "money": S(title="Envoyez de l'argent ZM ⇄ RDC", description="Frais affichés avant de payer, au taux du jour.", cta_label="Ouvrir H-Money", cta_href="/app/money"),
    "invoice": S(title="Facturez et soyez payé", description="Générez une facture, envoyez le lien, recevez en mobile money.", cta_label="Créer une facture", cta_href="/app/factures"),
    "logement": S(title="Trouvez ou proposez un logement", description="Maisons, appartements, lodges et hôtels, avec visite 3D.", cta_label="Voir les logements", cta_href="/app/logement"),
    "transport": S(title="Réservez votre bus", description="Choisissez votre siège et suivez votre trajet.", cta_label="Voir les bus", cta_href="/app/transport"),
    "colis": S(title="Envoyez un colis", description="Dépôt, suivi et livraison.", cta_label="Envoyer un colis", cta_href="/app/colis"),
    "shopping": S(title="Boutiques et livraison", description="Achetez chez des vendeurs vérifiés.", cta_label="Voir les boutiques", cta_href="/shopping"),
    "restaurant": S(title="Réservez une table", description="Menu, commande et réservation.", cta_label="Voir les restaurants", cta_href="/restaurant"),
    "tourisme": S(title="Excursions locales", description="Des expériences réservables en ligne.", cta_label="Découvrir", cta_href="/tourisme"),
    "learning": S(title="H-Learning", description="Des parcours courts pour monter en compétence.", cta_label="Explorer", cta_href="/formations"),
    "translate": S(title="Interprètes à la demande", description="Traduction et interprétation.", cta_label="Voir", cta_href="/interpretation"),
}
PARTNER = S(title="Proposez vos services sur H-Company", description="Présentez votre entreprise et recevez des demandes qualifiées.", cta_label="Devenir partenaire", cta_href="/infos#rejoindre")
# Ancien questionnaire (compatibilité)
LEGACY = {
    "Cybersécurité": S(title="Audit cybersécurité", description="Un premier état des lieux de vos systèmes.", cta_label="Voir nos formules", cta_href="/infos#services"),
    "Développement web & mobile": S(title="Développement sur mesure", description="Discutons de votre projet.", cta_label="Réserver une démo", cta_href="/infos#demo"),
    "Formation": BY_SERVICE["learning"],
    "Devenir partenaire": PARTNER,
}
DEFAULT_SUGGESTION = S(title="Parler à un membre de l'équipe", description="Décrivez votre besoin, on vous oriente vers la bonne offre.", cta_label="Nous contacter", cta_href="/infos#rejoindre")
PURPOSE_TO_SERVICE = {"send_money": "money", "invoice": "invoice", "stay": "logement", "travel": "transport", "shop": "shopping", "learn": "learning"}


def _suggestions(interests: list[str], purposes: list[str], wants_partner: bool, legacy: str = "") -> list[OnboardingSuggestion]:
    keys = [k for k in interests if k in BY_SERVICE]
    keys += [PURPOSE_TO_SERVICE[p] for p in purposes if p in PURPOSE_TO_SERVICE and PURPOSE_TO_SERVICE[p] not in keys]
    out = [BY_SERVICE[k] for k in dict.fromkeys(keys)][:3]
    if wants_partner or "sell" in purposes:
        out.append(PARTNER)
    if not out and legacy in LEGACY:
        out.append(LEGACY[legacy])
    return out or [DEFAULT_SUGGESTION]


def _split(v) -> list[str]:
    return [x for x in (v or "").split(",") if x]


def _read(p: UserProfile) -> OnboardingRead:
    interests, purposes = _split(p.interests), _split(p.purpose)
    return OnboardingRead(completed=True, company_size=p.company_size, primary_interest=p.primary_interest, account_type=p.account_type, company_name=p.company_name,
                          country=p.country, city=p.city, language=p.language, interests=interests, purposes=purposes, wants_partner=p.wants_partner,
                          suggestions=_suggestions(interests, purposes, p.wants_partner, p.primary_interest or ""))


@router.get("/me", response_model=OnboardingRead)
def get_onboarding(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    profile = session.exec(select(UserProfile).where(UserProfile.user_id == current_user.id)).first()
    return _read(profile) if profile else OnboardingRead(completed=False)


def _clean(s):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    return s or None


@router.post("/me", response_model=OnboardingRead)
def submit_onboarding(payload: OnboardingSubmit, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    interests = [i for i in dict.fromkeys(payload.interests) if i in ONBOARDING_SERVICES]
    purposes = [p for p in dict.fromkeys(payload.purposes) if p in ONBOARDING_PURPOSES]
    if payload.account_type == "business" and not _clean(payload.company_name):
        raise HTTPException(status_code=422, detail="Indiquez le nom de votre entreprise.")
    profile = session.exec(select(UserProfile).where(UserProfile.user_id == current_user.id)).first() or UserProfile(user_id=current_user.id)
    profile.company_size = payload.company_size
    profile.primary_interest = payload.primary_interest
    profile.referral_source = payload.referral_source
    profile.account_type = payload.account_type
    profile.company_name = _clean(payload.company_name) if payload.account_type == "business" else None
    profile.country = payload.country.upper() if payload.country else None
    profile.city = _clean(payload.city)
    profile.language = payload.language
    profile.interests = ",".join(interests)
    profile.purpose = ",".join(purposes)
    profile.wants_partner = bool(payload.wants_partner)
    session.add(profile)
    # Le téléphone sert à joindre la personne : on le range sur le compte seulement s'il est plausible et libre.
    digits = "".join(ch for ch in (payload.phone or "") if ch.isdigit())
    if 8 <= len(digits) <= 15 and not current_user.phone:
        taken = session.exec(select(User).where(User.phone == (payload.phone or "").strip(), User.id != current_user.id)).first()
        if not taken:
            current_user.phone = (payload.phone or "").strip()
            session.add(current_user)
    session.commit()
    session.refresh(profile)
    return _read(profile)
