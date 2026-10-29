"""H-Restaurant : fiche → menu → plan de salle → validation admin → créneaux/tables → réservation
(attribution, conflits, limites) → gestion par le restaurateur → avis → statistiques et module agents."""
import io
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "resto.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.agents import module_stats  # noqa: E402
from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerModule, User, UserRole  # noqa: E402
from app.restaurant.services import local_now  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
API = "/api/v1/restaurant"


def day(offset=2):
    d = local_now().date() + timedelta(days=offset)
    while d.weekday() == 6:  # le restaurant de test ferme le dimanche
        d += timedelta(days=1)
    return d.isoformat()


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key, role in (("admin", UserRole.admin), ("owner", UserRole.client), ("g1", UserRole.client), ("g2", UserRole.client), ("stranger", UserRole.client)):
            u = User(email=f"{key}@example.com", full_name=f"{key.title()} Test", role=role, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            ids[key] = u.id
        s.add(PartnerModule(user_id=ids["owner"], module="restaurant"))
        s.commit()
    state = {"as": "owner"}

    def who():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    app.dependency_overrides[get_current_user] = who
    app.dependency_overrides[get_optional_user] = who
    app.dependency_overrides[get_current_admin] = lambda: _admin(ids)
    with TestClient(app) as client:
        client.state = state
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
    body = {"name": "Chez Mama Zed", "summary": "Cuisine zambienne maison", "description": "Nshima, poisson grillé et ambiance familiale.", "cuisines": ["zambian", "grill"],
            "city": "Lusaka", "area": "Kabulonga", "address": "Plot 12, Kabulonga Rd", "phone": "0971234567", "price_level": 2, "open_time": "11:00", "close_time": "22:00",
            "closed_days": [6], "slot_minutes": 90, "max_party": 8, "instant_confirm": False, "accepts_preorder": True, "images": [img]}
    r = c.post(f"{API}/owner/restaurants", json=body)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert c.put(f"{API}/owner/restaurants/{rid}", json={**body, "close_time": "11:30"}).status_code == 422  # fermeture trop proche
    # envoi refusé tant que menu et tables manquent
    r = c.post(f"{API}/owner/restaurants/{rid}/submit")
    assert r.status_code == 422 and "plat" in r.text and "table" in r.text
    # menu
    cat = c.post(f"{API}/owner/restaurants/{rid}/categories", json={"name": "Plats"}).json()["menu"][0]["id"]
    m = c.post(f"{API}/owner/restaurants/{rid}/items", json={"category_id": cat, "name": "Nshima & poisson", "price": 85, "tags": ["halal", "signature"], "description": "Bream grillé"})
    assert m.status_code == 201
    item_id = m.json()["menu"][0]["items"][0]["id"]
    assert c.post(f"{API}/owner/restaurants/{rid}/items", json={"name": "X", "price": 1, "tags": ["zzz"]}).status_code == 422
    assert c.post(f"{API}/owner/restaurants/{rid}/items", json={"category_id": 9999, "name": "X", "price": 1}).status_code == 422
    # plan de salle
    tables = [{"label": "T1", "seats": 2, "shape": "round", "x": 2, "z": 2}, {"label": "T2", "seats": 4, "shape": "square", "x": 6, "z": 2}, {"label": "T3", "seats": 8, "shape": "rect", "x": 10, "z": 6}]
    assert c.put(f"{API}/owner/restaurants/{rid}/tables", json=[{**tables[0], "x": 99}]).status_code == 422  # hors salle
    assert c.put(f"{API}/owner/restaurants/{rid}/tables", json=[tables[0], {**tables[1], "label": "t1"}]).status_code == 422  # doublon
    r = c.put(f"{API}/owner/restaurants/{rid}/tables", json=tables)
    assert r.status_code == 200 and len(r.json()["tables"]) == 3
    t = {x["label"]: x["id"] for x in r.json()["tables"]}
    # pas encore en ligne
    assert c.get(f"{API}/search").json()["total"] == 0
    assert c.post(f"{API}/owner/restaurants/{rid}/submit").status_code == 200
    as_(c, "stranger")
    assert c.put(f"{API}/owner/restaurants/{rid}", json=body).status_code == 404  # pas son restaurant
    as_(c, "admin")
    assert c.post(f"{API}/admin/restaurants/{rid}/reject", json={}).status_code == 422
    assert c.post(f"{API}/admin/restaurants/{rid}/approve").status_code == 200
    as_(c, "g1")
    res = c.get(f"{API}/search?city=lusaka&cuisine=zambian").json()
    assert res["total"] == 1 and res["items"][0]["slug"] == "chez-mama-zed"
    det = c.get(f"{API}/restaurants/chez-mama-zed").json()
    assert len(det["tables"]) == 3 and det["menu"][0]["items"][0]["name"] == "Nshima & poisson" and "11:00" in det["slots"] and "20:30" in det["slots"] and "21:00" not in det["slots"]
    d = day()
    # créneaux, plan de salle
    s = c.get(f"{API}/restaurants/{rid}/slots?day={d}&party=2").json()
    assert not s["closed"] and s["slots"][0]["free"] == 3
    sunday = local_now().date()
    while sunday.weekday() != 6:
        sunday += timedelta(days=1)
    assert c.get(f"{API}/restaurants/{rid}/slots?day={sunday}&party=2").json()["closed"] is True
    assert c.get(f"{API}/restaurants/{rid}/tables?day={d}&time=19:15&party=2").status_code == 422  # créneau non proposé
    pl = c.get(f"{API}/restaurants/{rid}/tables?day={d}&time=19:00&party=3").json()["tables"]
    assert {x["label"]: x["status"] for x in pl} == {"T1": "too_small", "T2": "free", "T3": "free"}
    # réservation d'une table choisie + pré-commande
    base = {"restaurant_id": rid, "day": d, "time": "19:00", "party_size": 3, "name": "Guest One", "phone": "0971112233", "table_id": t["T2"], "preorder": [{"item_id": item_id, "qty": 2}]}
    r = c.post(f"{API}/reservations", json=base)
    assert r.status_code == 201, r.text
    code = r.json()["code"]
    assert r.json()["status"] == "pending" and r.json()["preorder_total"] == 170 and r.json()["table_label"] == "T2"
    assert c.post(f"{API}/reservations", json=base).status_code == 409  # doublon du même client
    as_(c, "g2")
    assert c.post(f"{API}/reservations", json={**base, "preorder": []}).status_code == 409  # table déjà prise
    assert c.post(f"{API}/reservations", json={**base, "table_id": t["T1"], "preorder": []}).status_code == 422  # trop petite
    assert c.post(f"{API}/reservations", json={**base, "party_size": 9, "table_id": None, "preorder": []}).status_code == 422  # groupe trop grand
    assert c.post(f"{API}/reservations", json={**base, "time": "19:15", "table_id": None, "preorder": []}).status_code == 422
    assert c.post(f"{API}/reservations", json={**base, "day": str(sunday), "table_id": None, "preorder": []}).status_code == 422
    # attribution automatique : le plus petit libre qui convient (T3 pour 3 personnes car T2 est prise)
    r = c.post(f"{API}/reservations", json={**base, "table_id": None, "preorder": []})
    assert r.status_code == 201 and r.json()["table_label"] == "T3"
    # un créneau ultérieur non chevauchant libère T2 (90 min)
    assert c.post(f"{API}/reservations", json={**base, "time": "20:30", "table_id": t["T2"], "preorder": []}).status_code == 201
    pl = c.get(f"{API}/restaurants/{rid}/tables?day={d}&time=19:00&party=2").json()["tables"]
    assert {x["label"]: x["status"] for x in pl} == {"T1": "free", "T2": "taken", "T3": "taken"}
    # restaurateur : confirmer, déplacer, installer, terminer
    as_(c, "owner")
    inbox = c.get(f"{API}/owner/restaurants/{rid}/reservations?upcoming=true").json()
    assert len(inbox) == 3 and c.get(f"{API}/owner/restaurants").json()[0]["pending_reservations"] == 3
    assert c.post(f"{API}/owner/reservations/{code}/action", json={"action": "seat"}).status_code == 409  # pas encore confirmée
    assert c.post(f"{API}/owner/reservations/{code}/action", json={"action": "move", "table_id": t["T1"]}).status_code == 422  # trop petite
    assert c.post(f"{API}/owner/reservations/{code}/action", json={"action": "confirm"}).json()["status"] == "confirmed"
    assert c.post(f"{API}/owner/reservations/{code}/action", json={"action": "seat"}).json()["status"] == "seated"
    assert c.post(f"{API}/owner/reservations/{code}/action", json={"action": "complete"}).json()["status"] == "completed"
    other = [x["code"] for x in inbox if x["code"] != code][0]
    r = c.post(f"{API}/owner/reservations/{other}/action", json={"action": "decline", "reason": "Complet ce soir"})
    assert r.json()["status"] == "declined" and r.json()["decline_reason"] == "Complet ce soir"
    # une table avec réservation à venir ne se supprime pas
    keep = [{"id": t["T1"], "label": "T1", "seats": 2, "x": 2, "z": 2}, {"id": t["T3"], "label": "T3", "seats": 8, "shape": "rect", "x": 10, "z": 6}]
    assert c.put(f"{API}/owner/restaurants/{rid}/tables", json=keep).status_code == 409
    # avis : seulement après le repas, une fois
    as_(c, "g1")
    assert c.post(f"{API}/me/reservations/{code}/review", json={"rating": 5, "comment": "Excellent poisson"}).status_code == 201
    assert c.post(f"{API}/me/reservations/{code}/review", json={"rating": 4}).status_code == 409
    mine = c.get(f"{API}/me/reservations").json()
    assert mine[0]["reviewed"] is True
    assert c.get(f"{API}/restaurants/chez-mama-zed").json()["rating_avg"] == 5
    as_(c, "g2")
    other_mine = c.get(f"{API}/me/reservations").json()
    cancel_code = [x["code"] for x in other_mine if x["status"] == "pending"][0]
    assert c.post(f"{API}/me/reservations/{cancel_code}/cancel").json()["status"] == "cancelled"
    assert c.post(f"{API}/me/reservations/{code}/cancel").status_code == 404  # pas la sienne
    # stats restaurateur + module agents
    as_(c, "owner")
    st = c.get(f"{API}/owner/restaurants/{rid}/stats").json()
    assert st["covers"] == 3 and st["preorder_value"] == 170 and st["top_dishes"][0] == {"name": "Nshima & poisson", "qty": 2}
    with Session(engine) as s:
        ms = module_stats(s, "restaurant")
    assert ms["available"] and ms["gross"] == 170 and ms["commission"] == 8.5 and ms["count"] == 1
    # pause / reprise
    assert c.post(f"{API}/owner/restaurants/{rid}/pause").status_code == 200
    assert c.get(f"{API}/search").json()["total"] == 0
    assert c.post(f"{API}/owner/restaurants/{rid}/resume").status_code == 200


def test_module_required(c):
    as_(c, "g1")
    r = c.post(f"{API}/owner/restaurants", json={"name": "Sans module"})
    assert r.status_code == 403
