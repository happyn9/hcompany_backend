"""Auto-provisionnement de compte lors d'une soumission de formulaire
(contact ou candidature partenaire) — logique partagée pour ne pas la
dupliquer entre les deux routers.

Principe : si un compte existe déjà pour cet e-mail, on le réutilise (pas
de doublon). Sinon, on crée un compte avec un mot de passe aléatoire
jamais communiqué — la personne se connecte ensuite via OTP par e-mail.
"""

import random
import secrets
import string
from typing import Tuple

from sqlmodel import Session, select

from app.models import User
from app.security import hash_password
from app.services.notifications import send_email


def get_or_create_user(session: Session, email: str, full_name: str) -> Tuple[User, bool]:
    """Renvoie (user, created). `created=True` seulement si un nouveau
    compte vient d'être créé à l'instant."""
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        return user, False

    user = User(
        email=email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        full_name=full_name,
    )
    session.add(user)
    session.flush()  # pour obtenir user.id sans committer tout de suite
    return user, True


def notify_new_dashboard_access(email: str, full_name: str) -> None:
    send_email(
        email,
        "Votre espace H-Company est prêt",
        f"Bonjour {full_name},\n\n"
        "Votre demande a bien été reçue. Un espace personnel a été créé pour vous : "
        "connectez-vous avec cet e-mail sur notre site (bouton « Se connecter avec un "
        "code envoyé par e-mail ») pour suivre son statut à tout moment.",
    )


def generate_partner_code() -> str:
    """Identifiant lisible du compte partenaire (ex: HC-482913) — sert de
    référence dans les échanges avec le support, pas de mot de passe."""
    digits = "".join(random.choices(string.digits, k=6))
    return f"HC-{digits}"


def generate_partner_password(length: int = 10) -> str:
    """Mot de passe généré, réellement communiqué au partenaire (pas un
    token jetable) puisqu'il doit pouvoir s'en servir tel quel — site web,
    futur mobile ou desktop, avec les mêmes identifiants partout."""
    alphabet = string.ascii_letters + string.digits
    # Exclut les caractères ambigus (0/O, 1/l/I) pour limiter les erreurs
    # de saisie recopiée depuis un e-mail.
    alphabet = "".join(c for c in alphabet if c not in "0O1lI")
    return "".join(secrets.choice(alphabet) for _ in range(length))


def notify_partner_credentials(email: str, full_name: str, partner_code: str, password: str) -> None:
    send_email(
        email,
        "Votre accès partenaire H-Company",
        f"Bonjour {full_name},\n\n"
        "Votre candidature a été approuvée — bienvenue dans le réseau H-Company.\n\n"
        f"Votre code partenaire : {partner_code}\n"
        f"Votre mot de passe : {password}\n\n"
        "Utilisez cet e-mail et ce mot de passe pour vous connecter à votre "
        "tableau de bord (et plus tard, aux applications mobile et desktop du réseau, "
        "avec les mêmes identifiants). Vous pourrez changer votre mot de passe à tout "
        "moment depuis les réglages de votre espace.\n\n"
        "Votre essai gratuit de 30 jours démarre dès maintenant.",
    )


def notify_partner_approved(email: str, full_name: str, partner_code: str) -> None:
    """Utilisée quand le candidat avait déjà un compte fonctionnel avant de
    postuler (connexion désormais obligatoire pour candidater) — pas besoin
    de générer de nouveau mot de passe, juste de confirmer l'approbation."""
    send_email(
        email,
        "Votre candidature a été approuvée",
        f"Bonjour {full_name},\n\n"
        "Bonne nouvelle : votre candidature a été approuvée, bienvenue dans le réseau H-Company.\n\n"
        f"Votre code partenaire : {partner_code}\n\n"
        "Connectez-vous avec le compte que vous utilisez déjà pour accéder à votre "
        "tableau de bord partenaire. Votre essai gratuit de 30 jours démarre dès maintenant.",
    )
