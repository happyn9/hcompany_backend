"""HFood (module restaurant) — limites de débit, quotas et bornes d'upload (phase A1.3 / A1.4).

TOUT est centralisé ici. Chaque valeur peut être changée SANS modifier le code, par variable
d'environnement du processus (valeurs par défaut ci-dessous). Ces variables sont facultatives ;
une valeur invalide est ignorée (la valeur par défaut s'applique).

Limites de débit (format slowapi : « N/minute », « N/hour », plusieurs limites séparées par « ; ») :
  RESTO_RL_RESERVE   création de réservation       défaut  5/minute;30/hour
  RESTO_RL_CANCEL    annulation par le client       défaut  10/minute;60/hour
  RESTO_RL_REVIEW    avis                           défaut  5/minute;20/hour
  RESTO_RL_UPLOAD    envoi d'image                  défaut  20/minute;200/hour
  RESTO_RL_OWNER_NEW création d'un restaurant       défaut  10/hour
  RESTO_RL_OWNER_ACT action sur une réservation     défaut  120/minute
  RESTO_RL_BROWSE    recherche / créneaux / tables  défaut  120/minute  (anti-aspiration, par IP)

Uploads :
  RESTO_UPLOAD_MAX_MB        taille max d'une image (Mo)            défaut 5
  RESTO_UPLOAD_MAX_SIDE      côté max en pixels                     défaut 6000
  RESTO_UPLOAD_MAX_MPIX      surface max en millions de pixels      défaut 25
  RESTO_UPLOAD_MAX_FILES     nombre max d'images stockées / compte  défaut 200
  RESTO_UPLOAD_MAX_TOTAL_MB  volume total max / compte (Mo)         défaut 150

Identification : pour un appel authentifié, la clé de limitation est le COMPTE (jeton signé valide), pas l'IP :
un compte qui abuse ne bloque ni les autres comptes, ni les autres utilisateurs d'une même adresse (NAT, proxy).
Sans jeton valide, la clé est l'IP lue dans X-Forwarded-For (même logique que `app.services.rate_limit.client_ip`).
Limite connue : cet en-tête est posé par le proxy ; si le proxy ne l'écrase pas, un client anonyme pourrait le
falsifier. Les endpoints sensibles exigent une connexion, donc ce cas ne concerne que la recherche publique.

Compteur par ENDPOINT (`key_style="endpoint"`) et non par URL : sans cela, une route à paramètre de chemin
(`/me/reservations/{code}/cancel`, `/restaurants/{rid}/slots`…) aurait un compteur par valeur du paramètre et
la limite serait contournable en changeant simplement le code ou l'identifiant.

Stockage : Redis si `REDIS_URL` est défini (partagé entre instances), sinon mémoire du process. Si Redis est
injoignable, la limitation retombe sur la mémoire du process (en fail-open contrôlé : le service continue, les
limites restent appliquées par instance) au lieu de renvoyer une erreur 500.
"""
import logging
import os
from typing import Optional

from fastapi import Request
from slowapi import Limiter

from app.config import settings
from app.services.rate_limit import client_ip
from app.services.shared_auth import decode_shared_token

logger = logging.getLogger("hcompany.restaurant.limits")


def _env(name: str, default: str) -> str:
    v = os.environ.get(name, "").strip()
    return v or default


def _env_num(name: str, default: float) -> float:
    try:
        v = float(os.environ.get(name, "").strip())
        return v if v > 0 else default
    except ValueError:
        return default


RATE_RESERVE = _env("RESTO_RL_RESERVE", "5/minute;30/hour")
RATE_CANCEL = _env("RESTO_RL_CANCEL", "10/minute;60/hour")
RATE_REVIEW = _env("RESTO_RL_REVIEW", "5/minute;20/hour")
RATE_UPLOAD = _env("RESTO_RL_UPLOAD", "20/minute;200/hour")
RATE_OWNER_NEW = _env("RESTO_RL_OWNER_NEW", "10/hour")
RATE_OWNER_ACT = _env("RESTO_RL_OWNER_ACT", "120/minute")
RATE_BROWSE = _env("RESTO_RL_BROWSE", "120/minute")

UPLOAD_MAX_BYTES = int(_env_num("RESTO_UPLOAD_MAX_MB", 5) * 1024 * 1024)
UPLOAD_MAX_SIDE = int(_env_num("RESTO_UPLOAD_MAX_SIDE", 6000))
UPLOAD_MAX_PIXELS = int(_env_num("RESTO_UPLOAD_MAX_MPIX", 25) * 1_000_000)
UPLOAD_MAX_FILES = int(_env_num("RESTO_UPLOAD_MAX_FILES", 200))
UPLOAD_MAX_TOTAL_BYTES = int(_env_num("RESTO_UPLOAD_MAX_TOTAL_MB", 150) * 1024 * 1024)


def _bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and auth[7:].strip():
        return auth[7:].strip()
    return request.cookies.get("access_token")


def rate_key(request: Request) -> str:
    """Compte authentifié (jeton signé valide) sinon adresse IP."""
    token = _bearer(request)
    if token:
        payload = decode_shared_token(token)
        if payload:
            return f"u:{payload['uid']}"
    return f"ip:{client_ip(request)}"


def _build_limiter() -> Limiter:
    storage = settings.redis_url or "memory://"
    try:
        return Limiter(key_func=rate_key, storage_uri=storage, in_memory_fallback_enabled=True, key_style="endpoint")
    except Exception as exc:  # noqa: BLE001  (Redis injoignable au démarrage)
        logger.warning("Stockage de limitation indisponible au démarrage (%s) : repli sur la mémoire du process.", exc.__class__.__name__)
        return Limiter(key_func=rate_key, storage_uri="memory://", key_style="endpoint")


limiter = _build_limiter()
