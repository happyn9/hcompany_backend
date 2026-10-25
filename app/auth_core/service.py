"""Logique d'authentification centrale, appelée directement (plus aucun aller-retour réseau).

Les fonctions renvoient les mêmes dictionnaires que l'ancien service HTTP
(`{"access_token", "refresh_token", "user": {"id", "email", ...}}`) afin que les routes
`/api/v1/auth/*` de H-Company n'aient pas à changer de contrat avec le site et l'app mobile."""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import bcrypt
from fastapi import HTTPException
from jose import JWTError, jwt
from sqlmodel import Session, select

from app.auth_core import store
from app.auth_core.models import AuthOTP, AuthUser
from app.config import settings

ALGORITHM = "HS256"
ISSUER = "h-company-auth"
OTP_PURPOSES = ("login", "register", "reset_password")

# --- Mots de passe ----------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


# Comparaison à temps constant : même sans compte (ou compte Google sans mot de passe) on calcule un bcrypt,
# pour ne pas révéler l'existence d'un e-mail par le temps de réponse.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing-safety", bcrypt.gensalt()).decode()


def verify_password_constant_time(password: str, hashed: Optional[str]) -> bool:
    ok = verify_password(password, hashed or _DUMMY_HASH)
    return ok and hashed is not None


# --- Jetons --------------------------------------------------------------------------

def _token(user: AuthUser, kind: str, delta: timedelta) -> str:
    return jwt.encode({"sub": user.email, "uid": user.id, "exp": datetime.utcnow() + delta, "type": kind, "iss": ISSUER},
                      settings.secret_key, algorithm=ALGORITHM)


def issue_tokens(user: AuthUser) -> dict:
    return {
        "access_token": _token(user, "access", timedelta(minutes=settings.access_token_expire_minutes)),
        "refresh_token": _token(user, "refresh", timedelta(days=settings.refresh_token_expire_days)),
        "token_type": "bearer",
        "user": user_dict(user),
    }


def user_dict(u: AuthUser) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "is_verified": u.is_verified}


def decode_token(token: str, kind: str) -> Optional[dict]:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if data.get("type") != kind or data.get("iss") != ISSUER or "uid" not in data:
        return None
    return data


# --- Anti brute-force (par compte) --------------------------------------------------

def _is_locked(email: str) -> bool:
    return store.get_value(f"login_lock:{email.lower()}") is not None


def _failed(email: str) -> None:
    n = store.increment(f"login_fail:{email.lower()}", settings.lockout_window_minutes * 60)
    if n >= settings.lockout_max_attempts:
        store.set_value(f"login_lock:{email.lower()}", "1", settings.lockout_duration_minutes * 60)


def _clear(email: str) -> None:
    store.delete_value(f"login_fail:{email.lower()}")
    store.delete_value(f"login_lock:{email.lower()}")


# --- Actions ---------------------------------------------------------------------------

def _by_email(session: Session, email: str) -> Optional[AuthUser]:
    return session.exec(select(AuthUser).where(AuthUser.email == email)).first()


def register(session: Session, email: str, password: str, full_name: Optional[str]) -> dict:
    if _by_email(session, email):
        raise HTTPException(status_code=400, detail="Un compte existe déjà avec cet e-mail.")
    user = AuthUser(email=email, hashed_password=hash_password(password), full_name=full_name)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user_dict(user)


def login(session: Session, email: str, password: str) -> dict:
    if _is_locked(email):
        raise HTTPException(status_code=429, detail="Trop de tentatives échouées. Réessayez dans quelques minutes.")
    user = _by_email(session, email)
    ok = verify_password_constant_time(password, user.hashed_password if user else None)
    if not user or not ok:
        _failed(email)
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect.")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Ce compte est désactivé.")
    _clear(email)
    return issue_tokens(user)


def refresh(session: Session, refresh_token: str) -> dict:
    data = decode_token(refresh_token, "refresh")
    if not data:
        raise HTTPException(status_code=401, detail="Jeton de rafraîchissement invalide ou expiré.")
    user = session.get(AuthUser, data["uid"])
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Compte introuvable ou désactivé.")
    return issue_tokens(user)


def _hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def create_otp(session: Session, email: str, purpose: str) -> Optional[str]:
    """Renvoie le code à envoyer, ou None si aucun compte (réponse neutre côté appelant)."""
    if purpose not in OTP_PURPOSES or not _by_email(session, email):
        return None
    code = "".join(secrets.choice("0123456789") for _ in range(settings.otp_length))
    session.add(AuthOTP(identifier=email, purpose=purpose, code_hash=_hash_otp(code),
                        expires_at=datetime.utcnow() + timedelta(minutes=settings.otp_expire_minutes)))
    session.commit()
    return code


