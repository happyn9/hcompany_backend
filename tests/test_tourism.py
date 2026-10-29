"""H-Tourisme : fiche → départs → validation admin → recherche → réservation (places, doublons, tarifs)
→ gestion par l'opérateur → avis → statistiques et module agents."""
import io
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "tour.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

import app.agents  # noqa: E402,F401
from app.agents import module_stats  # noqa: E402
from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerModule, User, UserRole  # noqa: E402
from app.tourism.models import TourBooking  # noqa: E402
from app.tourism.services import local_now  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
API = "/api/v1/tourism"


def day(offset=5):
    return (local_now().date() + timedelta(days=offset)).isoformat()


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key, role in (("admin", UserRole.admin), ("owner", UserRole.client), ("g1", UserRole.client), ("g2", UserRole.client), ("stranger", UserRole.client)):
            u = User(email=f"{key}@example.com", full_name=f"{key.title()} Test", role=role, is_verified=True)
            s.add(u); s.commit(); s.refresh(u)
            ids[key] = u.id
        s.add(PartnerModule(user_id=ids["owner"], module="tourism"))
        s.commit()
    state = {"as": "owner"}

    def who():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    app.dependency_overrides[get_current_user] = who
    app.dependency_overrides[get_optional_user] = who
    app.dependency_overrides[get_current_admin] = lambda: _admin(ids)
    with TestClient(app) as client:
        client.state, client.ids = state, ids
        yield client
    app.dependency_overrides.clear()


def _admin(ids):
    with Session(engine) as s:
        return s.get(User, ids["admin"])


def as_(c, w):
    c.state["as"] = w


