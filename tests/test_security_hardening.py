"""En-têtes de sécurité de l'API et garde-fous de configuration de production."""
import os
import tempfile

os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'sec.db')}")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings, _production_problems  # noqa: E402
from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

SQLModel.metadata.create_all(engine)


def test_api_headers():
    with TestClient(app) as c:
        r = c.get("/api/v1/money/change", params={"amount": 10, "from": "USD", "to": "ZMW"})
    h = r.headers
    assert h["cache-control"] == "no-store"
    assert "default-src 'none'" in h["content-security-policy"]
    assert h["x-frame-options"] == "DENY" and h["x-content-type-options"] == "nosniff"


def test_cors_rejects_unlisted_origin():
    with TestClient(app) as c:
        r = c.options("/api/v1/money/change", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in r.headers


def good(**kw):
    base = dict(environment="production", secret_key="x" * 64, cookie_secure=True, allowed_origins="https://hcompany-global.vercel.app")
    base.update(kw)
    return Settings(**base)


def test_production_guard():
    assert _production_problems(good()) == []
    assert _production_problems(good(secret_key="dev-shared-secret-change-in-production-CHANGEME"))
    assert _production_problems(good(secret_key="court"))
    assert _production_problems(good(cookie_secure=False))
    assert _production_problems(good(allowed_origins="*"))
    assert _production_problems(good(allowed_origins="http://localhost:5173"))
    assert _production_problems(good(money_provider="pawapay", pawapay_api_token=""))
    assert _production_problems(good(cookie_samesite="weird"))
