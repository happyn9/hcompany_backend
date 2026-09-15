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

from sqlmodel import Session, select

from app.models import User


def resolve_local_user(session: Session, uid: int, email: str) -> User:
    user = session.exec(select(User).where(User.auth_uid == uid)).first()
    if user:
        return user

    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        user.auth_uid = uid
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    user = User(email=email, auth_uid=uid, is_verified=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
