from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """En-têtes de sécurité : clickjacking, MIME sniffing, HTTPS forcé (production), pas de cache des réponses d'API,
    et une politique CSP stricte (l'API ne sert que du JSON/des fichiers, jamais de page à scripts)."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(), payment=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        h["Cross-Origin-Resource-Policy"] = "cross-origin"  # les images téléversées sont affichées par le site (autre domaine)
        path = request.url.path
        if path.startswith("/api"):
            h["Cache-Control"] = "no-store"  # jetons, soldes, données personnelles : jamais mises en cache
            h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        if settings.is_production:
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
