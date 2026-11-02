"""Confirmation par mot de passe (« step-up ») avant de voir les chiffres et réglages sensibles.
L'admin saisit son mot de passe → jeton de 10 minutes, envoyé ensuite dans l'en-tête X-Admin-Confirm.
Les routes protégées répondent 428 sans jeton valide ; les tentatives comptent dans le verrouillage anti brute-force."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.auth_core import service as central_auth
from app.config import settings
from app.database import get_session
from app.deps import get_current_admin
from app.models import User
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
    exp = datetime.utcnow() + TTL
    token = jwt.encode({"type": "admin_confirm", "uid": admin.id, "exp": exp}, settings.secret_key, algorithm=settings.algorithm)
    return {"confirm_token": token, "expires_in": int(TTL.total_seconds())}


def require_admin_confirmed(admin: User = Depends(get_current_admin), x_admin_confirm: str = Header(default="")) -> User:
    try:
        data = jwt.decode(x_admin_confirm, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        data = None
    if not data or data.get("type") != "admin_confirm" or data.get("uid") != admin.id:
        raise HTTPException(status_code=428, detail="Confirmez votre mot de passe pour accéder à ces données.")
    return admin
