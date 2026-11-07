"""Verrou « mot de passe » de l'admin + agents H-Money par pays."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "adm.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.services.rate_limit import limiter  # noqa: E402

limiter.enabled = False
A = "/api/v1/money/admin"
G = "/api/v1/money/agent"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with TestClient(app) as client:
        client.post("/api/v1/auth/register", json={"email": "boss@adm.example.com", "password": "motdepasse1", "full_name": "Boss"})
        client.post("/api/v1/auth/register", json={"email": "agent@adm.example.com", "password": "motdepasse1", "full_name": "Agent CD"})
        client.post("/api/v1/auth/register", json={"email": "client@adm.example.com", "password": "motdepasse1", "full_name": "Client"})
        ids = {}
        with Session(engine) as s:
            from sqlmodel import select
            for key in ("boss", "agent", "client"):
                u = s.exec(select(User).where(User.email == f"{key}@adm.example.com")).one()
                u.is_verified = True
                if key == "boss":
                    u.role = UserRole.admin
                s.add(u); s.commit(); ids[key] = u.id
        st = {"as": "boss"}
        def cur():
            with Session(engine) as s:
                return s.get(User, ids[st["as"]])
        app.dependency_overrides[get_current_user] = cur
        client.st = st
        yield client
        app.dependency_overrides.clear()


def test_admin_data_needs_password(c):
    r = c.get(f"{A}/overview")
    assert r.status_code == 428
    assert c.post("/api/v1/admin-security/confirm", json={"password": "faux"}).status_code == 403
    tok = c.post("/api/v1/admin-security/confirm", json={"password": "motdepasse1"}).json()["confirm_token"]
    c.headers["X-Admin-Confirm"] = tok
    assert c.get(f"{A}/overview").status_code == 200
    # un jeton falsifié ou d'un autre compte ne passe pas
    c.headers["X-Admin-Confirm"] = tok[:-3] + "abc"
    assert c.get(f"{A}/overview").status_code == 428
    c.headers["X-Admin-Confirm"] = tok
    # un non-admin ne peut même pas demander la confirmation
    c.st["as"] = "client"
    assert c.post("/api/v1/admin-security/confirm", json={"password": "motdepasse1"}).status_code == 403
    assert c.get(f"{A}/overview").status_code == 403
    c.st["as"] = "boss"


def test_agents_per_country(c):
    assert c.post(f"{A}/agents", json={"email": "nobody@adm.example.com", "country": "CD"}).status_code == 404
    assert c.post(f"{A}/agents", json={"email": "agent@adm.example.com", "country": "XX"}).status_code == 422
    r = c.post(f"{A}/agents", json={"email": "agent@adm.example.com", "country": "CD", "can_set_rates": True})
    assert r.status_code == 201, r.text
    assert [a["country"] for a in c.get(f"{A}/agents").json()] == ["CD"]

    c.st["as"] = "client"
    assert c.get(f"{G}/me").status_code == 403
    c.st["as"] = "agent"
    me = c.get(f"{G}/me").json()
    assert me[0]["country"] == "CD" and me[0]["currency"] == "USD" and me[0]["can_set_rates"]
    assert c.get(f"{G}/transactions", params={"country": "ZM"}).status_code == 403  # hors périmètre
    assert c.get(f"{G}/transactions").status_code == 200
    # le dollar est la devise pivot : rien à fixer pour le Congo (USD)
    assert c.put(f"{G}/rate", json={"country": "CD", "per_usd": 1}).status_code == 422
    assert c.put(f"{G}/rate", json={"country": "ZM", "per_usd": 25}).status_code == 403
    assert c.get(f"{G}/transactions", params={"flagged": True}).json() == []
    c.st["as"] = "boss"
    assert c.get(f"{A}/audit").json()[0]["action"] == "agent_assigned"
    c.delete(f"{A}/agents/{c.get(f'{A}/agents').json()[0]['id']}")
    c.st["as"] = "agent"
    assert c.get(f"{G}/me").status_code == 403


def test_admin_confirm_by_email_code(c, monkeypatch):
    """Un admin sans mot de passe utilisable peut confirmer avec un code envoyé par e-mail."""
    from fastapi import HTTPException
    from app.auth_core import service as svc
    monkeypatch.setattr(svc, "create_otp", lambda s, e, p: "123456" if p == "admin_confirm" else None)
    monkeypatch.setattr("app.admin_security.send_email", lambda *a, **k: None)
    def fake_verify(s, e, p, code):
        if (p, code) != ("admin_confirm", "123456"):
            raise HTTPException(400, "Code invalide ou expiré.")
        return {}
    monkeypatch.setattr(svc, "verify_otp", fake_verify)
    c.st["as"] = "boss"
    assert c.post("/api/v1/admin-security/otp").status_code == 202
    assert c.post("/api/v1/admin-security/confirm-otp", json={"code": "000000"}).status_code == 400
    r = c.post("/api/v1/admin-security/confirm-otp", json={"code": "123456"})
    assert r.status_code == 200 and r.json()["confirm_token"]
    c.st["as"] = "client"
    assert c.post("/api/v1/admin-security/otp").status_code == 403  # un non-admin ne peut pas demander de code
    c.st["as"] = "boss"


def _tx(code, frm="ZM", to="CD"):
    from app.money.models import MoneyTransfer
    with Session(engine) as s:
        s.add(MoneyTransfer(code=code, kind="send", user_id=1, payer_user_id=1, from_country=frm, to_country=to, send_currency="ZMW", send_amount=500,
                            fee=15, total_paid=515, receive_currency="USD", receive_amount=20, rate=0.04, counterpart_name="Jean",
                            counterpart_phone="243812345678", counterpart_operator="orange", status="under_review", provider_ref="SIM-IN-X"))
        s.commit()


def test_review_confirm_and_reject_by_admin_and_agent(c):
    tok = c.post("/api/v1/admin-security/confirm", json={"password": "motdepasse1"}).json()["confirm_token"]
    c.headers["X-Admin-Confirm"] = tok
    _tx("HM-REV00001"); _tx("HM-REV00002"); _tx("HM-REV00003", "CD", "ZM")
    c.st["as"] = "boss"
    assert c.post(f"{A}/transactions/HM-REV00001/review", json={"approve": False}).status_code == 422  # motif obligatoire
    r = c.post(f"{A}/transactions/HM-REV00001/review", json={"approve": False, "reason": "Doute sur l'identité"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    r = c.post(f"{A}/transactions/HM-REV00002/review", json={"approve": True})
    assert r.status_code == 200 and r.json()["status"] == "completed"
    assert c.post(f"{A}/transactions/HM-REV00002/review", json={"approve": True}).status_code == 409  # déjà décidée
    # agent du Congo : peut décider une opération qui touche le Congo
    c.post(f"{A}/agents", json={"email": "agent@adm.example.com", "country": "ZM", "can_review": True})
    c.st["as"] = "agent"
    assert c.post(f"{G}/transactions/HM-REV00003/review", json={"approve": True}).json()["status"] == "completed"
    _tx("HM-REV00004", "FR", "BE")  # hors périmètre de l'agent (ZM)
    assert c.post(f"{G}/transactions/HM-REV00004/review", json={"approve": True}).status_code == 404
    c.st["as"] = "client"
    assert c.post(f"{G}/transactions/HM-REV00004/review", json={"approve": True}).status_code == 403
    c.st["as"] = "boss"


def test_fee_and_limits_settings(c):
    c.st["as"] = "boss"
    tok = c.post("/api/v1/admin-security/confirm", json={"password": "motdepasse1"}).json()["confirm_token"]
    c.headers["X-Admin-Confirm"] = tok
    assert c.get(f"{A}/settings").json()["fee_pct"] == 3.0
    body = {"fee_pct": 5, "min_fee_usd": 0.1, "min_usd": 3, "max_usd": 500, "daily_max_usd": 900}
    assert c.put(f"{A}/settings", json={**body, "max_usd": 2}).status_code == 422       # min ≥ max
    assert c.put(f"{A}/settings", json={**body, "fee_pct": 90}).status_code == 422      # hors bornes
    assert c.put(f"{A}/settings", json={**body, "daily_max_usd": 100}).status_code == 422
    assert c.put(f"{A}/settings", json=body).status_code == 200
    cor = c.get("/api/v1/money/corridors").json()
    assert cor["fee_pct"] == 5 and cor["limits_usd"] == {"min": 3, "max": 500, "daily": 900}
    q = c.get("/api/v1/money/quote", params={"amount": 100, "from": "ZM", "to": "CD"}).json()
    assert q["fee"] == 5.0                                                              # 5 % appliqué
    assert c.get("/api/v1/money/quote", params={"amount": 1, "from": "ZM", "to": "CD"}).status_code == 422  # sous le nouveau minimum
    assert any(a["action"] == "settings" for a in c.get(f"{A}/audit").json())
    c.st["as"] = "client"
    assert c.put(f"{A}/settings", json=body).status_code == 403
    c.st["as"] = "boss"
    c.put(f"{A}/settings", json={"fee_pct": 3, "min_fee_usd": 0.5, "min_usd": 2, "max_usd": 1000, "daily_max_usd": 2000})


def test_operator_fees_admin(c):
    c.st["as"] = "boss"
    tok = c.post("/api/v1/admin-security/confirm", json={"password": "motdepasse1"}).json()["confirm_token"]
    c.headers["X-Admin-Confirm"] = tok
    rows = c.get(f"{A}/operators").json()
    assert any(r["operator"] == "orange" and r["direction"] == "out" and r["pct"] == 2.16 and r["confirmed"] for r in rows)
    assert any(r["operator"] == "airtel" and r["country"] == "ZM" and r["direction"] == "out" and not r["confirmed"] for r in rows)  # hypothèse signalée
    base = c.get("/api/v1/money/quote", params={"amount": 500, "from": "ZM", "to": "CD", "ben_op": "orange"}).json()["fee"]
    # l'agrégateur augmente le tarif Orange (versement) à 5 % : les frais suivent, la marge reste protégée
    assert c.put(f"{A}/operators", json={"country": "CD", "operator": "orange", "direction": "out", "enabled": True, "pct": 5, "tiers": [], "confirmed": True}).status_code == 200
    assert c.get("/api/v1/money/quote", params={"amount": 500, "from": "ZM", "to": "CD", "ben_op": "orange"}).json()["fee"] > base
    # désactiver Orange : il n'est plus proposé
    c.put(f"{A}/operators", json={"country": "CD", "operator": "orange", "direction": "out", "enabled": False, "pct": 5, "tiers": [], "confirmed": True})
    assert [o["key"] for o in c.get("/api/v1/money/corridors").json()["operators"]["CD"] if o["receive"]] == ["airtel"]
    assert c.put(f"{A}/operators", json={"country": "CD", "operator": "nope", "direction": "out", "pct": 1}).status_code == 422
    assert c.put(f"{A}/operators", json={"country": "ZM", "operator": "mtn", "direction": "in", "pct": 1, "tiers": [[-5, 1]]}).status_code == 422
    c.st["as"] = "client"
    assert c.put(f"{A}/operators", json={"country": "CD", "operator": "orange", "direction": "out", "pct": 1}).status_code == 403
    c.st["as"] = "boss"
    c.put(f"{A}/operators", json={"country": "CD", "operator": "orange", "direction": "out", "enabled": True, "pct": 1, "tiers": [], "confirmed": True})
