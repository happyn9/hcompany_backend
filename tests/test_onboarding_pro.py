"""Onboarding pro : profil enrichi, suggestions par service, validations."""
import os
import tempfile

os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'ob.db')}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402

U = "/api/v1/onboarding/me"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = []
        for e in ("a@ob.test", "b@ob.test"):
            u = User(email=e, full_name="X", role=UserRole.client, is_verified=True); s.add(u); s.commit(); s.refresh(u); ids.append(u.id)
    st = {"i": 0}
    def cur():
        with Session(engine) as s:
            return s.get(User, ids[st["i"]])
    app.dependency_overrides[get_current_user] = cur
    with TestClient(app) as client:
        client.st = st
        yield client
    app.dependency_overrides.clear()


def test_not_completed_then_full_profile(c):
    assert c.get(U).json()["completed"] is False
    r = c.post(U, json={"account_type": "business", "company_name": "  Mwamba   Shop ", "country": "zm", "city": "Lusaka", "phone": "+260 96 111 2233", "language": "fr",
                        "interests": ["money", "logement", "nope"], "purposes": ["send_money", "sell", "bad"], "wants_partner": True, "referral_source": "Recommandation"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["completed"] and j["company_name"] == "Mwamba Shop" and j["country"] == "ZM" and j["interests"] == ["money", "logement"] and j["purposes"] == ["send_money", "sell"]
    hrefs = [s["cta_href"] for s in j["suggestions"]]
    assert "/app/money" in hrefs and "/app/logement" in hrefs and "/infos#rejoindre" in hrefs
    assert c.get(U).json()["city"] == "Lusaka"
    with Session(engine) as s:
        assert s.get(User, 1).phone == "+260 96 111 2233"


def test_validation(c):
    assert c.post(U, json={"account_type": "business"}).status_code == 422  # entreprise sans nom
    assert c.post(U, json={"account_type": "alien"}).status_code == 422
    assert c.post(U, json={"country": "ZMB"}).status_code == 422
    assert c.post(U, json={"language": "de"}).status_code == 422
    c.st["i"] = 1
    ok = c.post(U, json={"account_type": "individual", "company_name": "ignoré", "interests": [], "phone": "12"})
    assert ok.status_code == 200 and ok.json()["company_name"] is None
    assert ok.json()["suggestions"][0]["title"]  # suggestion par défaut
    with Session(engine) as s:
        assert s.get(User, 2).phone is None  # numéro invraisemblable : non enregistré
