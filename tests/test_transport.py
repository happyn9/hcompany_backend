"""Tests H-Transport : agence → validation admin → départ → recherche → réservation
+ séquestre → embarquement → annulation (remboursements) → litige → libération → avis → retraits."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "transport.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerModule, User, UserRole  # noqa: E402
from app.transport.models import TransportBooking, TransportTrip  # noqa: E402
from app.transport.services import expire_overdue, now_local  # noqa: E402

API = "/api/v1/transport"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        users = {}
        for key, role in (("admin", UserRole.admin), ("op", UserRole.client), ("u1", UserRole.client), ("u2", UserRole.client)):
            u = User(email=f"{key}@bus.test", full_name=f"{key.title()} Test", role=role, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            users[key] = u.id
        s.add(PartnerModule(user_id=users["op"], module="transport"))
        s.commit()
    state = {"as": "op"}

    def _user(uid):
        with Session(engine) as s:
            return s.get(User, uid)

    app.dependency_overrides[get_current_user] = lambda: _user(users[state["as"]])
    app.dependency_overrides[get_optional_user] = lambda: _user(users[state["as"]])
    app.dependency_overrides[get_current_admin] = lambda: _user(users["admin"])
    with TestClient(app) as client:
        client.state = state
        yield client
    app.dependency_overrides.clear()


def as_(c, who):
    c.state["as"] = who


def iso(hours):
    return (now_local() + timedelta(hours=hours)).replace(microsecond=0).isoformat()


def trip_body(hours=100, **over):
    b = {"origin": "Lusaka", "destination": "Livingstone", "origin_stop": "Intercity", "destination_stop": "Gare routière",
         "stops": ["Kafue", "Mazabuka"], "departure_at": iso(hours), "arrival_at": iso(hours + 7), "price": 250, "seats_total": 8,
         "bus_type": "vip", "amenities": ["ac", "wifi", "nope"], "luggage_note": "1 sac de 20 kg"}
    b.update(over)
    return b


def book(c, trip_id, seats=(None,), **over):
    body = {"trip_id": trip_id, "passengers": [{"name": f"Passager {i}", "seat": s} for i, s in enumerate(seats)],
            "contact_name": "Chanda", "contact_phone": "0971234567", "method": "airtel_money", "phone": "097 1234567"}
    body.update(over)
    return c.post(f"{API}/book", json=body)


def test_full_flow(c):
    # Agence : profil → en attente → l'admin valide
    as_(c, "op")
    r = c.post(f"{API}/operator/me", json={"name": "Power Tools Bus", "city": "Lusaka", "phone": "0955000111", "mobile_money_operator": "airtel_money", "mobile_money_phone": "0971112222"})
    assert r.status_code == 201 and r.json()["status"] == "pending"
    assert c.post(f"{API}/operator/trips", json=trip_body()).status_code == 403
    op_id = r.json()["id"]
    r = c.patch(f"{API}/admin/operators/{op_id}", json={"status": "rejected"})
    assert r.status_code == 422
    assert c.patch(f"{API}/admin/operators/{op_id}", json={"status": "approved", "is_verified": True}).json()["status"] == "approved"

    # Départs
    assert c.post(f"{API}/operator/trips", json=trip_body(-2)).status_code == 422
    t = c.post(f"{API}/operator/trips", json=trip_body())
    assert t.status_code == 201, t.text
    tid = t.json()["id"]
    assert t.json()["amenities"] == ["ac", "wifi"]
    far = c.post(f"{API}/operator/trips", json=trip_body(50)).json()["id"]
    dup = c.post(f"{API}/operator/trips/{tid}/duplicate", json=[1, 2])
    assert dup.status_code == 201 and len(dup.json()) == 2

    # Recherche publique
    as_(c, "u1")
    res = c.get(f"{API}/trips", params={"origin": "lusaka", "destination": "Livingstone", "sort": "price"}).json()
    assert len(res) == 4 and res[0]["operator"]["name"] == "Power Tools Bus"
    assert c.get(f"{API}/trips", params={"origin": "Kitwe"}).json() == []
    assert c.get(f"{API}/routes/popular").json()[0]["trips"] == 4
    d = c.get(f"{API}/trips/{tid}").json()
    assert d["taken_seats"] == [] and d["stops"] == ["Kafue", "Mazabuka"]

    # Réservation : validations
    as_(c, "op")
    assert book(c, tid).status_code == 422  # propre agence
    as_(c, "u1")
    assert book(c, tid, method="mtn_momo").status_code == 422  # numéro Airtel avec MTN
    assert book(c, tid, seats=(3, 3)).status_code == 409  # même siège deux fois
    assert book(c, tid, seats=(99,)).status_code == 422 or book(c, tid, seats=(99,)).status_code == 409

    r = book(c, tid, seats=(3, None))
    assert r.status_code == 201, r.text
    bk = r.json()["booking"]
    assert bk["status"] == "confirmed" and bk["escrow_status"] == "held" and bk["total"] == 500
    assert bk["commission_amount"] == 40 and bk["operator_net"] == 460
    seats = sorted(p["seat_number"] for p in bk["passengers"])
    assert 3 in seats and len(set(seats)) == 2
    assert all(p["ticket_code"].startswith("T-") for p in bk["passengers"])
    assert bk["operator_phone"] == "0955000111"
    assert set(c.get(f"{API}/trips/{tid}").json()["taken_seats"]) == set(seats)

    # Siège pris
    as_(c, "u2")
    assert book(c, tid, seats=(3,)).status_code == 409
    # Remplir : 8 sièges - 2 pris = 6
    assert book(c, tid, seats=(None,) * 6).status_code == 201
    r = book(c, tid)
    assert r.status_code == 409  # complet
    assert c.get(f"{API}/trips/{tid}").json()["bookable"] is False

    # Annulation : > 48 h avant = 100 %
    as_(c, "u1")
    code1 = bk["code"]
    mine = c.get(f"{API}/me/bookings").json()
    assert [m["code"] for m in mine] == [code1] and mine[0]["can_cancel"] and mine[0]["refund_if_cancelled"] == 500
    r = c.post(f"{API}/me/bookings/{code1}/cancel", json={"reason": "Imprévu"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled_user" and r.json()["refund_amount"] == 500
    assert r.json()["escrow_status"] == "refunded"
    assert len(c.get(f"{API}/trips/{tid}").json()["taken_seats"]) == 6  # sièges libérés

    # Annulation entre 12 et 48 h = 50 %
    r = book(c, far, seats=(1,))
    code_far = r.json()["booking"]["code"]
    assert r.json()["booking"]["refund_if_cancelled"] == 250
    with Session(engine) as s:
        t_ = s.get(TransportTrip, far)
        t_.departure_at = now_local() + timedelta(hours=30)
        t_.arrival_at = t_.departure_at + timedelta(hours=5)
        s.add(t_)
        bb = s.query(TransportBooking).filter(TransportBooking.code == code_far).one()
        bb.departure_at = t_.departure_at
        s.add(bb)
        s.commit()
    r = c.post(f"{API}/me/bookings/{code_far}/cancel", json={})
    assert r.json()["refund_amount"] == 125 and r.json()["escrow_status"] == "released"
    assert r.json()["commission_amount"] == 10 and r.json()["operator_net"] == 115

    # Embarquement : u2 a 6 billets sur tid ; départ simulé dans 2 h
    as_(c, "u2")
    b2 = c.get(f"{API}/me/bookings").json()[0]
    code2 = b2["code"]
    with Session(engine) as s:
        t_ = s.get(TransportTrip, tid)
        t_.departure_at = now_local() + timedelta(hours=2)
        t_.arrival_at = t_.departure_at + timedelta(hours=7)
        s.add(t_)
        bb = s.query(TransportBooking).filter(TransportBooking.code == code2).one()
        bb.departure_at = t_.departure_at
        s.add(bb)
        s.commit()
    as_(c, "op")
    man = c.get(f"{API}/operator/trips/{tid}/manifest").json()
    assert len(man["passengers"]) == 6
    first = man["passengers"][0]["ticket_code"]
    assert c.post(f"{API}/operator/boarding", json={"ticket_code": "T-NOPE"}).status_code == 404
    r = c.post(f"{API}/operator/boarding", json={"ticket_code": first})
    assert r.status_code == 200 and r.json()["passenger"]["boarded"] and not r.json()["already"]
    assert c.post(f"{API}/operator/boarding", json={"ticket_code": first}).json()["already"] is True
    for p in man["passengers"][1:]:
        c.post(f"{API}/operator/boarding", json={"ticket_code": p["ticket_code"]})
    as_(c, "u2")
    assert c.get(f"{API}/me/bookings/{code2}").json()["status"] == "boarded"
    # annulation impossible après embarquement
    assert c.post(f"{API}/me/bookings/{code2}/cancel", json={}).status_code == 409

    # Litige puis résolution
    assert c.post(f"{API}/me/bookings/{code2}/dispute", json={"reason": "Bus très en retard"}).status_code == 409  # pas encore parti
    with Session(engine) as s:
        for tt in (s.get(TransportTrip, tid),):
            tt.departure_at = now_local() - timedelta(hours=1)
            tt.arrival_at = now_local() + timedelta(hours=6)
            s.add(tt)
        bb = s.query(TransportBooking).filter(TransportBooking.code == code2).one()
        bb.departure_at = now_local() - timedelta(hours=1)
        s.add(bb)
        s.commit()
    r = c.post(f"{API}/me/bookings/{code2}/dispute", json={"reason": "Bus très en retard", "note": "4 h"})
    assert r.status_code == 200 and r.json()["status"] == "disputed"
    as_(c, "admin")
    assert c.get(f"{API}/admin/overview").json()["disputes_open"] == 1
    r = c.post(f"{API}/admin/bookings/{code2}/resolve", json={"action": "refund", "refund_amount": 600, "note": "Geste commercial"})
    assert r.status_code == 200 and r.json()["refund_amount"] == 600
    assert c.post(f"{API}/admin/bookings/{code2}/resolve", json={"action": "release"}).status_code == 409

    # Libération automatique d'une réservation jamais contestée
    as_(c, "u1")
    t3 = [x for x in c.get(f"{API}/trips", params={"origin": "Lusaka"}).json() if x["id"] not in (tid, far)][0]["id"]
    code3 = book(c, t3, seats=(5,)).json()["booking"]["code"]
    with Session(engine) as s:
        tt = s.get(TransportTrip, t3)
        tt.departure_at = now_local() - timedelta(hours=14)
        tt.arrival_at = now_local() - timedelta(hours=8)
        s.add(tt)
        bb = s.query(TransportBooking).filter(TransportBooking.code == code3).one()
        bb.departure_at = tt.departure_at
        s.add(bb)
        s.commit()
        expire_overdue(s)
    b3 = c.get(f"{API}/me/bookings/{code3}").json()
    assert b3["status"] == "completed" and b3["escrow_status"] == "released" and b3["can_review"]
    r = c.post(f"{API}/reviews", json={"booking_code": code3, "rating": 4, "comment": "Bon voyage"})
    assert r.status_code == 201
    assert c.post(f"{API}/reviews", json={"booking_code": code3, "rating": 4}).status_code == 409
    assert c.get(f"{API}/trips/{tid}").json()["operator"]["rating_avg"] == 4

    # Solde & retraits : 115 (annulation 50 %) + 828 (litige : 900 conservés - 72 de commission) + 230 (billet t3) = 1173
    as_(c, "op")
    w = c.get(f"{API}/operator/wallet").json()
    assert w["available"] == 1173 and w["total_earned"] == 1173
    assert c.post(f"{API}/operator/payouts", json={"amount": 50}).status_code == 422
    assert c.post(f"{API}/operator/payouts", json={"amount": 5000}).status_code == 422
    p = c.post(f"{API}/operator/payouts", json={"amount": 300})
    assert p.status_code == 201
    assert c.get(f"{API}/operator/wallet").json()["available"] == 873
    as_(c, "admin")
    assert c.patch(f"{API}/admin/payouts/{p.json()['id']}", json={"status": "paid"}).json()["status"] == "paid"
    assert c.patch(f"{API}/admin/payouts/{p.json()['id']}", json={"status": "paid"}).status_code == 409
    assert c.get(f"{API}/admin/bookings", params={"status": "completed"}).status_code == 200
    s = c.put(f"{API}/admin/settings", json={"values": {"commission_rate": "10"}}).json()
    assert s["commission_rate"] == "10"
    assert c.put(f"{API}/admin/settings", json={"values": {"nope": "1"}}).status_code == 422


def test_trip_cancellation_and_rules(c):
    as_(c, "op")
    t = c.post(f"{API}/operator/trips", json=trip_body(200, destination="Kitwe", border_crossing=True)).json()["id"]
    as_(c, "u2")
    assert book(c, t).status_code == 422  # passeport requis
    r = c.post(f"{API}/book", json={"trip_id": t, "passengers": [{"name": "Jean Mwamba", "document": "DRC1234567"}], "contact_name": "Jean",
                                    "contact_phone": "0971234567", "method": "airtel_money", "phone": "0971234567"})
    assert r.status_code == 201, r.text
    code = r.json()["booking"]["code"]
    as_(c, "op")
    assert c.post(f"{API}/operator/trips/{t}/cancel", json={"reason": "x"}).status_code == 422
    assert c.put(f"{API}/operator/trips/{t}", json=trip_body(200, destination="Kitwe", price=999)).status_code == 409  # billets vendus
    r = c.post(f"{API}/operator/trips/{t}/cancel", json={"reason": "Panne mécanique"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    as_(c, "u2")
    b = c.get(f"{API}/me/bookings/{code}").json()
    assert b["status"] == "cancelled_operator" and b["refund_amount"] == b["total"]
    assert c.get(f"{API}/trips/{t}").json()["bookable"] is False
