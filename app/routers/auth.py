from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlmodel import Session

from app.auth_core import service as central_auth
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
from app.services.notifications import send_email
from app.services.rate_limit import limiter
from app.services.shared_auth import decode_shared_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        # "none" et non "lax" — le site (Vercel) et l'API (Render) vivent
        # sur deux domaines réellement distincts en production, pas juste
        # deux ports locaux comme en développement. Avec "lax", le
        # navigateur refuse d'envoyer ce cookie sur les appels du site vers
        # l'API (considérés "cross-site"), ce qui invalidait la session à
        # chaque actualisation de page — jamais vu en local où site et API
        # partagent le même domaine (localhost). "none" exige "Secure=true"
        # (voir COOKIE_SECURE), déjà en place en production.
        samesite="none" if settings.cookie_secure else "lax",
        domain=settings.cookie_domain,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth",
    )


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
    user central) et la traduit en réponse locale. Le jeton de
    rafraîchissement est désormais toujours inclus dans le corps JSON, pas
    seulement pour les clients mobile/desktop : les navigateurs modernes
    (Chrome en tête) bloquent de plus en plus les cookies tiers, même
    correctement réglés en SameSite=None; Secure, dès que le site et l'API
    vivent sur deux domaines différents (Vercel + Render, notamment) —
    constaté concrètement en production, pas juste en théorie. Le cookie
    reste posé en plus (inoffensif, redevient utile le jour où site et API
    partagent un même domaine), mais le site s'appuie maintenant sur le
    corps JSON comme source fiable, exactement comme l'app mobile déjà."""
    is_mobile = _is_mobile_client(request)
    if not is_mobile:
        _set_refresh_cookie(response, central["refresh_token"])
    local_user = resolve_local_user(session, uid=central["user"]["id"], email=central["user"]["email"])
    return AccessTokenResponse(
        access_token=central["access_token"],
        user=local_user,
        refresh_token=central["refresh_token"],
    )


# --- Inscription / connexion (le compte central vit maintenant dans cette base : appels directs) ---

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: UserRegister, session: Session = Depends(get_session)):
    central_user = central_auth.register(session, payload.email, payload.password, payload.full_name)
    return resolve_local_user(session, uid=central_user["id"], email=central_user["email"])


@router.post("/login", response_model=AccessTokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, payload: UserLogin, session: Session = Depends(get_session)):
    central = central_auth.login(session, payload.email, payload.password)
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

    central = central_auth.refresh(session, token)
    return _issue_tokens_from_central(request, response, session, central)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/v1/auth")
    return {"detail": "Déconnecté."}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# --- OTP (e-mail uniquement pour l'instant) ---

@router.get("/warmup", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("12/minute")
def warmup(request: Request):
    """Conservé pour les anciens clients : plus rien à réveiller, l'authentification est dans cette API."""
    return {"status": "ready"}


@router.post("/otp/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("6/minute")
def request_otp(request: Request, background: BackgroundTasks, payload: OTPRequest, session: Session = Depends(get_session)):
    email = payload.identifier.strip()
    code = central_auth.create_otp(session, email, payload.purpose.value) if "@" in email else None
    if code:  # envoi en tâche de fond : la réponse part tout de suite, sans attendre le serveur SMTP
        background.add_task(
            send_email, email, "Votre code de vérification",
            f"Votre code de vérification est : {code}. Il expire dans {settings.otp_expire_minutes} minutes.",
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
    central = central_auth.verify_otp(session, payload.identifier.strip(), payload.purpose.value, payload.code)
    return _issue_tokens_from_central(request, response, session, central)


# --- Réglages : mot de passe ---

@router.post("/change-password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
    payload: PasswordChange,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    header_token: str = Depends(oauth2_scheme),
):
    if not current_user.auth_uid:
        raise HTTPException(status_code=400, detail="Ce compte n'est pas encore relié au service d'authentification.")
    central_auth.change_password(session, _extract_token(request, header_token), payload.current_password, payload.new_password)
    return {"detail": "Mot de passe mis à jour."}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    payload: PasswordReset,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    header_token: str = Depends(oauth2_scheme),
):
    """À utiliser juste après une connexion par OTP avec purpose=reset_password
    (voir /otp/verify) — le jeton obtenu à cette étape suffit à prouver la
    possession du compte, pas besoin de redemander l'ancien mot de passe."""
    central_auth.reset_password(session, _extract_token(request, header_token), payload.new_password)
    return {"detail": "Mot de passe réinitialisé."}


# --- Connexion avec Google ---

@router.get("/google/login")
@limiter.limit("10/minute")
def google_login(request: Request):
    """Renvoie l'URL Google vers laquelle le frontend doit rediriger l'utilisateur (window.location = data.url)."""
    return central_auth.google_login_url()


@router.get("/google/callback")
def google_callback(code: str, state: str, session: Session = Depends(get_session)):
    """URI de redirection à déclarer dans la console Google : <API>/api/v1/auth/google/callback.
    Redirige vers le site avec les jetons dans le fragment (#), jamais dans la requête."""
    tokens, is_new = central_auth.google_callback(session, code, state)
    return RedirectResponse(
        f"{settings.frontend_success_redirect}#access_token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}&new_account={'1' if is_new else '0'}"
    )


class OAuthCompletePayload(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/oauth/complete", response_model=AccessTokenResponse)
def oauth_complete(response: Response, payload: OAuthCompletePayload, session: Session = Depends(get_session)):
    """Appelé par la page /oauth-callback du site juste après le retour de Google : vérifie le jeton,
    pose le cookie de rafraîchissement et renvoie le profil LOCAL enrichi."""
    payload_data = decode_shared_token(payload.access_token)
    if not payload_data:
        raise HTTPException(status_code=401, detail="Jeton invalide.")

    local_user = resolve_local_user(session, uid=payload_data["uid"], email=payload_data["sub"])
    if not local_user.is_active:
        raise HTTPException(status_code=403, detail="Ce compte est désactivé.")

    _set_refresh_cookie(response, payload.refresh_token)
    return AccessTokenResponse(
        access_token=payload.access_token,
        user=local_user,
        refresh_token=payload.refresh_token,
    )
