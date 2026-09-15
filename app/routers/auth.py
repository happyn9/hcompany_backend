import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlmodel import Session

from app.config import settings
from app.database import get_session
from app.deps import _extract_token, get_current_user, oauth2_scheme
from app.models import User
from app.schemas import (
    AccessTokenResponse,
    OTPRequest,
    OTPVerify,
    PasswordChange,
    PasswordReset,
    RefreshPayload,
    UserLogin,
    UserRead,
    UserRegister,
)
from app.services.identity import resolve_local_user
from app.services.rate_limit import limiter
from app.services.shared_auth import decode_shared_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
AUTH_SERVICE = settings.auth_service_url


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth",
    )


def _call_auth_service(method: str, path: str, **kwargs) -> dict:
    """Tous les appels vers le service central passent par ici — une seule
    fonction pour traduire ses erreurs en HTTPException FastAPI, et gérer
    le cas où le service est injoignable sans faire planter cette API."""
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.request(method, f"{AUTH_SERVICE}{path}", **kwargs)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le service d'authentification est momentanément indisponible.",
        )

    if resp.status_code >= 400:
        detail = "Une erreur est survenue."
        try:
            detail = resp.json().get("detail", detail)
        except ValueError:
            pass
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json()


MOBILE_CLIENT_HEADER = "x-client-type"


def _is_mobile_client(request: Request) -> bool:
    """Les clients web (navigateur) reçoivent le jeton de rafraîchissement
    dans un cookie httpOnly ; l'app Flutter (mobile/desktop) n'a pas de
    gestionnaire de cookies partagé comme un navigateur, donc elle envoie
    cet en-tête pour recevoir le jeton directement dans le corps JSON à la
    place. Voir platform/app/lib/core/network/api_client.dart."""
    return request.headers.get(MOBILE_CLIENT_HEADER, "").lower() == "mobile"


def _issue_tokens_from_central(request: Request, response: Response, session: Session, central: dict) -> AccessTokenResponse:
    """Reçoit la réponse du service central (access_token, refresh_token,
    user central) et la traduit en réponse locale : le jeton de
    rafraîchissement part dans le cookie httpOnly pour un client web, ou
    directement dans le corps JSON pour l'app mobile/desktop (voir
    _is_mobile_client). Le profil utilisateur renvoyé est le profil LOCAL
    enrichi (rôle, statut de compte...), pas le profil minimal du service
    central."""
    is_mobile = _is_mobile_client(request)
    if not is_mobile:
        _set_refresh_cookie(response, central["refresh_token"])
    local_user = resolve_local_user(session, uid=central["user"]["id"], email=central["user"]["email"])
    return AccessTokenResponse(
        access_token=central["access_token"],
        user=local_user,
        refresh_token=central["refresh_token"] if is_mobile else None,
    )


# --- Inscription / connexion (relayées vers le service d'authentification commune) ---

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: UserRegister, session: Session = Depends(get_session)):
    central_user = _call_auth_service(
        "POST",
        "/api/v1/auth/register",
        json={"email": payload.email, "password": payload.password, "full_name": payload.full_name},
    )
    return resolve_local_user(session, uid=central_user["id"], email=central_user["email"])


@router.post("/login", response_model=AccessTokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, payload: UserLogin, session: Session = Depends(get_session)):
    central = _call_auth_service(
        "POST", "/api/v1/auth/login", json={"email": payload.email, "password": payload.password}
    )
    local_user = resolve_local_user(session, uid=central["user"]["id"], email=central["user"]["email"])
    if not local_user.is_active:
        raise HTTPException(status_code=403, detail="Ce compte est désactivé.")
    return _issue_tokens_from_central(request, response, session, central)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(request: Request, response: Response, payload: RefreshPayload = RefreshPayload(), session: Session = Depends(get_session)):
    # Client web : le jeton vit dans le cookie httpOnly. Client mobile/
    # desktop : il n'a pas de cookie partagé, il l'envoie dans le corps
    # JSON à la place (voir platform/app/lib/core/network/api_client.dart).
    token = request.cookies.get(REFRESH_COOKIE_NAME) or payload.refresh_token
    if not token:
        raise HTTPException(status_code=401, detail="Session expirée, reconnectez-vous.")

    central = _call_auth_service("POST", "/api/v1/auth/refresh", json={"refresh_token": token})
    return _issue_tokens_from_central(request, response, session, central)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/v1/auth")
    return {"detail": "Déconnecté."}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# --- OTP (relayé vers le service central — e-mail uniquement pour l'instant,
