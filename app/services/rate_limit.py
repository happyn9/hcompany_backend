"""Limitation de débit (anti brute-force sur login/OTP).

Utilise Redis si `REDIS_URL` est défini (recommandé en production, partagé
entre plusieurs instances de l'API) ; retombe sur un stockage en mémoire du
process sinon (suffisant en dev local, pas fiable derrière plusieurs workers).
"""

from fastapi import Request
from slowapi import Limiter

from app.config import settings

storage_uri = settings.redis_url or "memory://"


def client_ip(request: Request) -> str:
    """IP réelle du visiteur.

    Derrière le proxy de Render (ou Caddy), `request.client.host` est l'adresse
    du proxy, la même pour tout le monde : avec `get_remote_address`, tous les
    visiteurs partageaient donc UN SEUL compteur, et trois demandes de code
    par minute au total suffisaient à bloquer tout le site. On lit la première
    adresse de `X-Forwarded-For` (celle posée par le proxy, côté client).
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=client_ip, storage_uri=storage_uri)
