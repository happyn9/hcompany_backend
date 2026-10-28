"""Fait le lien entre un compte du service d'authentification commune
(identifié par `uid`) et le profil local de cette application (table
`User` de cette base, avec ses champs propres : rôle, statut de compte,
code partenaire...).

Trois cas possibles à chaque connexion :
1. Ce `uid` est déjà lié à un profil local (`auth_uid` renseigné) → on le
   renvoie tel quel.
2. Un profil local existe pour cet e-mail mais n'est pas encore lié (créé
   avant la mise en place de l'auth commune, ou créé côté local via un
   formulaire de contact/candidature avant la première connexion) → on le
   lie maintenant.
3. Aucun profil local n'existe → on en crée un nouveau, avec le rôle par
   défaut (client).
"""

import logging

from sqlmodel import Session, func, select

from app.models import User

logger = logging.getLogger("hcompany.identity")


def _norm(email: str) -> str:
    return (email or "").strip().lower()


def resolve_local_user(session: Session, uid: int, email: str) -> User:
    """L'e-mail du jeton fait foi. Un `auth_uid` identique ne suffit pas : après la fusion
    de l'auth, les identifiants de l'ancien service et ceux de `authuser` peuvent se
    recouper, et un nouveau compte (Google, par exemple) tomberait alors sur le profil
    d'une autre personne. On ne renvoie donc le profil lié à `uid` que si l'e-mail concorde."""
    email_n = _norm(email)
    by_uid = session.exec(select(User).where(User.auth_uid == uid)).first()
    if by_uid and _norm(by_uid.email) == email_n:
        return by_uid

    by_email = session.exec(select(User).where(func.lower(User.email) == email_n)).first()
    if by_uid:  # lien périmé / collision : on le détache avant de relier le bon profil
        logger.warning("auth_uid %s collisionne avec un autre e-mail : lien détaché", uid)
        by_uid.auth_uid = None
        session.add(by_uid)
        session.flush()

    if by_email:
        by_email.auth_uid = uid
        session.add(by_email)
        session.commit()
        session.refresh(by_email)
        return by_email

    user = User(email=email, auth_uid=uid, is_verified=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    from app.agents import apply_invite  # invitation d'agent posée par l'admin
    apply_invite(session, user)
    session.refresh(user)
    return user
