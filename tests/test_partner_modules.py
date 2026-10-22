"""Centralisation du partenariat : modules débloqués depuis le dashboard + connexion par QR."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "modules.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerApplication, PartnerStatus, User, UserRole  # noqa: E402

M = "/api/v1/partner/modules"
Q = "/api/v1/qr"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key in ("nobody", "pending", "partner"):
            u = User(email=f"{key}@mod.test", full_name=key.title(), role=UserRole.client, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            ids[key] = u.id
        for key, st in (("pending", PartnerStatus.pending), ("partner", PartnerStatus.approved)):
            s.add(PartnerApplication(company="Chez Mwila", contact_name="Mwila", email=f"{key}@mod.test", category="Hébergement", phone="0971234567", status=st, user_id=ids[key]))
        s.commit()
    state = {"as": "partner"}

    def _u():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    app.dependency_overrides[get_current_user] = _u
    with TestClient(app) as client:
        client.state = state
        yield client
    app.dependency_overrides.clear()


def as_(c, who):
    c.state["as"] = who


def test_requires_approved_partnership(c):
    for who in ("nobody", "pending"):
        as_(c, who)
        assert c.post(f"{M}/lodging/activate").status_code == 403
    as_(c, "nobody")
    assert c.get(M).json()["partner_status"] == "none"
    as_(c, "pending")
    assert c.get(M).json()["partner_status"] == "pending"


def test_profile_creation_gated_until_module_active(c):
    as_(c, "partner")
    assert c.post("/api/v1/transport/operator/me", json={"name": "Agence Mwila", "city": "Lusaka", "phone": "0955000111"}).status_code == 403
    assert c.put("/api/v1/lodging/host/me", json={"display_name": "Mwila Host"}).status_code == 403
    assert c.post("/api/v1/shopping/seller/shops", json={"name": "Boutique Mwila"}).status_code == 403


def test_activation_bootstraps_profiles(c):
    as_(c, "partner")
    assert c.post(f"{M}/unknown/activate").status_code == 404
    r = c.post(f"{M}/lodging/activate").json()
    lodging = next(m for m in r["modules"] if m["key"] == "lodging")
    assert lodging["active"] and lodging["has_profile"]
    host = c.get("/api/v1/lodging/host/me").json()
    assert host["display_name"] == "Chez Mwila" and host["phone"] == "0971234567"

    r = c.post(f"{M}/transport/activate").json()
    assert next(m for m in r["modules"] if m["key"] == "transport")["has_profile"]
    op = c.get("/api/v1/transport/operator/me").json()
    assert op["status"] == "approved"

    r = c.post(f"{M}/learning/activate").json()
    learning = next(m for m in r["modules"] if m["key"] == "learning")
    assert learning["active"] and not learning["has_profile"]
    # idempotent
    assert c.post(f"{M}/lodging/activate").status_code == 200

    # Shopping : le module s'active, la boutique se crée ensuite (formulaire dédié)
    c.post(f"{M}/shopping/activate")
    assert c.post("/api/v1/shopping/seller/shops", json={"name": "Boutique Mwila", "city": "Lusaka"}).status_code == 201


def test_deactivate(c):
    as_(c, "partner")
    r = c.post(f"{M}/learning/deactivate").json()
    assert not next(m for m in r["modules"] if m["key"] == "learning")["active"]
    assert c.post(f"{M}/learning/deactivate").status_code == 404


def test_qr_pairing_flow(c):
    as_(c, "partner")
    s = c.post(f"{Q}/sessions", json={"device_label": "Chrome · Windows"}).json()
    code, secret = s["code"], s["secret"]
    assert c.post(f"{Q}/sessions/{code}/poll", json={"secret": secret}).json() == {"status": "pending"}
    assert c.post(f"{Q}/sessions/{code}/poll", json={"secret": "x" * 20}).status_code == 403
    info = c.get(f"{Q}/sessions/{code}").json()
    assert info["device_label"] == "Chrome · Windows" and info["user"]["email"] == "partner@mod.test"
    assert c.post(f"{Q}/sessions/{code}/approve").status_code == 200
    assert c.post(f"{Q}/sessions/{code}/approve").status_code == 409
    got = c.post(f"{Q}/sessions/{code}/poll", json={"secret": secret}).json()
    assert got["status"] == "approved" and got["user"]["email"] == "partner@mod.test"
    # le jeton minté est accepté par le décodeur partagé
    from app.services.shared_auth import decode_shared_token
    assert decode_shared_token(got["access_token"])["sub"] == "partner@mod.test"
    # usage unique
    assert c.post(f"{Q}/sessions/{code}/poll", json={"secret": secret}).status_code == 410


def test_qr_expiry(c):
    from datetime import datetime, timedelta
    from app.models import QrSession
    from sqlmodel import select
    s = c.post(f"{Q}/sessions", json={}).json()
    with Session(engine) as db:
        q = db.exec(select(QrSession).where(QrSession.code == s["code"])).one()
        q.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.add(q)
        db.commit()
    assert c.post(f"{Q}/sessions/{s['code']}/poll", json={"secret": s["secret"]}).json() == {"status": "expired"}
    assert c.post(f"{Q}/sessions/{s['code']}/approve").status_code == 410
    assert c.get(f"{Q}/sessions/unknown").status_code == 404
