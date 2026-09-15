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

    # --- WhatsApp / SMS (Twilio) ---
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_whatsapp_number: Optional[str] = None  # format: whatsapp:+14155238886

    # --- Push (plateforme mobile/desktop) — non branché pour l'instant ---
    fcm_server_key: Optional[str] = None

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
        return bool(self.smtp_host or self.twilio_account_sid)


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
