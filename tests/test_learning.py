"""Tests du parcours H-Learning : playlist YouTube, cours/leçons gratuits,
inscription au présentiel. Base SQLite jetable, YouTube simulé."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "t.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.routers import learning as learning_router  # noqa: E402
from app.services import youtube  # noqa: E402


@pytest.fixture(scope="module")
def client():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        admin = User(email="admin@test.io", full_name="Admin", role=UserRole.admin, is_verified=True)
        user = User(email="eleve@test.io", full_name="Élève", role=UserRole.client, is_verified=True)
        s.add(admin)
        s.add(user)
        s.commit()
        s.refresh(admin)
        s.refresh(user)
        ids = (admin.id, user.id)
    state = {"as": "admin"}

    def _user(uid):
        with Session(engine) as s:
            return s.get(User, uid)

    app.dependency_overrides[get_current_admin] = lambda: _user(ids[0])
    app.dependency_overrides[get_current_user] = lambda: _user(ids[1] if state["as"] == "user" else ids[0])
    with TestClient(app) as c:
        c.state = state
        yield c
    app.dependency_overrides.clear()


def test_parse_playlist_and_video_ids():
    assert youtube.parse_playlist_id("https://www.youtube.com/playlist?list=PLabcdefghij123") == "PLabcdefghij123"
    assert youtube.parse_playlist_id("PLabcdefghij123") == "PLabcdefghij123"
    assert youtube.parse_playlist_id("https://example.com/x") is None
    assert youtube.parse_video_id("https://youtu.be/dQw4w9WgXcQ?t=3") == "dQw4w9WgXcQ"
    assert youtube.parse_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx") == "dQw4w9WgXcQ"
    assert youtube.parse_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert youtube.parse_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert youtube.parse_video_id("https://evil.com/watch?v=dQw4w9WgXcQ") is None
    assert youtube._iso_duration_to_seconds("PT1H2M3S") == 3723


def test_rss_parsing(monkeypatch):
    xml = b"""<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
    <entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>Deux</title><published>2026-02-01T10:00:00+00:00</published><media:group><media:description>d2</media:description></media:group></entry>
    <entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Un</title><published>2026-01-01T10:00:00+00:00</published><media:group><media:description>d1</media:description></media:group></entry></feed>"""

    class R:
        status_code = 200
        content = xml
    monkeypatch.setattr(youtube.httpx, "get", lambda *a, **k: R())
    items = youtube._fetch_rss("PLabcdefghij123")
    assert [i["title"] for i in items] == ["Un", "Deux"]  # ordre de publication
    assert items[0]["description"] == "d1"


def test_course_lifecycle_and_free_catalog(client, monkeypatch):
    monkeypatch.setattr(learning_router, "fetch_playlist", lambda pid: [
        {"youtube_id": "AAAAAAAAAAA", "title": "Intro", "description": "", "published_at": None, "duration_seconds": 600},
        {"youtube_id": "BBBBBBBBBBB", "title": "Suite", "description": "", "published_at": None, "duration_seconds": 300},
    ])
    r = client.post("/api/v1/learning/admin/courses", json={
        "title": "Bureautique", "level": "Initiation", "description": "Word et Excel",
        "youtube_playlist": "https://www.youtube.com/playlist?list=PLabcdefghij123",
        "outcomes": "Écrire un CV\nFaire un tableau", "requirements": "Aucun",
    })
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert r.json()["lesson_count"] == 2

    # catalogue public : pas d'authentification, durée agrégée
    client.state["as"] = "user"
    pub = client.get("/api/v1/learning/courses").json()
    mine = next(c for c in pub if c["id"] == cid)
    assert mine["lesson_count"] == 2 and mine["total_seconds"] == 900

    detail = client.get(f"/api/v1/learning/courses/{cid}").json()
    assert [l["title"] for l in detail["lessons"]] == ["Intro", "Suite"]
    assert detail["outcomes"] == ["Écrire un CV", "Faire un tableau"]
    assert detail["lessons"][0]["thumbnail_url"].endswith("/AAAAAAAAAAA/hqdefault.jpg")

    # progression d'un utilisateur connecté
    lid = detail["lessons"][0]["id"]
    p = client.put(f"/api/v1/learning/lessons/{lid}/progress", json={"completed": True, "position_seconds": 590})
    assert p.status_code == 200
    p = client.put(f"/api/v1/learning/lessons/{lid}/progress", json={"completed": False, "position_seconds": 10})
    assert p.json()["completed"] is True  # reste terminée
    assert client.get(f"/api/v1/learning/me/progress?course_id={cid}").json()[0]["lesson_id"] == lid

    # une vidéo retirée de la playlist est dépubliée, pas supprimée
    monkeypatch.setattr(learning_router, "fetch_playlist", lambda pid: [
        {"youtube_id": "AAAAAAAAAAA", "title": "Intro (v2)", "description": "", "published_at": None, "duration_seconds": 600},
    ])
    client.state["as"] = "admin"
    assert client.post(f"/api/v1/learning/admin/courses/{cid}/sync").status_code == 200
    detail = client.get(f"/api/v1/learning/courses/{cid}").json()
    assert [l["title"] for l in detail["lessons"]] == ["Intro (v2)"]

    # leçon manuelle + lien invalide
    ok = client.post(f"/api/v1/learning/admin/courses/{cid}/lessons", json={"title": "Bonus", "youtube_url": "https://youtu.be/CCCCCCCCCCC"})
    assert ok.status_code == 201
    bad = client.post(f"/api/v1/learning/admin/courses/{cid}/lessons", json={"title": "X", "youtube_url": "https://vimeo.com/1"})
    assert bad.status_code == 422

    # playlist invalide refusée
    bad = client.put(f"/api/v1/learning/admin/courses/{cid}", json={"title": "Bureautique", "youtube_playlist": "pas un lien"})
    assert bad.status_code == 422


def test_sync_error_is_readable(client, monkeypatch):
    def boom(pid):
        raise youtube.YouTubeError("Playlist introuvable ou privée.")
    monkeypatch.setattr(learning_router, "fetch_playlist", boom)
    cid = client.post("/api/v1/learning/admin/courses", json={"title": "Test", "youtube_playlist": "PLabcdefghij999"}).json()["id"]
    r = client.post(f"/api/v1/learning/admin/courses/{cid}/sync")
    assert r.status_code == 502 and "privée" in r.json()["detail"]


def test_in_person_registration(client, monkeypatch):
    sent = []
    monkeypatch.setattr(learning_router, "send_email", lambda *a, **k: sent.append(a))
    courses = client.get("/api/v1/learning/courses").json()
    r = client.post("/api/v1/learning/registrations", json={
        "full_name": "Marie Kabo", "email": "marie@test.io", "phone": "+260970000000",
        "city": "Lusaka", "course_id": courses[0]["id"], "availability": "Week-ends",
    })
    assert r.status_code == 201, r.text
    assert r.json()["course_title"] == courses[0]["title"] and r.json()["status"] == "new"
    assert sent and sent[0][0] == "marie@test.io"
    assert client.post("/api/v1/learning/registrations", json={"full_name": "A B", "email": "a@b.io", "course_id": 99999}).status_code == 422

    client.state["as"] = "admin"
    reg_id = r.json()["id"]
    up = client.patch(f"/api/v1/learning/admin/registrations/{reg_id}/status", json={"status": "contacted"})
    assert up.json()["status"] == "contacted"
    assert client.patch(f"/api/v1/learning/admin/registrations/{reg_id}/status", json={"status": "nope"}).status_code == 422
    assert any(x["id"] == reg_id for x in client.get("/api/v1/learning/admin/registrations").json())


# --------------------------------------------------------------------------
# Bouquets : catalogue, devises, paiement, contenu exclusif, équipe
# --------------------------------------------------------------------------

def _as(client, who):
    client.state["as"] = who


def test_plans_catalog_and_currencies(client):
    data = client.get("/api/v1/learning/plans").json()
    assert data["pivot"] == "ZMW"
    assert [p["code"] for p in data["plans"]] == ["individuel", "pro", "equipe"]
    assert data["currencies"][0]["code"] == "ZMW" and data["currencies"][0]["rate"] == 1.0
    team = data["plans"][2]
    assert team["per_seat"] and team["min_seats"] == 5
    assert data["plans"][0]["yearly_saving_pct"] == 17


def test_admin_currencies_keep_pivot_at_one(client):
    _as(client, "admin")
    r = client.put("/api/v1/learning/admin/currencies", json={"currencies": [
        {"code": "ZMW", "label": "Kwacha", "symbol": "K", "rate": 9},
        {"code": "USD", "label": "Dollar", "symbol": "$", "rate": 0.05},
    ]})
    assert r.status_code == 200
    rates = {c["code"]: c["rate"] for c in r.json()}
    assert rates == {"ZMW": 1.0, "USD": 0.05}
    bad = client.put("/api/v1/learning/admin/currencies", json={"currencies": [
        {"code": "USD", "label": "Dollar", "symbol": "$", "rate": 0.05}]})
    assert bad.status_code == 422
    client.put("/api/v1/learning/admin/currencies", json={"currencies": [
        {"code": "ZMW", "label": "Kwacha", "symbol": "K", "rate": 1},
        {"code": "USD", "label": "Dollar", "symbol": "$", "rate": 0.04},
        {"code": "CDF", "label": "Franc", "symbol": "FC", "rate": 110}]})


def test_checkout_validations(client):
    _as(client, "user")
    url = "/api/v1/learning/checkout"
    base = {"plan_code": "pro", "period": "month", "method": "mtn_momo", "phone": "0961234567"}
    assert client.post(url, json={**base, "phone": "12"}).status_code == 422
    wrong = client.post(url, json={**base, "phone": "0971234567"})  # numéro Airtel sur MTN
    assert wrong.status_code == 422 and "MTN" in wrong.json()["detail"]
    assert client.post(url, json={**base, "plan_code": "nope"}).status_code == 404
    assert client.post(url, json={"plan_code": "equipe", "period": "month", "seats": 2, "org_name": "ACME",
                                  "method": "card"}).status_code == 422
    assert client.post(url, json={"plan_code": "equipe", "period": "month", "seats": 6,
                                  "method": "card"}).status_code == 422  # nom d'équipe manquant


def test_checkout_unlocks_exclusive_content_and_team_members(client):
    admin_url = "/api/v1/learning/admin/courses"
    _as(client, "admin")
    course = client.post(admin_url, json={"title": "Cours privé", "level": "Pro", "members_only": True}).json()
    lesson = client.post(f"{admin_url}/{course['id']}/lessons", json={
        "title": "Leçon secrète", "youtube_url": "dQw4w9WgXcQ"}).json()
    assert lesson["members_only"] is False
    patched = client.patch(f"/api/v1/learning/admin/lessons/{lesson['id']}", json={"members_only": True})
    assert patched.status_code == 200 and patched.json()["members_only"] is True

    from app.deps import get_optional_user
    state = client.state
    with Session(engine) as s:
        from sqlmodel import select
        eleve = s.exec(select(User).where(User.email == "eleve@test.io")).one()
        eleve_id = eleve.id
    app.dependency_overrides[get_optional_user] = lambda: None
    detail = client.get(f"/api/v1/learning/courses/{course['id']}").json()
    assert detail["has_exclusive_access"] is False
    assert detail["lessons"][0]["locked"] is True
    assert detail["lessons"][0]["youtube_id"] == ""  # l'identifiant ne fuit pas

    # Achat d'un bouquet équipe (6 places) par l'élève : montant recalculé côté serveur.
    _as(client, "user")
    r = client.post("/api/v1/learning/checkout", json={
        "plan_code": "equipe", "period": "year", "seats": 6, "org_name": "ACME SARL",
        "method": "zamtel_money", "phone": "0951234567", "currency": "USD"})
    assert r.status_code == 201, r.text
    sub = r.json()
    assert sub["status"] == "active" and sub["amount_pivot"] == 7200 and sub["simulated"] is True
    assert sub["days_left"] in (364, 365)

    def _owner():
        with Session(engine) as s:
            return s.get(User, eleve_id)

    app.dependency_overrides[get_optional_user] = _owner
    unlocked = client.get(f"/api/v1/learning/courses/{course['id']}").json()
    assert unlocked["has_exclusive_access"] is True
    assert unlocked["lessons"][0]["youtube_id"] == "dQw4w9WgXcQ"

    # Le titulaire ajoute un collègue par e-mail ; limite = places - 1.
    sid = sub["id"]
    ok = client.post(f"/api/v1/learning/me/subscription/{sid}/members", json={"email": "Collegue@Test.io"})
    assert ok.status_code == 201 and ok.json()["members"][0]["email"] == "collegue@test.io"
    for i in range(4):
        client.post(f"/api/v1/learning/me/subscription/{sid}/members", json={"email": f"p{i}@test.io"})
    full = client.post(f"/api/v1/learning/me/subscription/{sid}/members", json={"email": "extra@test.io"})
    assert full.status_code == 409
    me = client.get("/api/v1/learning/me/subscription").json()
    assert me["active"]["plan_code"] == "equipe" and len(me["history"]) >= 1
    app.dependency_overrides.pop(get_optional_user, None)
    state["as"] = "admin"


def test_admin_manual_subscription_and_status(client):
    _as(client, "admin")
    r = client.post("/api/v1/learning/admin/subscriptions", json={
        "user_email": "eleve@test.io", "plan_code": "individuel", "period": "month", "note": "payé en espèces"})
    assert r.status_code == 201, r.text
    sub = r.json()
    assert sub["method"] == "cash" and sub["status"] == "active" and sub["user_email"] == "eleve@test.io"
    assert client.post("/api/v1/learning/admin/subscriptions", json={
        "user_email": "inconnu@test.io", "plan_code": "pro"}).status_code == 404
    cancelled = client.patch(f"/api/v1/learning/admin/subscriptions/{sub['id']}/status", json={"status": "cancelled"})
    assert cancelled.json()["status"] == "cancelled"
    listed = client.get("/api/v1/learning/admin/subscriptions?status=cancelled").json()
    assert any(x["id"] == sub["id"] for x in listed)
    # Un bouquet déjà acheté est désactivé, jamais supprimé.
    plans = client.get("/api/v1/learning/admin/plans").json()
    indiv = next(p for p in plans if p["code"] == "individuel")
    assert client.delete(f"/api/v1/learning/admin/plans/{indiv['id']}").status_code == 204
    after = client.get("/api/v1/learning/admin/plans").json()
    assert next(p for p in after if p["code"] == "individuel")["is_active"] is False
