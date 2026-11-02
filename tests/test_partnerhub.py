"""Dashboard partenaire unique : plans, fonctions payantes, marque, invitations, connexion par code."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "hub.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.admin_security import require_admin_confirmed  # noqa: E402
from app.deps import get_current_admin, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerApplication, PartnerStatus, User, UserRole  # noqa: E402
from app.partnerhub.models import ApplicationInvite  # noqa: E402
from app.partnerhub.services import hash_token  # noqa: E402
from app.services.rate_limit import limiter  # noqa: E402

limiter.enabled = False
H = "/api/v1/partner/hub"
M = "/api/v1/partner/modules"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key, role in (("admin", UserRole.admin), ("partner", UserRole.client), ("rookie", UserRole.client)):
            u = User(email=f"{key}@hub.test", full_name=key.title(), role=role, is_verified=True)
            s.add(u); s.commit(); s.refresh(u); ids[key] = u.id
        s.add(PartnerApplication(company="Chez Mwila", contact_name="Mwila", email="partner@hub.test", category="Hébergement", phone="0971234567", status=PartnerStatus.approved, user_id=ids["partner"]))
        s.commit()
    st = {"as": "partner"}
    def _u():
        with Session(engine) as s:
            return s.get(User, ids[st["as"]])
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_current_admin] = lambda: _u.__call__() if False else Session(engine).get(User, ids["admin"])
    app.dependency_overrides[require_admin_confirmed] = lambda: _u.__call__() if False else Session(engine).get(User, ids["admin"])
    with TestClient(app) as client:
        client.st, client.ids = st, ids
        yield client
    app.dependency_overrides.clear()


def test_standard_limit_two_apps(c):
    assert c.get(H).json()["plan"] == {"name": "standard", "max_apps": 2, "pro_until": None, "upgrade_requested": False, "pro_price_usd": 29}
    assert c.post(f"{M}/lodging/activate").status_code == 200
    assert c.post(f"{M}/shopping/activate").status_code == 200
    # la boutique est créée d'office depuis le dossier partenaire : pas de second formulaire
    shop = next(a for a in c.get(H).json()["apps"] if a["key"] == "shopping")
    assert shop["has_profile"] and shop["revenue"] == {"gross": 0.0, "net": 0.0, "count": 0}
    r = c.post(f"{M}/transport/activate")
    assert r.status_code == 402 and "Pro" in r.json()["detail"]
    assert c.post(f"{M}/lodging/activate").status_code == 200  # déjà active : pas comptée deux fois
    assert c.get(H).json()["apps_used"] == 2


def test_upgrade_request_and_admin_grant(c):
    assert c.post(f"{H}/upgrade").status_code == 202
    req = c.get(f"{H}/admin/requests").json()
    assert [u["email"] for u in req["upgrades"]] == ["partner@hub.test"]
    uid = c.ids["partner"]
    assert c.put(f"{H}/admin/users/{uid}/plan", json={"plan": "pro", "months": 1}).status_code == 200
    assert c.get(H).json()["plan"]["name"] == "pro"
    assert c.post(f"{M}/transport/activate").status_code == 200
    assert c.get(H).json()["apps_used"] == 3
    # Pro expiré : retour au plan Standard (les apps déjà actives restent, pas de nouvelle)
    from app.partnerhub.models import PartnerPlan
    with Session(engine) as s:
        p = s.get(PartnerPlan, uid); p.pro_until = datetime.utcnow() - timedelta(days=1); s.add(p); s.commit()
    assert c.get(H).json()["plan"]["name"] == "standard"
    assert c.post(f"{M}/restaurant/activate").status_code == 402


def test_paid_features_unlock(c):
    c.st["as"] = "partner"
    assert c.put(f"{H}/branding", json={"display_name": "Chez Mwila"}).status_code == 402
    assert c.post(f"{H}/features/nope/unlock").status_code == 404
    assert c.post(f"{H}/features/branding/unlock").status_code == 202
    req = c.get(f"{H}/admin/requests").json()["features"]
    assert req[0]["key"] == "branding"
    assert c.put(f"{H}/branding", json={"display_name": "Chez Mwila"}).status_code == 402  # demandée mais pas payée
    assert c.put(f"{H}/admin/features/{req[0]['id']}", json={"status": "active", "reference": "MM-123"}).status_code == 200
    assert c.put(f"{H}/branding", json={"display_name": "Chez Mwila", "accent": "#7b3f00"}).status_code == 200
    assert c.put(f"{H}/branding", json={"display_name": "X Y", "accent": "rouge"}).status_code == 422
    assert c.get(H).json()["branding"]["display_name"] == "Chez Mwila"
    # la promotion reste verrouillée
    promo = next(f for f in c.get(H).json()["features"]["paid"] if f["key"] == "promotion")
    assert promo["status"] == "locked"


def test_non_partner_blocked(c):
    c.st["as"] = "rookie"
    assert c.get(H).status_code == 403
    c.st["as"] = "partner"


def test_invites(c):
    r = c.post(f"{H}/admin/invites", json={"email": "Nouveau@Firm.example.com"})
    assert r.status_code == 201
    token = r.json()["link"].split("token=")[1]
    ok = c.get(f"/api/v1/partner/invites/{token}")
    assert ok.status_code == 200 and ok.json()["email"] == "nouveau@firm.example.com"
    assert c.get("/api/v1/partner/invites/mauvais").status_code == 410
    with Session(engine) as s:
        inv = s.exec(select(ApplicationInvite).where(ApplicationInvite.token_hash == hash_token(token))).one()
        assert inv.token_hash != token  # jamais stocké en clair
        inv.expires_at = datetime.utcnow() - timedelta(minutes=1); s.add(inv); s.commit()
    assert c.get(f"/api/v1/partner/invites/{token}").status_code == 410
    # sans lien valide, la candidature est refusée
    files = {"id_document": ("id.png", b"\x89PNG\r\n\x1a\n" + b"0" * 40, "image/png")}
    data = {"company": "X Corp", "contactName": "X", "category": "Shopping", "phone": "0970000000", "address": "Lusaka", "id_document_type": "passport", "id_document_number": "A1"}
    assert c.post("/api/v1/partners/apply", data=data, files=files).status_code == 410


def test_login_with_partner_code(c):
    r = c.post("/api/v1/auth/register", json={"email": "code@hub.example.com", "password": "motdepasse1", "full_name": "Code"})
    assert r.status_code == 201
    with Session(engine) as s:
        u = s.exec(select(User).where(User.email == "code@hub.example.com")).one(); u.partner_code = "HC-111222"; s.add(u); s.commit()
    ok = c.post("/api/v1/auth/login-partner", json={"code": "hc-111222", "password": "motdepasse1"})
    assert ok.status_code == 200 and ok.json()["user"]["email"] == "code@hub.example.com"
    bad = c.post("/api/v1/auth/login-partner", json={"code": "HC-111222", "password": "faux"})
    unknown = c.post("/api/v1/auth/login-partner", json={"code": "HC-000000", "password": "faux"})
    assert bad.status_code == unknown.status_code == 401 and bad.json()["detail"] == unknown.json()["detail"]


def test_premium_boost_features_exist_and_boosted_users():
    from app.partnerhub import services as ph
    from app.partnerhub.models import PartnerFeature
    assert "lodge_boost" in ph.PAID_FEATURES and "transport_boost" in ph.PAID_FEATURES
    from sqlmodel import Session
    from app.database import engine
    with Session(engine) as s:
        s.add(PartnerFeature(user_id=987654, key="lodge_boost", status="active")); s.commit()
        assert 987654 in ph.boosted_users(s, "lodge_boost")
        assert 987654 not in ph.boosted_users(s, "transport_boost")
