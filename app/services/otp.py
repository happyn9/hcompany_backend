import hashlib
import secrets
from datetime import datetime, timedelta

from app.config import settings


def generate_otp() -> str:
    """Code numérique généré avec `secrets` (CSPRNG), pas `random`."""
    return "".join(str(secrets.randbelow(10)) for _ in range(settings.otp_length))


def hash_otp(code: str) -> str:
    # On ne stocke jamais le code en clair, même de façon temporaire.
    return hashlib.sha256(code.encode()).hexdigest()


def verify_otp(code: str, hashed: str) -> bool:
    return secrets.compare_digest(hash_otp(code), hashed)


def otp_expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=settings.otp_expire_minutes)