# le service central ne gère pas encore le canal WhatsApp) ---

@router.post("/otp/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
def request_otp(request: Request, payload: OTPRequest, session: Session = Depends(get_session)):
    _call_auth_service(
        "POST", "/api/v1/auth/otp/request", json={"email": payload.identifier, "purpose": payload.purpose.value}
    )
    return {"detail": "Si les informations sont valides, un code a été envoyé."}


@router.post("/otp/verify", response_model=AccessTokenResponse)
@limiter.limit("10/minute")
def verify_otp_code(
    request: Request,
    response: Response,
    payload: OTPVerify,
    session: Session = Depends(get_session),
):
    central = _call_auth_service(
        "POST",
        "/api/v1/auth/otp/verify",
        json={"email": payload.identifier, "code": payload.code, "purpose": payload.purpose.value},
    )
    return _issue_tokens_from_central(request, response, session, central)


# --- Réglages : changer le mot de passe (relayé vers le service central,
# c'est lui qui possède le mot de passe désormais) ---

@router.post("/change-password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
    payload: PasswordChange,
    current_user: User = Depends(get_current_user),
    header_token: str = Depends(oauth2_scheme),
):
    if not current_user.auth_uid:
        raise HTTPException(status_code=400, detail="Ce compte n'est pas encore relié au service d'authentification.")

    token = _extract_token(request, header_token)
    _call_auth_service(
        "POST",
        "/api/v1/auth/change-password",
        json={"current_password": payload.current_password, "new_password": payload.new_password},
        headers={"Authorization": f"Bearer {token}"},
    )
    return {"detail": "Mot de passe mis à jour."}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    payload: PasswordReset,
    current_user: User = Depends(get_current_user),
    header_token: str = Depends(oauth2_scheme),
):
    """À utiliser juste après une connexion par OTP avec purpose=reset_password
    (voir /otp/verify) — le jeton obtenu à cette étape suffit à prouver la
    possession du compte, pas besoin de redemander l'ancien mot de passe."""
    token = _extract_token(request, header_token)
    _call_auth_service(
        "POST",
        "/api/v1/auth/reset-password",
        json={"new_password": payload.new_password},
        headers={"Authorization": f"Bearer {token}"},
    )
    return {"detail": "Mot de passe réinitialisé."}


# --- Connexion avec Google (relayée) ---

@router.get("/google/login")
@limiter.limit("10/minute")
def google_login(request: Request):
    """Renvoie l'URL Google vers laquelle le frontend doit rediriger
    l'utilisateur — la redirection elle-même se fait côté client
    (window.location = data.url)."""
    return _call_auth_service("GET", "/api/v1/auth/google/login")


class OAuthCompletePayload(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/oauth/complete", response_model=AccessTokenResponse)
def oauth_complete(response: Response, payload: OAuthCompletePayload, session: Session = Depends(get_session)):
    """Appelé par la page /oauth-callback du site juste après le retour de
    Google — les jetons ont déjà été émis par le service central (le
    callback Google pointe directement dessus, pas sur ce backend). Ici,
    on se contente de vérifier le jeton, poser le cookie de rafraîchissement
    comme pour une connexion classique, et renvoyer le profil LOCAL enrichi."""
    payload_data = decode_shared_token(payload.access_token)
    if not payload_data:
        raise HTTPException(status_code=401, detail="Jeton invalide.")

    local_user = resolve_local_user(session, uid=payload_data["uid"], email=payload_data["sub"])
    if not local_user.is_active:
        raise HTTPException(status_code=403, detail="Ce compte est désactivé.")

    _set_refresh_cookie(response, payload.refresh_token)
    return AccessTokenResponse(access_token=payload.access_token, user=local_user)
