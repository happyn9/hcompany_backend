"""Authentification intégrée : inscription, connexion, rafraîchissement, OTP, mots de passe,
verrouillage anti brute-force, reprise des comptes de l'ancien service."""
import os
import tempfile

_dir = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(_dir, 'auth.db')}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.auth_core import service as central  # noqa: E402
from app.auth_core.legacy_import import import_legacy_users  # noqa: E402
from app.auth_core.models import AuthOTP, AuthUser  # noqa: E402
from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.services.rate_limit import limiter  # noqa: E402

limiter.enabled = False
sent = []


@pytest.fixture(scope="module")
def client(monkeypatch_module=None):
    SQLModel.metadata.create_all(engine)
    import app.routers.auth as auth_router
    auth_router.send_email = lambda to, subject, body: sent.append((to, body))
    with TestClient(app) as c:
        yield c


def _login(client, email, password):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_register_login_refresh_and_me(client):
    r = client.post("/api/v1/auth/register", json={"email": "ana@example.com", "password": "motdepasse1", "full_name": "Ana"})
    assert r.status_code == 201
    assert client.post("/api/v1/auth/register", json={"email": "ana@example.com", "password": "motdepasse1"}).status_code == 400
    r = _login(client, "ana@example.com", "motdepasse1")
    assert r.status_code == 200
    body = r.json()
    assert body["refresh_token"] and body["user"]["email"] == "ana@example.com"
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "ana@example.com"
    rf = client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}, headers={"x-client-type": "mobile"})
    assert rf.status_code == 200
    # un jeton d'accès n'est pas un jeton de rafraîchissement (le cookie posé à la connexion est retiré)
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": body["access_token"]}, headers={"x-client-type": "mobile"}).status_code == 401
    with Session(engine) as s:
        local = s.exec(select(User).where(User.email == "ana@example.com")).one()
        assert local.auth_uid == s.exec(select(AuthUser).where(AuthUser.email == "ana@example.com")).one().id


def test_wrong_password_then_lockout(client):
    client.post("/api/v1/auth/register", json={"email": "bob@example.com", "password": "motdepasse1"})
    for _ in range(5):
        assert _login(client, "bob@example.com", "mauvais").status_code == 401
    assert _login(client, "bob@example.com", "motdepasse1").status_code == 429


def test_otp_login_and_password_reset(client):
    client.post("/api/v1/auth/register", json={"email": "cleo@example.com", "password": "motdepasse1"})
    sent.clear()
    r = client.post("/api/v1/auth/otp/request", json={"identifier": "cleo@example.com", "channel": "email", "purpose": "reset_password"})
    assert r.status_code == 202 and len(sent) == 1
    code = [c for c in sent[0][1].split() if c.rstrip(".").isdigit()][0].rstrip(".")
    bad = client.post("/api/v1/auth/otp/verify", json={"identifier": "cleo@example.com", "channel": "email", "purpose": "reset_password", "code": "000000"})
    assert bad.status_code == 400
    ok = client.post("/api/v1/auth/otp/verify", json={"identifier": "cleo@example.com", "channel": "email", "purpose": "reset_password", "code": code})
    assert ok.status_code == 200
    tok = ok.json()["access_token"]
    assert client.post("/api/v1/auth/reset-password", json={"new_password": "nouveau123"}, headers={"Authorization": f"Bearer {tok}"}).status_code == 200
    assert _login(client, "cleo@example.com", "nouveau123").status_code == 200
    # compte inconnu : réponse neutre, aucun e-mail
    sent.clear()
    assert client.post("/api/v1/auth/otp/request", json={"identifier": "nobody@example.com", "channel": "email", "purpose": "login"}).status_code == 202
    assert sent == []


def test_change_password(client):
    client.post("/api/v1/auth/register", json={"email": "dan@example.com", "password": "motdepasse1"})
    tok = _login(client, "dan@example.com", "motdepasse1").json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.post("/api/v1/auth/change-password", json={"current_password": "faux", "new_password": "autre12345"}, headers=h).status_code == 400
    assert client.post("/api/v1/auth/change-password", json={"current_password": "motdepasse1", "new_password": "autre12345"}, headers=h).status_code == 200
    assert _login(client, "dan@example.com", "autre12345").status_code == 200


def test_upsert_credentials_and_google_unconfigured(client):
    with Session(engine) as s:
        a = central.upsert_credentials(s, "eve@example.com", "premier123", "Eve")
        b = central.upsert_credentials(s, "eve@example.com", "second1234")
        assert a["id"] == b["id"]
    assert _login(client, "eve@example.com", "second1234").status_code == 200
    assert client.get("/api/v1/auth/google/login").status_code == 503


def test_legacy_import_keeps_ids_and_is_idempotent():
    src = os.path.join(_dir, "legacy.db")
    e = create_engine(f"sqlite:///{src}")
    with e.begin() as c:
        c.execute(text('CREATE TABLE "user" (id INTEGER PRIMARY KEY, email TEXT, phone TEXT, hashed_password TEXT, google_id TEXT, full_name TEXT, is_verified BOOLEAN, is_active BOOLEAN, created_at TIMESTAMP)'))
        c.execute(text("INSERT INTO \"user\" VALUES (41, 'old@example.com', NULL, :h, NULL, 'Old', 1, 1, '2026-01-01 10:00:00')"), {"h": central.hash_password("ancien1234")})
    target = create_engine(f"sqlite:///{os.path.join(_dir, 'target.db')}")
    SQLModel.metadata.create_all(target, tables=[AuthUser.__table__, AuthOTP.__table__])
    with Session(target) as s:
        assert import_legacy_users(s, f"sqlite:///{src}") == 1
        u = s.exec(select(AuthUser)).one()
        assert u.id == 41 and central.verify_password("ancien1234", u.hashed_password)
        assert import_legacy_users(s, f"sqlite:///{src}") == 0
