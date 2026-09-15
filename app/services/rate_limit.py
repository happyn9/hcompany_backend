"""Limitation de débit (anti brute-force sur login/OTP).

Utilise Redis si `REDIS_URL` est défini (recommandé en production, partagé
entre plusieurs instances de l'API) ; retombe sur un stockage en mémoire du
process sinon (suffisant en dev local, pas fiable derrière plusieurs workers).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

storage_uri = settings.redis_url or "memory://"

limiter = Limiter(key_func=get_remote_address, storage_uri=storage_uri)
