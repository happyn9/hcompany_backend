"""Agents H-Company : création par l'admin, départements, présence en ligne, chat d'assistance, stats."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "agents.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_agent, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.services.identity import resolve_local_user  # noqa: E402

A = "/api/v1/agents"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    ids = {}
    with Session(engine) as s:
        for key, role in (("admin", UserRole.admin), ("ann", UserRole.client), ("bob", UserRole.client), ("user", UserRole.client)):
            u = User(email=f"{key}@example.com", full_name=key.title(), role=role, is_verified=True)
            s.add(u); s.commit(); s.refresh(u)
            ids[key] = u.id
    state = {"as": "admin"}

    def _u():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    def _admin():
        u = _u()
        if u.role != UserRole.admin:
            from fastapi import HTTPException
            raise HTTPException(403)
        return u

    def _agent():
        u = _u()
        if u.role not in (UserRole.agent, UserRole.admin):
            from fastapi import HTTPException
            raise HTTPException(403)
        return u

    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_current_admin] = _admin
    app.dependency_overrides[get_current_agent] = _agent
    with TestClient(app) as client:
        client.state, client.ids = state, ids
        yield client
    app.dependency_overrides.clear()


def as_(c, who):
    c.state["as"] = who


def test_admin_creates_agents(c):
    as_(c, "admin")
    assert c.post(f"{A}/admin", json={"email": "ann@example.com", "departments": []}).status_code == 422
    assert c.post(f"{A}/admin", json={"email": "ann@example.com", "title": "Responsable formation", "departments": ["learning", "bogus"]}).json()["status"] == "created"
    assert c.post(f"{A}/admin", json={"email": "ann@example.com", "departments": ["learning"]}).status_code == 409
    assert c.post(f"{A}/admin", json={"email": "bob@example.com", "departments": ["transport", "partnerships"]}).status_code == 201
    # compte inexistant : invitation, appliquée à la première connexion
    assert c.post(f"{A}/admin", json={"email": "New.Agent@example.com", "full_name": "Nouveau", "departments": ["shopping"]}).json()["status"] == "invited"
    rows = c.get(f"{A}/admin").json()
    assert {r["email"]: r["departments"] for r in rows}["ann@example.com"] == ["learning"]
    assert any(r["pending"] for r in rows)
    with Session(engine) as s:
        u = resolve_local_user(s, uid=777, email="new.agent@example.com")
        assert u.role == UserRole.agent
    assert not any(r["pending"] for r in c.get(f"{A}/admin").json())
    # un client ne peut pas administrer les agents
    as_(c, "user")
    assert c.get(f"{A}/admin").status_code == 403
    assert c.post(f"{A}/admin", json={"email": "x@y.com", "departments": ["learning"]}).status_code == 403


def test_presence_and_support_chat(c):
    as_(c, "user")
    assert c.get("/api/v1/support/availability", params={"module": "learning"}).json()["available"] is False
    body = {"module": "learning", "subject": "Bouquet équipe", "message": "Bonjour, je veux un devis pour 10 personnes."}
    assert c.post("/api/v1/support/threads", json=body).status_code == 409  # aucun agent en ligne
    as_(c, "ann")
    assert c.post(f"{A}/heartbeat").status_code == 200
    as_(c, "user")
    assert c.get("/api/v1/support/availability", params={"module": "learning"}).json() == {"module": "learning", "online": 1, "available": True}
    assert c.get("/api/v1/support/availability", params={"module": "transport"}).json()["available"] is False
    r = c.post("/api/v1/support/threads", json=body)
    assert r.status_code == 201, r.text
    th = r.json()
    assert th["status"] == "assigned" and th["messages"][0]["role"] == "user"
    assert c.post("/api/v1/support/threads", json=body).status_code == 409  # une seule conversation ouverte par service

    as_(c, "bob")  # autre département : ne voit rien
    assert c.get(f"{A}/threads").json() == []
    assert c.get(f"{A}/threads/{th['code']}").status_code == 404
    as_(c, "ann")
    inbox = c.get(f"{A}/threads").json()
    assert [t["code"] for t in inbox] == [th["code"]] and inbox[0]["user_email"] == "user@example.com"
    assert c.post(f"{A}/threads/{th['code']}/messages", json={"body": "Avec plaisir, quelle durée ?"}).status_code == 200
    as_(c, "user")
    msgs = c.get(f"/api/v1/support/threads/{th['code']}").json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "agent"]
    last = msgs[-1]["id"]
    c.post(f"/api/v1/support/threads/{th['code']}/messages", json={"body": "12 mois."})
    assert [m["role"] for m in c.get(f"/api/v1/support/threads/{th['code']}", params={"after": last}).json()["messages"]] == ["user"]
    assert c.get(f"/api/v1/support/threads/{th['code']}").json()["user_name"] is None  # pas de fuite côté utilisateur
    as_(c, "ann")
    assert c.post(f"{A}/threads/{th['code']}/close").json()["status"] == "closed"
    as_(c, "user")
    assert c.post(f"/api/v1/support/threads/{th['code']}/messages", json={"body": "?"}).status_code == 409


def test_agent_stats_and_admin_controls(c):
    as_(c, "ann")
    st = c.get(f"{A}/me/stats").json()
    assert set(st) == {"learning"} and st["learning"]["count"] == 0 and len(st["learning"]["series"]) == 14
    as_(c, "bob")
    st = c.get(f"{A}/me/stats").json()
    assert set(st) == {"transport", "partnerships"} and "applications" in st["partnerships"]
    as_(c, "admin")
    bob = c.ids["bob"]
    assert set(c.get(f"{A}/admin/{bob}/stats").json()) == {"transport", "partnerships"}
    assert c.put(f"{A}/admin/{bob}", json={"departments": ["lodging"]}).json()["departments"] == ["lodging"]
    assert c.put(f"{A}/admin/{bob}", json={"departments": ["nope"]}).status_code == 422
    assert c.put(f"{A}/admin/{bob}", json={"is_active": False}).json()["is_active"] is False
    assert c.delete(f"{A}/admin/{bob}").status_code == 204
    with Session(engine) as s:
        assert s.get(User, bob).role == UserRole.client
