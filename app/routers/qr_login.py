"""Connexion par QR code, façon WhatsApp Web.

1. L'appareil à connecter (site sur ordinateur) crée une session : POST /qr/sessions
   → `code` (affiché en QR) + `secret` (reste dans cet appareil).
2. Un appareil déjà connecté (app Rafiki ou site mobile) scanne le QR, vérifie
   GET /qr/sessions/{code}, puis approuve : POST /qr/sessions/{code}/approve.
3. L'appareil d'origine interroge POST /qr/sessions/{code}/poll avec son secret et
   reçoit, une seule fois, un jeton d'accès valable 8 h.
"""
import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.deps import get_current_user
from app.models import QrSession, User

router = APIRouter(prefix="/api/v1/qr", tags=["qr-login"])

TTL = timedelta(minutes=2)
TOKEN_LIFETIME = timedelta(hours=8)
MAX_PENDING = 2000


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _get(session: Session, code: str) -> QrSession:
    q = session.exec(select(QrSession).where(QrSession.code == code)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Code QR inconnu.")
    return q


def _expired(q: QrSession) -> bool:
    return q.status in ("pending", "approved") and q.expires_at < datetime.utcnow()


class StartIn(BaseModel):
    device_label: str = Field(default="", max_length=80)


@router.post("/sessions", status_code=201)
def start(payload: StartIn, session: Session = Depends(get_session)):
    now = datetime.utcnow()
    for old in session.exec(select(QrSession).where(QrSession.expires_at < now - timedelta(hours=1))).all():
        session.delete(old)
    code, secret = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
    q = QrSession(code=code, secret_hash=_hash(secret), device_label=payload.device_label.strip()[:80], expires_at=now + TTL)
    session.add(q)
    session.commit()
    return {"code": code, "secret": secret, "expires_at": q.expires_at.isoformat() + "Z", "ttl_seconds": int(TTL.total_seconds())}


@router.get("/sessions/{code}")
def info(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    q = _get(session, code)
    if _expired(q):
        raise HTTPException(status_code=410, detail="Ce code QR a expiré. Actualisez-le sur l'autre appareil.")
    if q.status != "pending":
        raise HTTPException(status_code=409, detail="Ce code QR a déjà été utilisé.")
    return {"code": q.code, "device_label": q.device_label or "Appareil inconnu", "created_at": q.created_at.isoformat() + "Z", "user": {"email": user.email, "full_name": user.full_name}}


@router.post("/sessions/{code}/approve")
def approve(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    q = _get(session, code)
    if _expired(q):
        raise HTTPException(status_code=410, detail="Ce code QR a expiré. Actualisez-le sur l'autre appareil.")
    if q.status != "pending":
        raise HTTPException(status_code=409, detail="Ce code QR a déjà été utilisé.")
    q.status, q.user_id, q.approved_at = "approved", user.id, datetime.utcnow()
    session.add(q)
    session.commit()
    return {"ok": True}


class PollIn(BaseModel):
    secret: str = Field(min_length=10, max_length=200)


@router.post("/sessions/{code}/poll")
def poll(code: str, payload: PollIn, session: Session = Depends(get_session)):
    q = _get(session, code)
    if not secrets.compare_digest(q.secret_hash, _hash(payload.secret)):
        raise HTTPException(status_code=403, detail="Secret invalide.")
    if q.status == "consumed":
        raise HTTPException(status_code=410, detail="Ce code QR a déjà été utilisé.")
    if _expired(q):
        return {"status": "expired"}
    if q.status == "pending":
        return {"status": "pending"}
    user = session.get(User, q.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="Compte indisponible.")
    q.status = "consumed"
    session.add(q)
    session.commit()
    token = jwt.encode(
        {"iss": "h-company-auth", "type": "access", "uid": user.id, "sub": user.email, "exp": datetime.utcnow() + TOKEN_LIFETIME, "via": "qr"},
        settings.secret_key, algorithm=settings.algorithm,
    )
    return {
        "status": "approved", "access_token": token, "token_type": "bearer", "expires_in": int(TOKEN_LIFETIME.total_seconds()),
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role.value if hasattr(user.role, "value") else user.role, "is_verified": user.is_verified},
    }
