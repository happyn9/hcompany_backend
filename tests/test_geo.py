"""Pays, taux, conversion, bénéficiaires."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "geo.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.admin_security import require_admin_confirmed  # noqa: E402
from app.deps import get_current_admin, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        a = User(email="a@x.com", full_name="Admin", role=UserRole.admin, is_verified=True)
        u = User(email="u@x.com", full_name="User", role=UserRole.client, is_verified=True)
        s.add(a); s.add(u); s.commit(); s.refresh(a); s.refresh(u)
        ids = (a.id, u.id)
    cur = {"id": ids[1]}
    def _user():
        with Session(engine) as s:
            return s.get(User, cur["id"])
    def _admin():
        with Session(engine) as s:
            return s.get(User, ids[0])
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_current_admin] = _admin
    app.dependency_overrides[require_admin_confirmed] = _admin
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_countries_seeded(c):
    r = c.get("/api/v1/geo/countries").json()
    codes = [x["code"] for x in r]
    assert "ZM" in codes and "CD" in codes
    assert next(x for x in r if x["code"] == "CD")["currency"] == "USD"


def test_convert_and_margin(c):
    assert c.get("/api/v1/geo/convert", params={"amount": 10, "from": "USD", "to": "ZMW"}).json()["amount"] == 250.0
    assert c.put("/api/v1/geo/admin/rates/ZMW", json={"per_usd": 20, "margin_pct": 5}).status_code == 200
    assert c.get("/api/v1/geo/convert", params={"amount": 10, "from": "USD", "to": "ZMW"}).json()["amount"] == 210.0
    assert c.get("/api/v1/geo/convert", params={"amount": 100, "from": "ZMW", "to": "ZMW"}).json()["amount"] == 100.0
    r = c.get("/api/v1/geo/convert", params={"amount": 1, "from": "USD", "to": "CDF"}).json()["amount"]
    assert r % 50 == 0


def test_rate_validation(c):
    assert c.put("/api/v1/geo/admin/rates/USD", json={"per_usd": 2}).status_code == 422
    assert c.put("/api/v1/geo/admin/rates/ZMW", json={"per_usd": -1}).status_code == 422
    assert c.get("/api/v1/geo/convert", params={"amount": 1, "from": "USD", "to": "XXX"}).status_code == 422


def test_country_upsert(c):
    assert c.put("/api/v1/geo/admin/countries/AO", json={"name_fr": "Angola", "currency": "USD", "dial_code": "244", "is_service_country": True}).status_code == 200
    assert c.put("/api/v1/geo/admin/countries/AO", json={"name_fr": "Angola", "currency": "AOA"}).status_code == 422  # pas de taux


def test_beneficiary(c):
    p = {"service": "shop", "ref": "ORD1", "name": "Maman", "phone": "+243 81 234 5678", "country_code": "cd"}
    r = c.post("/api/v1/geo/beneficiaries", json=p)
    assert r.status_code == 201 and r.json()["phone"] == "243812345678" and r.json()["country_code"] == "CD"
    c.post("/api/v1/geo/beneficiaries", json={**p, "name": "Tante"})
    rows = c.get("/api/v1/geo/beneficiaries", params={"service": "shop", "ref": "ORD1"}).json()
    assert len(rows) == 1 and rows[0]["name"] == "Tante"
    assert c.post("/api/v1/geo/beneficiaries", json={**p, "service": "zzz"}).status_code == 422
    assert c.post("/api/v1/geo/beneficiaries", json={**p, "phone": "12"}).status_code == 422