def test_full_flow(c):
    as_(c, "owner")
    img = c.post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(PNG), "image/png")}).json()["path"]
    assert c.post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(b"nope"), "image/png")}).status_code == 400
    body = {"title": "Chutes Victoria au lever du soleil", "summary": "Visite guidée des chutes", "description": "Une matinée inoubliable.", "category": "waterfall", "city": "Livingstone",
            "meeting_point": "Entrée principale du parc", "duration_hours": 3.5, "difficulty": "easy", "languages": ["fr", "en"], "price_adult": 450, "price_child": 225, "max_group": 6,
            "includes": ["Guide", "Eau"], "excludes": ["Repas"], "itinerary": [{"title": "Départ", "text": "Rendez-vous à l'entrée"}], "images": [img]}
    r = c.post(f"{API}/owner/tours", json=body)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    assert c.post(f"{API}/owner/tours", json={**body, "category": "zzz"}).status_code == 422
    assert c.post(f"{API}/owner/tours", json={**body, "images": ["tourism/999-aaaaaaaaaaaa.png"]}).status_code == 422
    # pas de départ → envoi refusé
    r = c.post(f"{API}/owner/tours/{tid}/submit")
    assert r.status_code == 422 and "départ" in r.text
    # départs en série
    assert c.post(f"{API}/owner/tours/{tid}/departures", json={"start": day(-3), "end": day(10), "times": ["07:00"]}).status_code == 422  # passé
    r = c.post(f"{API}/owner/tours/{tid}/departures", json={"start": day(3), "end": day(9), "times": ["07:00", "15:00"], "weekdays": [0, 1, 2, 3, 4, 5, 6]})
    assert r.status_code == 201 and r.json()["created"] == 14
    assert c.post(f"{API}/owner/tours/{tid}/departures", json={"start": day(3), "end": day(9), "times": ["07:00"]}).json()["created"] == 0  # doublons ignorés
    assert c.post(f"{API}/owner/tours/{tid}/submit").status_code == 200
    # invisible tant que non validé
    as_(c, "g1")
    assert c.get(f"{API}/search").json()["total"] == 0
    as_(c, "stranger")
    assert c.put(f"{API}/owner/tours/{tid}", json=body).status_code == 404
    as_(c, "admin")
    assert c.post(f"{API}/admin/tours/{tid}/reject", json={}).status_code == 422
    assert c.post(f"{API}/admin/tours/{tid}/approve").status_code == 200
    assert c.get(f"{API}/admin/overview").json()["tours"]["active"] == 1

    as_(c, "g1")
    res = c.get(f"{API}/search?city=livingstone&category=waterfall").json()
    assert res["total"] == 1 and res["items"][0]["from_price"] == 450 and res["items"][0]["next_day"] == day(3)
    assert c.get(f"{API}/search?people=7").json()["total"] == 0  # capacité 6
    assert c.get(f"{API}/search?max_price=100").json()["total"] == 0
    det = c.get(f"{API}/tours/{res['items'][0]['slug']}").json()
    assert len(det["departures"]) == 14 and det["includes"] == ["Guide", "Eau"] and det["itinerary"][0]["title"] == "Départ"
    dep = det["departures"][0]["id"]

    # réservation : tarifs, places, doublon
    r = c.post(f"{API}/bookings", json={"departure_id": dep, "adults": 2, "children": 1, "name": "Guest One", "phone": "0971"})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["total"] == 450 * 2 + 225 and b["status"] == "pending"
    assert c.post(f"{API}/bookings", json={"departure_id": dep, "adults": 1, "name": "Guest One"}).status_code == 409  # doublon
    as_(c, "g2")
    r = c.post(f"{API}/bookings", json={"departure_id": dep, "adults": 4, "name": "Guest Two"})
    assert r.status_code == 409 and "3 place" in r.text  # 6 - 3 réservées
    assert c.post(f"{API}/bookings", json={"departure_id": dep, "adults": 3, "name": "Guest Two"}).status_code == 201
    assert c.post(f"{API}/bookings", json={"departure_id": dep, "adults": 1, "name": "Late"}).status_code == 409  # complet
    left = [d for d in c.get(f"{API}/tours/{tid}/departures").json() if d["id"] == dep][0]["seats_left"]
    assert left == 0

    # opérateur : confirmer, refuser, capacité, suppression
    as_(c, "owner")
    lst = c.get(f"{API}/owner/tours/{tid}/bookings?upcoming=1").json()
    assert len(lst) == 2
    assert c.post(f"{API}/owner/bookings/{b['code']}/action", json={"action": "confirm"}).json()["status"] == "confirmed"
    assert c.post(f"{API}/owner/bookings/{b['code']}/action", json={"action": "confirm"}).status_code == 409
    assert c.post(f"{API}/owner/bookings/{b['code']}/action", json={"action": "complete"}).status_code == 409  # départ pas encore passé
    other = [x for x in lst if x["code"] != b["code"]][0]
    assert c.post(f"{API}/owner/bookings/{other['code']}/action", json={"action": "decline", "reason": "Complet côté guide"}).json()["status"] == "declined"
    assert c.get(f"{API}/tours/{tid}/departures").json()[0]["seats_left"] == 3  # la place refusée est libérée
    assert c.put(f"{API}/owner/departures/{dep}", json={"capacity": 2}).status_code == 409
    assert c.delete(f"{API}/owner/departures/{dep}").status_code == 409
    assert c.put(f"{API}/owner/departures/{dep}", json={"capacity": 8, "price_adult": 500, "is_open": True}).json()["price_adult"] == 500
    as_(c, "stranger")
    assert c.post(f"{API}/owner/bookings/{b['code']}/action", json={"action": "cancel"}).status_code == 404

    # annulation par le voyageur (confirmée, >24h → pas tardive)
    as_(c, "g1")
    r = c.post(f"{API}/me/bookings/{b['code']}/cancel").json()
    assert r["status"] == "cancelled" and r["late"] is False
    assert c.post(f"{API}/me/bookings/{b['code']}/cancel").status_code == 409
    assert len(c.get(f"{API}/me/bookings").json()) == 1

    # avis : seulement après « terminée »
    with Session(engine) as s:
        x = TourBooking(code="TR-DONE01", tour_id=tid, departure_id=dep, user_id=c.ids["g1"], name="G", adults=2, children=0, total=900, status="completed", tour_title="t", day=local_now().date() - timedelta(days=2), time="07:00")
        s.add(x); s.commit()
    assert c.post(f"{API}/me/bookings/{b['code']}/review", json={"rating": 5}).status_code == 409
    assert c.post(f"{API}/me/bookings/TR-DONE01/review", json={"rating": 4, "comment": "Superbe"}).status_code == 201
    assert c.post(f"{API}/me/bookings/TR-DONE01/review", json={"rating": 4}).status_code == 409
    assert c.get(f"{API}/tours/{tid}/reviews").json()[0]["comment"] == "Superbe"
    assert c.get(f"{API}/tours/{det['slug']}").json()["rating_count"] == 1

    # pause / reprise / suspension
    as_(c, "owner")
    assert c.post(f"{API}/owner/tours/{tid}/pause").status_code == 200
    as_(c, "g1")
    assert c.get(f"{API}/search").json()["total"] == 0
    assert c.post(f"{API}/bookings", json={"departure_id": dep, "adults": 1, "name": "Guest One"}).status_code == 404
    as_(c, "owner")
    assert c.post(f"{API}/owner/tours/{tid}/resume").status_code == 200
    st = c.get(f"{API}/owner/tours/{tid}/stats").json()
    assert st["bookings"] >= 2 and st["fill_rate_30d"] >= 0 and "series" in st
    # module agents
    with Session(engine) as s:
        m = module_stats(s, "tourism")
    assert m["available"] and m["count"] >= 1
    as_(c, "admin")
    assert c.post(f"{API}/admin/tours/{tid}/suspend", json={"reason": "Test"}).json()["status"] == "suspended"
    assert c.post(f"{API}/admin/tours/{tid}/feature").json()["is_featured"] is True


def test_module_required(c):
    as_(c, "g1")
    r = c.post(f"{API}/owner/tours", json={"title": "Sans module"})
    assert r.status_code == 403