def verify_otp(session: Session, email: str, purpose: str, code: str) -> dict:
    otp = session.exec(select(AuthOTP).where(AuthOTP.identifier == email, AuthOTP.purpose == purpose).order_by(AuthOTP.created_at.desc())).first()
    valid = False
    if otp and otp.expires_at >= datetime.utcnow() and otp.attempts < settings.otp_max_attempts:
        otp.attempts += 1
        session.add(otp)
        session.commit()
        valid = secrets.compare_digest(otp.code_hash, _hash_otp(code))
    if not valid:
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")
    user = _by_email(session, email)
    if not user:
        raise HTTPException(status_code=404, detail="Compte introuvable.")
    user.is_verified = True
    session.add(user)
    session.commit()
    return issue_tokens(user)


def _user_from_access(session: Session, access_token: str) -> AuthUser:
    data = decode_token(access_token, "access")
    user = session.get(AuthUser, data["uid"]) if data else None
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Jeton invalide ou expiré.")
    return user


def change_password(session: Session, access_token: str, current_password: str, new_password: str) -> None:
    user = _user_from_access(session, access_token)
    if not user.hashed_password or not verify_password(current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect.")
    user.hashed_password = hash_password(new_password)
    session.add(user)
    session.commit()


def reset_password(session: Session, access_token: str, new_password: str) -> None:
    user = _user_from_access(session, access_token)
    user.hashed_password = hash_password(new_password)
    session.add(user)
    session.commit()


def upsert_credentials(session: Session, email: str, password: str, full_name: Optional[str] = None) -> dict:
    """Pour les backends de confiance (ex. mot de passe généré à l'approbation d'un partenaire)."""
    user = _by_email(session, email)
    if user:
        user.hashed_password = hash_password(password)
        if full_name:
            user.full_name = full_name
    else:
        user = AuthUser(email=email, hashed_password=hash_password(password), full_name=full_name, is_verified=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user_dict(user)


# --- Google ------------------------------------------------------------------------------

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
STATE_PREFIX = "oauth_state:"


def _google_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def google_login_url() -> dict:
    if not _google_configured():
        raise HTTPException(status_code=503, detail="La connexion Google n'est pas configurée sur ce service.")
    state = secrets.token_urlsafe(32)
    store.set_value(f"{STATE_PREFIX}{state}", "pending", ttl_seconds=600)
    params = {"client_id": settings.google_client_id, "redirect_uri": settings.google_redirect_uri, "response_type": "code",
              "scope": "openid email profile", "state": state, "access_type": "online", "prompt": "select_account"}
    return {"url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"}


def google_callback(session: Session, code: str, state: str) -> tuple[dict, bool]:
    """Renvoie (jetons, compte_nouveau). Vérifie le `state` (anti-CSRF, usage unique) et la signature du jeton Google."""
    if not _google_configured():
        raise HTTPException(status_code=503, detail="La connexion Google n'est pas configurée sur ce service.")
    if store.get_value(f"{STATE_PREFIX}{state}") != "pending":
        raise HTTPException(status_code=400, detail="Requête invalide ou expirée, réessayez la connexion.")
    store.delete_value(f"{STATE_PREFIX}{state}")
    import httpx
    with httpx.Client(timeout=10) as client:
        resp = client.post(GOOGLE_TOKEN_URL, data={"code": code, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
                                                    "redirect_uri": settings.google_redirect_uri, "grant_type": "authorization_code"})
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Échec de l'échange avec Google.")
    try:
        from google.auth.transport import requests as g_requests
        from google.oauth2 import id_token as g_id_token
        claims = g_id_token.verify_oauth2_token(resp.json()["id_token"], g_requests.Request(), settings.google_client_id)
    except ImportError:
        raise HTTPException(status_code=503, detail="Connexion Google indisponible (dépendance manquante).")
    except (ValueError, KeyError):
        raise HTTPException(status_code=400, detail="Jeton Google invalide.")
    if not claims.get("email_verified"):
        raise HTTPException(status_code=400, detail="L'e-mail associé à ce compte Google n'est pas vérifié.")
    email, gid = claims["email"], claims["sub"]
    user = session.exec(select(AuthUser).where(AuthUser.google_id == gid)).first()
    is_new = False
    if not user:
        user = _by_email(session, email)
        if user:
            user.google_id = gid
        else:
            is_new = True
            user = AuthUser(email=email, google_id=gid, full_name=claims.get("name"), is_verified=True)
        session.add(user)
        session.commit()
        session.refresh(user)
    return issue_tokens(user), is_new
