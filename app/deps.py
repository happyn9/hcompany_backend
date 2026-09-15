from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from app.database import get_session
from app.models import PartnerApplication, PartnerStatus, User, UserRole
from app.services.identity import resolve_local_user
from app.services.shared_auth import decode_shared_token

# auto_error=False : on veut pouvoir tomber en repli sur un cookie si
# l'en-tête Authorization est absent (le site web utilise le cookie ;
# une future app mobile/desktop utilisera plutôt l'en-tête Bearer).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def _extract_token(request: Request, header_token: Optional[str]) -> Optional[str]:
    if header_token:
        return header_token
    return request.cookies.get("access_token")


def get_current_user(
    request: Request,
    header_token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Identifiants invalides ou expirés.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = _extract_token(request, header_token)
    if not token:
        raise credentials_exception

    payload = decode_shared_token(token)
    if not payload:
        raise credentials_exception

    user = resolve_local_user(session, uid=payload["uid"], email=payload["sub"])
    if not user.is_active:
        raise credentials_exception

    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé aux administrateurs.")
    return current_user


def get_current_partner(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PartnerApplication:
    """Renvoie le dossier partenaire APPROUVÉ lié à l'utilisateur connecté.
    Utilisé par tous les endpoints Lukondo et le dashboard partenaire — un
    partenaire en attente ou rejeté n'a jamais accès à ces routes."""
    application = session.exec(
        select(PartnerApplication).where(PartnerApplication.user_id == current_user.id)
    ).first()

    if not application or application.status != PartnerStatus.approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aucun accès partenaire actif pour ce compte.",
        )

    return application
