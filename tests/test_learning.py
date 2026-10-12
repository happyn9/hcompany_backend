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
