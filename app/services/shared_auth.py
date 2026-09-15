"""Vérification des jetons émis par le service d'authentification commune
(auth/) — décodage local avec la clé partagée, sans appel réseau. Voir
auth/README.md pour le principe complet.
"""

from typing import Optional, TypedDict

from jose import JWTError, jwt

from app.config import settings


class SharedTokenPayload(TypedDict):
    uid: int
    sub: str  # e-mail


def decode_shared_token(token: str) -> Optional[SharedTokenPayload]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None

    if payload.get("iss") != "h-company-auth" or payload.get("type") != "access":
        return None
    if "uid" not in payload or "sub" not in payload:
        return None

    return {"uid": payload["uid"], "sub": payload["sub"]}
