"""Flotte de bus (plan des sièges) et colis par camion (canter/fuso…) : réservation, suivi, livraison par code."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "fleet.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.transport.models import TransportOperator  # noqa: E402
from app.transport.services import now_local  # noqa: E402

T = "/api/v1/transport"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        ids = {}
        for key in ("op", "other", "u1"):
            u = User(email=f"{key}@fleet.test", full_name=key.title(), role=UserRole.client, is_verified=True)
            s.add(u); s.commit(); s.refresh(u)
            ids[key] = u.id
        for key in ("op", "other"):
            s.add(TransportOperator(user_id=ids[key], name=f"Agence {key}", status="approved", is_verified=True, city="Lusaka"))
        s.commit()
    state = {"as": "op"}

    def _u():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_optional_user] = _u
    with TestClient(app) as client:
        client.state = state
        yield client
    app.dependency_overrides.clear()


def as_(c, who):
    c.state["as"] = who


def iso(h):
    return (now_local() + timedelta(hours=h)).replace(microsecond=0).isoformat()


def bus_body(**o):
    b = {"name": "Scania VIP 1", "plate": "bam 1234", "bus_type": "vip", "layout": "2+1", "seats_total": 30, "amenities": ["ac", "wifi", "x"], "color": "#1f6feb"}
    b.update(o)
    return b


def trip_body(bus_id, h=100, **o):
    b = {"origin": "Lusaka", "destination": "Ndola", "departure_at": iso(h), "arrival_at": iso(h + 5), "price": 180, "bus_id": bus_id}
    b.update(o)
    return b


def test_fleet_and_bus_trips(c):
    as_(c, "op")
    r = c.post(f"{T}/operator/buses", json=bus_body())
    assert r.status_code == 201, r.text
    bus = r.json()
    assert bus["plate"] == "BAM 1234" and bus["amenities"] == ["ac", "wifi"] and bus["layout"] == "2+1"
    assert c.post(f"{T}/operator/buses", json=bus_body()).status_code == 409
    assert c.post(f"{T}/operator/buses", json=bus_body(plate="B2", layout="3+3")).status_code == 422

    t = c.post(f"{T}/operator/trips", json=trip_body(bus["id"]))
    assert t.status_code == 201, t.text
    assert t.json()["seats_total"] == 30 and t.json()["bus"]["name"] == "Scania VIP 1" and t.json()["bus_layout"] == "2+1"
    # Le même bus ne peut pas rouler deux départs qui se chevauchent
    assert c.post(f"{T}/operator/trips", json=trip_body(bus["id"], h=102)).status_code == 409
    assert c.post(f"{T}/operator/trips", json=trip_body(bus["id"], h=120)).status_code == 201
    # Sans bus ni sièges : refusé
    bad = trip_body(None)
    bad.pop("bus_id")
    assert c.post(f"{T}/operator/trips", json=bad).status_code == 422
    # Le bus d'une autre agence est inconnu
    as_(c, "other")
    assert c.post(f"{T}/operator/trips", json=trip_body(bus["id"], h=200)).status_code == 422
    assert c.get(f"{T}/operator/buses").json() == []
    as_(c, "op")
    # Bus avec départs : disposition figée, suppression refusée
    assert c.put(f"{T}/operator/buses/{bus['id']}", json=bus_body(seats_total=40)).status_code == 409
    assert c.put(f"{T}/operator/buses/{bus['id']}", json=bus_body(name="Scania Gold")).json()["name"] == "Scania Gold"
    assert c.delete(f"{T}/operator/buses/{bus['id']}").status_code == 409
    # Public : le détail expose le bus (plan des sièges)
    as_(c, "u1")
    res = c.get(f"{T}/trips", params={"origin": "Lusaka", "destination": "Ndola"}).json()
    assert res and res[0]["bus"]["layout"] == "2+1"
    d = c.get(f"{T}/trips/{res[0]['id']}").json()
    assert d["bus"]["color"] == "#1f6feb" and d["seats_total"] == 30


def kinds(c):
    return {k["key"] for k in c.get(f"{T}/cargo/meta").json()["kinds"]}


def test_cargo_flow(c):
    as_(c, "op")
    assert {"canter", "fuso", "truck"} <= kinds(c)
    v = c.post(f"{T}/operator/cargo/vehicles", json={"kind": "canter", "name": "Canter 1", "plate": "ba 55", "capacity_kg": 3500, "capacity_m3": 20})
    assert v.status_code == 201, v.text
    vid = v.json()["id"]
    assert c.post(f"{T}/operator/cargo/vehicles", json={"kind": "boat", "plate": "x1", "capacity_kg": 1, "capacity_m3": 1}).status_code == 422
    assert c.post(f"{T}/operator/cargo/vehicles", json={"kind": "fuso", "plate": "BA 55", "capacity_kg": 8000, "capacity_m3": 30}).status_code == 409
    body = {"vehicle_id": vid, "origin": "Lusaka", "destination": "Lubumbashi", "departure_at": iso(72), "arrival_at": iso(100), "price_per_kg": 4.5, "min_kg": 10}
    t = c.post(f"{T}/operator/cargo/trips", json=body)
    assert t.status_code == 201, t.text
    tid = t.json()["id"]
    assert c.post(f"{T}/operator/cargo/trips", json={**body, "departure_at": iso(74), "arrival_at": iso(90)}).status_code == 409
    assert t.json()["kg_left"] == 3500

    as_(c, "u1")
    found = c.get(f"{T}/cargo/trips", params={"origin": "lusaka", "destination": "lubumbashi", "kind": "canter", "min_kg": 100}).json()
    assert [x["id"] for x in found] == [tid]
    assert c.get(f"{T}/cargo/trips", params={"kind": "fuso"}).json() == []
    pay = {"method": "airtel_money", "phone": "097 1234567"}
    book = {"trip_id": tid, "weight_kg": 500, "description": "10 sacs de farine", "category": "food", "receiver_name": "Mwamba", "receiver_phone": "0991112222", **pay}
    assert c.post(f"{T}/cargo/book", json={**book, "weight_kg": 5}).status_code == 422  # sous le minimum
    assert c.post(f"{T}/cargo/book", json={**book, "weight_kg": 9999}).status_code == 409  # trop lourd
    assert c.post(f"{T}/cargo/book", json={**book, "phone": "096 1234567"}).status_code == 422  # opérateur incohérent
    r = c.post(f"{T}/cargo/book", json=book)
    assert r.status_code == 201, r.text
    bk = r.json()
    assert bk["status"] == "confirmed" and bk["escrow_status"] == "held" and bk["total"] == 2250 and len(bk["delivery_code"]) == 6
    assert c.get(f"{T}/cargo/trips/{tid}").json()["kg_left"] == 3000
    # suivi public sans données sensibles
    pub = c.get(f"{T}/cargo/track/{bk['code']}").json()
    assert pub["delivery_code"] is None and pub["receiver_phone"] == "" and pub["events"][0]["status"] == "confirmed"

    # Agence : chargement → en route → livraison avec code
    as_(c, "op")
    assert c.get(f"{T}/operator/cargo/trips/{tid}/bookings").json()[0]["sender_name"] == "U1"
    assert c.post(f"{T}/operator/cargo/trips/{tid}/status", json={"status": "in_transit"}).status_code == 409
    assert c.post(f"{T}/operator/cargo/trips/{tid}/status", json={"status": "loading"}).status_code == 200
    r = c.post(f"{T}/operator/cargo/trips/{tid}/status", json={"status": "in_transit", "location": "Kapiri Mposhi", "note": "Départ 06:10"})
    assert r.status_code == 200 and r.json()["current_location"] == "Kapiri Mposhi"
    as_(c, "u1")
    mine = c.get(f"{T}/cargo/me/bookings").json()[0]
    assert mine["status"] == "in_transit" and mine["current_location"] == "Kapiri Mposhi"
    assert [e["status"] for e in mine["events"]] == ["confirmed", "loading", "in_transit"]
    assert c.post(f"{T}/cargo/me/bookings/{bk['code']}/cancel").status_code == 409
    as_(c, "op")
    assert c.post(f"{T}/operator/cargo/bookings/{bk['code']}/deliver", json={"code": "000000"}).status_code == 422
    w0 = c.get(f"{T}/operator/wallet").json() if c.get(f"{T}/operator/wallet").status_code == 200 else None
    done = c.post(f"{T}/operator/cargo/bookings/{bk['code']}/deliver", json={"code": bk["delivery_code"]})
    assert done.status_code == 200 and done.json()["status"] == "delivered" and done.json()["escrow_status"] == "released"
    assert c.get(f"{T}/operator/cargo/trips", params={"scope": "history"}).json()[0]["status"] == "delivered"
    assert c.post(f"{T}/operator/cargo/bookings/{bk['code']}/deliver", json={"code": bk["delivery_code"]}).status_code == 409


def test_cargo_cancellations(c):
    as_(c, "op")
    vid = c.post(f"{T}/operator/cargo/vehicles", json={"kind": "fuso", "plate": "FUSO 9", "capacity_kg": 8000, "capacity_m3": 30}).json()["id"]
    tid = c.post(f"{T}/operator/cargo/trips", json={"vehicle_id": vid, "origin": "Kitwe", "destination": "Lusaka", "departure_at": iso(48), "arrival_at": iso(56), "price_per_kg": 2}).json()["id"]
    as_(c, "u1")
    bk = c.post(f"{T}/cargo/book", json={"trip_id": tid, "weight_kg": 100, "description": "Pièces moteur", "receiver_name": "Joe", "receiver_phone": "0955000111", "method": "airtel_money", "phone": "0971234567"}).json()
    r = c.post(f"{T}/cargo/me/bookings/{bk['code']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled_user" and r.json()["refund_amount"] == 200
    assert c.get(f"{T}/cargo/trips/{tid}").json()["kg_left"] == 8000
    # annulation du départ par l'agence : remboursement de tous
    bk2 = c.post(f"{T}/cargo/book", json={"trip_id": tid, "weight_kg": 50, "description": "Cartons", "receiver_name": "Joe", "receiver_phone": "0955000111", "method": "airtel_money", "phone": "0971234567"}).json()
    as_(c, "op")
    assert c.post(f"{T}/operator/cargo/trips/{tid}/status", json={"status": "cancelled", "note": "Panne"}).status_code == 200
    as_(c, "u1")
    mine = {b["code"]: b for b in c.get(f"{T}/cargo/me/bookings").json()}
    assert mine[bk2["code"]]["status"] == "cancelled_operator" and mine[bk2["code"]]["refund_amount"] == 100
    # on ne peut plus réserver
    assert c.post(f"{T}/cargo/book", json={"trip_id": tid, "weight_kg": 50, "description": "Cartons", "receiver_name": "Joe", "receiver_phone": "0955000111", "method": "airtel_money", "phone": "0971234567"}).status_code == 409
