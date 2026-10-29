import secrets
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "H-Company API"
    environment: str = "development"  # development | production

    # --- Base de données ---
    # En dev sans Docker : SQLite (par défaut). En prod / via docker-compose : PostgreSQL.
    database_url: str = "sqlite:///./hcompany.db"

    # --- Redis (rate limiting, cache OTP) ---
    # Si indisponible (pas de Docker), l'app bascule automatiquement sur un
    # stockage en mémoire — pratique en dev, à éviter en prod multi-instance.
    redis_url: Optional[str] = None

    # --- JWT ---
    # ⚠️ Doit être IDENTIQUE à la SECRET_KEY du service auth/ — c'est ce
    # qui permet de vérifier localement les jetons qu'il émet, sans
    # l'appeler à chaque requête. Voir auth/README.md.
    secret_key: str = "dev-shared-secret-change-in-production-CHANGEME"
    algorithm: str = "HS256"

    # URL du service d'authentification commune — appelé uniquement pour
    # les actions d'identification elles-mêmes (inscription, connexion,
    # OTP, rafraîchissement). Le reste du temps, les jetons sont vérifiés
    # localement avec secret_key, sans appel réseau.
    # (OBSOLÈTE : l'authentification est maintenant intégrée à ce backend — voir app/auth_core.
    # Ces deux réglages ne sont plus lus ; ils restent pour ne pas casser un .env existant.)
    auth_service_url: str = "http://localhost:8003"
    # Doit être IDENTIQUE à SERVICE_API_KEY dans auth/.env — utilisée pour
    # définir le mot de passe généré d'un partenaire à son approbation.
    auth_service_api_key: str = "change-this-service-key-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # --- Cookies ---
    cookie_domain: Optional[str] = None
    cookie_secure: bool = False  # True obligatoire en production (HTTPS)

    # --- CORS ---
    allowed_origins: str = "http://localhost:5173,http://localhost:4173"

    # --- OTP ---
    otp_length: int = 6
    otp_expire_minutes: int = 10
    otp_max_attempts: int = 5

    # --- Email (SMTP) ---
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: str = "no-reply@h-company.africa"
    # E-mail via API HTTPS (Resend) — à privilégier sur Render : les ports SMTP
    # sortants (25/465/587) y sont bloqués sur les offres gratuites.
    resend_api_key: Optional[str] = None

    # --- WhatsApp / SMS (Twilio) ---
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_whatsapp_number: Optional[str] = None  # format: whatsapp:+14155238886

    # --- Push (plateforme mobile/desktop) — non branché pour l'instant ---
    fcm_server_key: Optional[str] = None

    # --- Paiement (cartes + mobile money) ---
    # Tant qu'aucune clé n'est renseignée, app/services/payments simule les
    # paiements (confirmation immédiate) pour que tout le flux partenaire →
    # paiement → statut soit testable dès maintenant. Renseigner une clé
    # active automatiquement le vrai appel pour ce fournisseur — voir
    # app/services/payments/README.md pour la liste exacte des variables
    # par fournisseur (Stripe, Airtel Money, MTN MoMo).
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    airtel_money_client_id: Optional[str] = None
    airtel_money_client_secret: Optional[str] = None
    airtel_money_api_base: str = "https://openapiuat.airtel.africa"  # UAT par défaut ; passer à l'URL prod une fois validé
    mtn_momo_subscription_key: Optional[str] = None
    mtn_momo_api_user: Optional[str] = None
    mtn_momo_api_key: Optional[str] = None
    mtn_momo_api_base: str = "https://sandbox.momodeveloper.mtn.com"  # sandbox par défaut ; passer à l'URL prod une fois validé

    zamtel_money_api_key: Optional[str] = None
    zamtel_money_api_secret: Optional[str] = None
    zamtel_money_api_base: str = "https://sandbox.zamtel.example"  # à remplacer par l'URL fournie par Zamtel

    # --- H-Learning : bouquets ---
    # Monnaie dans laquelle les prix sont définis et les paiements facturés.
    learning_pivot_currency: str = "ZMW"

    # --- YouTube (vidéos H-Learning) ---
    # Sans clé, la synchronisation lit le flux RSS public de la playlist
    # (les 15 dernières vidéos). Avec une clé YouTube Data API v3, toute la
    # playlist est importée, avec les durées.
    youtube_api_key: Optional[str] = None
    # Playlist importée par défaut au 1er démarrage si aucun cours n'en a.
    youtube_default_playlist_id: Optional[str] = None
    # Les cours liés à une playlist se rafraîchissent seuls après ce délai.
    youtube_refresh_hours: int = 6

    # --- Authentification intégrée (ex-service auth/) ---
    # URL de l'ANCIENNE base du service auth : si renseignée, ses comptes sont repris une seule fois
    # au démarrage (identifiants conservés, personne n'est déconnecté). À retirer ensuite.
    auth_legacy_database_url: Optional[str] = None
    lockout_max_attempts: int = 5
    lockout_window_minutes: int = 15
    lockout_duration_minutes: int = 15
    # Connexion Google : le callback est désormais CE backend (…/api/v1/auth/google/callback).
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    frontend_success_redirect: str = "http://localhost:5173/oauth-callback"

    # --- Supervision des erreurs (Sentry) — vide = désactivé ---
    sentry_dsn: Optional[str] = None

    class Config:
        env_file = ".env"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def notifications_configured(self) -> bool:
        return bool(self.resend_api_key or self.smtp_host or self.twilio_account_sid)


@lru_cache
def get_settings() -> "Settings":
    return Settings()


settings = get_settings()

# Garde-fou : on refuse de démarrer en production avec la clé secrète par défaut.
if settings.is_production and settings.secret_key == "dev-shared-secret-change-in-production-CHANGEME":
    raise RuntimeError(
        "SECRET_KEY par défaut détectée en environnement de production. "
        "Générez-en une (ex: `python -c \"import secrets; print(secrets.token_urlsafe(64))\"`) "
        "et définissez-la dans .env avant de démarrer."
    )
