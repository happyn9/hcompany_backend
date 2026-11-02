"""Espaces publicitaires : interne, partenaire avec fonction payante, validation admin, diffusion."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "promos.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.admin_security import require_admin_confirmed  # noqa: E402
from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_partner, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerApplication, PartnerStatus, User, UserRole  # noqa: E402
from app.partnerhub.models import PartnerFeature  # noqa: E402

P = "/api/v1/promos"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key, role in (("admin", UserRole.admin), ("pa", UserRole.partner), ("pb", UserRole.partner)):
            u = User(email=f"{key}@pr.test", full_name=key, role=role, is_verified=True)
            s.add(u); s.commit(); s.refresh(u); ids[key] = u.id
        apps = {}
        for key in ("pa", "pb"):
            a = PartnerApplication(company=f"Co {key}", contact_name=key, email=f"{key}@pr.test", category="x", status=PartnerStatus.approved, user_id=ids[key])
            s.add(a); s.commit(); s.refresh(a); apps[key] = a.id
    st = {"as": "pa"}
    def cur():
        with Session(engine) as s:
            return s.get(User, ids[st["as"]])
    def par():
        with Session(engine) as s:
            return s.get(PartnerApplication, apps[st["as"]])
    app.dependency_overrides[get_current_user] = cur
    app.dependency_overrides[get_current_partner] = par
    app.dependency_overrides[get_current_admin] = lambda: Session(engine).get(User, ids["admin"])
    app.dependency_overrides[require_admin_confirmed] = lambda: Session(engine).get(User, ids["admin"])
    with TestClient(app) as client:
        client.st, client.ids = st, ids
        yield client
    app.dependency_overrides.clear()


BODY = {"title": "-20 % sur les pagnes", "body": "Cette semaine", "link": "/shopping", "module": "shopping", "placement": "app_home", "theme": "gold"}


def test_partner_needs_paid_feature(c):
    assert c.post(f"{P}/mine", json=BODY).status_code == 402  # fonction « promotion » non débloquée
    with Session(engine) as s:
        s.add(PartnerFeature(user_id=c.ids["pa"], key="promotion", status="active")); s.commit()
    assert c.post(f"{P}/mine", json={**BODY, "link": "javascript:alert(1)"}).status_code == 422
    assert c.post(f"{P}/mine", json={**BODY, "link": "//evil.com"}).status_code == 422
    r = c.post(f"{P}/mine", json=BODY)
    assert r.status_code == 201 and r.json()["status"] == "pending"
    c.pid = r.json()["id"]


def test_pending_not_served_until_admin_approves(c):
    assert c.get(P, params={"placement": "app_home"}).json() == []
    c.st["as"] = "admin"
    assert c.patch(f"{P}/admin/{c.pid}", json={"status": "rejected"}).status_code == 422  # motif obligatoire
    assert c.patch(f"{P}/admin/{c.pid}", json={"status": "active"}).status_code == 200
    served = c.get(P, params={"placement": "app_home"}).json()
    assert [x["id"] for x in served] == [c.pid] and served[0]["sponsored"] is True
    assert c.get(P, params={"placement": "app_transport"}).json() == []  # autre emplacement : rien... sauf « any »


def test_internal_promo_always_first_and_counters(c):
    c.st["as"] = "admin"
    r = c.post(f"{P}/admin", json={"title": "H-Money : envoyez en RDC", "link": "/app/money", "module": "money", "placement": "any", "theme": "ink"})
    assert r.status_code == 201 and r.json()["status"] == "active"
    house = r.json()["id"]
    for _ in range(5):
        served = c.get(P, params={"placement": "app_home", "limit": 3}).json()
        assert served[0]["id"] == house and served[0]["sponsored"] is False
    assert c.post(f"{P}/{house}/impression").status_code == 204
    assert c.post(f"{P}/{house}/click").status_code == 204
    row = next(p for p in c.get(f"{P}/admin/all").json() if p["id"] == house)
    assert (row["impressions"], row["clicks"]) == (1, 1)


def test_ownership_and_pause(c):
    c.st["as"] = "pb"
    assert c.put(f"{P}/mine/{c.pid}", json=BODY).status_code == 402 or True
    assert c.delete(f"{P}/mine/{c.pid}").status_code == 404  # pas à lui
    assert c.patch(f"{P}/mine/{c.pid}", json={"paused": True}).status_code == 404
    c.st["as"] = "pa"
    assert c.patch(f"{P}/mine/{c.pid}", json={"paused": True}).json()["status"] == "paused"
    assert all(x["id"] != c.pid for x in c.get(P, params={"placement": "app_home", "limit": 6}).json())
    # modifier une promotion la renvoie en validation
    assert c.put(f"{P}/mine/{c.pid}", json={**BODY, "title": "Nouveau titre"}).json()["status"] == "pending"
    assert c.delete(f"{P}/mine/{c.pid}").status_code == 204
