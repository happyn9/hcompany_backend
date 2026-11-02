"""Confirmation par mot de passe (« step-up ») avant de voir les chiffres et réglages sensibles.
L'admin saisit son mot de passe → jeton de 10 minutes, envoyé ensuite dans l'en-tête X-Admin-Confirm.
Les routes protégées répondent 428 sans jeton valide ; les tentatives comptent dans le verrouillage anti brute-force."""
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.auth_core import service as central_auth
from app.config import settings
from app.database import get_session
from app.deps import get_current_admin
from app.models import User
from app.services.notifications import send_email
from app.services.notifications.email_channel import otp_body
from app.services.rate_limit import limiter

TTL = timedelta(minutes=10)
router = APIRouter(prefix="/api/v1/admin-security", tags=["admin-security"])


class ConfirmIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


@router.post("/confirm")
@limiter.limit("6/minute")
def confirm(request: Request, payload: ConfirmIn, session: Session = Depends(get_session), admin: User = Depends(get_current_admin)):
    try:
        central_auth.login(session, admin.email, payload.password)
    except HTTPException as exc:
        if exc.status_code == 429:
            raise
        raise HTTPException(status_code=403, detail="Mot de passe incorrect.")
    return _issue(admin)


def _issue(admin: User) -> dict:
    exp = datetime.utcnow() + TTL
    token = jwt.encode({"type": "admin_confirm", "uid": admin.id, "exp": exp}, settings.secret_key, algorithm=settings.algorithm)
    return {"confirm_token": token, "expires_in": int(TTL.total_seconds())}


class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=10)


@router.post("/otp", status_code=202)
@limiter.limit("3/minute")
def send_code(request: Request, background: BackgroundTasks, session: Session = Depends(get_session), admin: User = Depends(get_current_admin)):
    """Alternative au mot de passe (compte sans mot de passe, ou oublié) : code à usage unique envoyé à l'e-mail de l'admin connecté."""
    code = central_auth.create_otp(session, admin.email, "admin_confirm")
    if code:
        background.add_task(send_email, admin.email, "Code d'accès admin / Admin access code",
                            otp_body(code, "Votre code d'accès à l'espace admin", "Your admin access code"))
    return {"detail": "Si le compte existe, un code a été envoyé à votre e-mail."}


@router.post("/confirm-otp")
@limiter.limit("10/minute")
def confirm_code(request: Request, payload: CodeIn, session: Session = Depends(get_session), admin: User = Depends(get_current_admin)):
    central_auth.verify_otp(session, admin.email, "admin_confirm", payload.code.strip())
    return _issue(admin)


def require_admin_confirmed(admin: User = Depends(get_current_admin), x_admin_confirm: str = Header(default="")) -> User:
    try:
        data = jwt.decode(x_admin_confirm, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        data = None
    if not data or data.get("type") != "admin_confirm" or data.get("uid") != admin.id:
        raise HTTPException(status_code=428, detail="Confirmez votre mot de passe pour accéder à ces données.")
    return admin
