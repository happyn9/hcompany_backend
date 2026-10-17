"""Tests H-Logement : hôte → logement → validation admin → recherche avec dates
→ devis → réservation + séquestre → réponse de l'hôte → annulation (politiques)
→ litige → libération des fonds → avis → solde et retraits."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "lodge.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import io  # noqa: E402
from datetime import date, datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_user, get_optional_user  # noqa: E402
from app.lodging.models import Booking  # noqa: E402
from app.lodging.services import expire_overdue  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
API = "/api/v1/lodging"


def d(offset):
    return (date.today() + timedelta(days=offset)).isoformat()


@pytest.fixture(scope="module")
def ctx():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        users = {}
        for key, role in (("admin", UserRole.admin), ("host", UserRole.client), ("guest", UserRole.client), ("guest2", UserRole.client)):
            u = User(email=f"{key}@lodge.test", full_name=f"{key.title()} Test", role=role, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            users[key] = u.id
    state = {"as": "host"}

    def _user(uid):
        with Session(engine) as s:
            return s.get(User, uid)

    app.dependency_overrides[get_current_user] = lambda: _user(users[state["as"]])
    app.dependency_overrides[get_optional_user] = lambda: _user(users[state["as"]])
    app.dependency_overrides[get_current_admin] = lambda: _user(users["admin"])
    with TestClient(app) as c:
        c.state = state
        yield c
    app.dependency_overrides.clear()


def as_(c, who):
    c.state["as"] = who


def upload(c):
    r = c.post(f"{API}/host/uploads", files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
    assert r.status_code == 200, r.text
    return r.json()["path"]


def prop_body(c, **over):
    body = {
        "title": "Lodge du Lac", "summary": "Calme au bord de l'eau", "type": "lodge", "city": "Lusaka", "area": "Kabulonga",
        "description": "Un lodge paisible avec jardin, piscine et petit-déjeuner servi sur la terrasse, à dix minutes du centre-ville.",
        "price_per_night": 300, "cleaning_fee": 50, "max_guests": 2, "bedrooms": 1, "beds": 1, "units": 2,
        "amenities": ["wifi", "pool", "nope"], "cancellation_policy": "flexible", "instant_book": False,
        "images": [upload(c) for _ in range(3)],
    }
    body.update(over)
    return body


def book_body(pid, ci, co, **over):
    body = {"property_id": pid, "check_in": ci, "check_out": co, "guests": 2, "units": 1, "guest_name": "Guest Test",
            "guest_phone": "0971112233", "method": "airtel_money", "phone": "097 1112233"}
    body.update(over)
    return body


def make_active(c, **over):
    as_(c, "host")
    r = c.post(f"{API}/host/properties", json=prop_body(c, **over))
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    r = c.post(f"{API}/host/properties/{pid}/submit")
    assert r.status_code == 200, r.text
    as_(c, "admin")
    r = c.patch(f"{API}/admin/properties/{pid}", json={"status": "active"})
    assert r.status_code == 200, r.text
    as_(c, "guest")
    return pid


def test_host_and_property_lifecycle(ctx):
    as_(ctx, "host")
    assert ctx.get(f"{API}/host/me").json() is None
    assert ctx.post(f"{API}/host/properties", json=prop_body(ctx)).status_code == 404  # pas encore d'hôte
    r = ctx.put(f"{API}/host/me", json={"display_name": "Mama Nephi", "phone": "0971234567", "mobile_money_operator": "airtel_money", "mobile_money_phone": "0971234567"})
    assert r.status_code == 200, r.text
    assert ctx.put(f"{API}/host/me", json={"display_name": "Mama Nephi", "mobile_money_operator": "airtel_money", "mobile_money_phone": "12"}).status_code == 422

    r = ctx.post(f"{API}/host/properties", json=prop_body(ctx))
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["status"] == "draft" and p["amenity_keys"] == ["wifi", "pool"] and p["slug"].startswith("lodge-du-lac")
    pid = p["id"]
    # brouillon invisible
    assert ctx.get(f"{API}/properties/{p['slug']}").status_code == 404
    # soumission refusée sans photos suffisantes
    r = ctx.post(f"{API}/host/properties", json=prop_body(ctx, title="Studio vide", images=[]))
    assert ctx.post(f"{API}/host/properties/{r.json()['id']}/submit").status_code == 422
    # photo d'un autre utilisateur / chemin forgé
    assert ctx.put(f"{API}/host/properties/{pid}", json=prop_body(ctx, images=["lodging/999-aaaaaaaaaaaa.png"])).status_code == 422
    assert ctx.put(f"{API}/host/properties/{pid}", json=prop_body(ctx, images=["../../etc/passwd"])).status_code == 422

    assert ctx.post(f"{API}/host/properties/{pid}/submit").status_code == 200
    as_(ctx, "guest")
    assert ctx.get(f"{API}/properties/{p['slug']}").status_code == 404  # en attente de validation
    as_(ctx, "admin")
    assert ctx.patch(f"{API}/admin/properties/{pid}", json={"status": "rejected"}).status_code == 422  # motif obligatoire
    assert ctx.patch(f"{API}/admin/properties/{pid}", json={"status": "active", "is_featured": True}).status_code == 200
    as_(ctx, "guest")
    detail = ctx.get(f"{API}/properties/{p['slug']}").json()
    assert detail["host"]["display_name"] == "Mama Nephi" and len(detail["gallery"]) == 3
    assert "address" not in detail  # l'adresse exacte n'est jamais publique
    ctx.pid, ctx.slug = pid, p["slug"]


def test_search_and_calendar(ctx):
    r = ctx.get(f"{API}/search", params={"city": "lusaka"}).json()
    assert r["total"] >= 1 and r["items"][0]["slug"] == ctx.slug
    assert ctx.get(f"{API}/search", params={"city": "Ndola"}).json()["total"] == 0
    assert ctx.get(f"{API}/search", params={"guests": 9}).json()["total"] == 0
    assert ctx.get(f"{API}/search", params={"amenities": "wifi,pool"}).json()["total"] >= 1
    assert ctx.get(f"{API}/search", params={"amenities": "bbq"}).json()["total"] == 0
    dated = ctx.get(f"{API}/search", params={"check_in": d(10), "check_out": d(13), "guests": 2}).json()
    assert dated["items"][0]["total"] == 3 * 300 + 50 and dated["items"][0]["nights"] == 3
    assert ctx.get(f"{API}/search", params={"check_in": d(13), "check_out": d(10)}).status_code == 422
    cal = ctx.get(f"{API}/properties/{ctx.pid}/calendar", params={"start": d(0), "days": 10}).json()
    assert len(cal) == 10 and cal[0]["available"] and cal[0]["price"] == 300
    home = ctx.get(f"{API}/home").json()
    assert home["totals"]["properties"] >= 1 and home["cities"][0]["city"] == "Lusaka"
    assert any(a["key"] == "wifi" for a in ctx.get(f"{API}/amenities").json())


def test_quote_rules_and_discounts(ctx):
    as_(ctx, "host")
    r = ctx.post(f"{API}/host/properties/{ctx.pid}/rules", json={"label": "Fêtes", "start_date": d(20), "end_date": d(21), "price_per_night": 500})
    assert r.status_code == 201 and len(r.json()["rules"]) == 1
    rule_id = r.json()["rules"][0]["id"]
    as_(ctx, "guest")
    q = ctx.post(f"{API}/quote", json={"property_id": ctx.pid, "check_in": d(19), "check_out": d(22), "guests": 2}).json()
    assert q["nightly_total"] == 300 + 500 + 500 and q["total"] == 1300 + 50
    q2 = ctx.post(f"{API}/quote", json={"property_id": ctx.pid, "check_in": d(40), "check_out": d(40 + 7), "guests": 2, "units": 2})
    assert q2.status_code == 200 and q2.json()["nightly_total"] == 7 * 300 * 2 and q2.json()["cleaning_fee"] == 100
    # hôte : remise hebdo
    as_(ctx, "host")
    ctx.put(f"{API}/host/properties/{ctx.pid}", json=prop_body(ctx, weekly_discount=10, monthly_discount=20, images=[i for i in ctx.get(f"{API}/host/properties/{ctx.pid}").json()["image_paths"]]))
    as_(ctx, "guest")
    q = ctx.post(f"{API}/quote", json={"property_id": ctx.pid, "check_in": d(40), "check_out": d(47), "guests": 2}).json()
    assert q["discount_pct"] == 10 and q["discount"] == 210 and q["total"] == 2100 - 210 + 50
    assert ctx.post(f"{API}/quote", json={"property_id": ctx.pid, "check_in": d(-2), "check_out": d(1), "guests": 2}).status_code == 422
    assert ctx.post(f"{API}/quote", json={"property_id": ctx.pid, "check_in": d(40), "check_out": d(41), "guests": 5}).status_code == 422
    as_(ctx, "host")
    assert ctx.delete(f"{API}/host/properties/{ctx.pid}/rules/{rule_id}").status_code == 200


def test_request_booking_accept_and_double_booking(ctx):
    as_(ctx, "guest")
    # le voyageur ne peut pas réserver son propre logement ; mauvais opérateur refusé
    r = ctx.post(f"{API}/book", json=book_body(ctx.pid, d(10), d(13), method="mtn_momo"))
    assert r.status_code == 422 and "MTN" in r.text
    as_(ctx, "host")
    assert ctx.post(f"{API}/book", json=book_body(ctx.pid, d(10), d(13))).status_code == 422
    as_(ctx, "guest")
    r = ctx.post(f"{API}/book", json=book_body(ctx.pid, d(10), d(13)))
    assert r.status_code == 201, r.text
    b = r.json()["booking"]
    ctx.code = b["code"]
    assert b["status"] == "pending_host" and b["escrow_status"] == "held" and b["total"] == 950
    assert b["address"] is None and b["host_phone"] is None  # pas encore confirmé
    assert b["host_deadline"] is not None

    # 2 chambres : un 2e voyageur peut réserver la nuit du 11, un 3e non
    as_(ctx, "guest2")
    r2 = ctx.post(f"{API}/book", json=book_body(ctx.pid, d(11), d(12), phone="097 3334455"))
    assert r2.status_code == 201
    ctx.code2 = r2.json()["booking"]["code"]
    as_(ctx, "guest")
    r = ctx.post(f"{API}/book", json=book_body(ctx.pid, d(11), d(12)))
    assert r.status_code == 409 and "pas disponible" in r.text

    # l'hôte accepte → coordonnées révélées
    as_(ctx, "host")
    reqs = ctx.get(f"{API}/host/bookings", params={"status": "pending_host"}).json()
    assert len(reqs) == 2 and reqs[0]["guest_email"]
    r = ctx.post(f"{API}/host/bookings/{ctx.code}/accept")
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert ctx.post(f"{API}/host/bookings/{ctx.code}/accept").status_code == 409
    as_(ctx, "guest")
    mine = ctx.get(f"{API}/me/bookings/{ctx.code}").json()
    assert mine["status"] == "confirmed" and mine["host_phone"] == "0971234567" and mine["address"]
    assert [e["status"] for e in mine["events"]][-1] == "confirmed"
    # autre utilisateur : introuvable
    as_(ctx, "guest2")
    assert ctx.get(f"{API}/me/bookings/{ctx.code}").status_code == 404
    # le voyageur 2 est aussi confirmé pour la suite
    as_(ctx, "host")
    ctx.post(f"{API}/host/bookings/{ctx.code2}/decline", json={"reason": "Dates indisponibles"})


def test_decline_refunds_and_frees_dates(ctx):
    as_(ctx, "guest2")
    b = [x for x in ctx.get(f"{API}/me/bookings").json() if x["status"] == "declined"][0]
    assert b["escrow_status"] == "refunded" and b["refund_amount"] == b["total"]
    # les dates redeviennent libres
    r = ctx.post(f"{API}/quote", json={"property_id": ctx.pid, "check_in": d(11), "check_out": d(12), "guests": 2})
    assert r.status_code == 200


def test_guest_cancel_policy_and_messages(ctx):
    as_(ctx, "guest")
    # messagerie
    r = ctx.post(f"{API}/me/bookings/{ctx.code}/messages", json={"body": "Arrivée vers 16h, merci !"})
    assert r.status_code == 201 and r.json()[-1]["mine"]
    as_(ctx, "host")
    thread = ctx.post(f"{API}/host/bookings/{ctx.code}/messages", json={"body": "Bienvenue !"}).json()
    assert [m["sender_role"] for m in thread] == ["guest", "host"]
    # annulation flexible, 10 jours avant : remboursement total
    as_(ctx, "guest")
    view = ctx.get(f"{API}/me/bookings/{ctx.code}").json()
    assert view["can_cancel"] and view["refund_if_cancelled"] == 950
    r = ctx.post(f"{API}/me/bookings/{ctx.code}/cancel", json={"reason": "Changement de plan"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled_guest" and r.json()["refund_amount"] == 950
    assert ctx.post(f"{API}/me/bookings/{ctx.code}/cancel", json={}).status_code == 409


def test_partial_refund_strict_policy(ctx):
    pid = make_active(ctx, title="Villa Stricte", cancellation_policy="strict", units=1, price_per_night=1000, cleaning_fee=0)
    r = ctx.post(f"{API}/book", json=book_body(pid, d(9), d(11)))
    assert r.status_code == 201, r.text
    code = r.json()["booking"]["code"]
    as_(ctx, "host")
    ctx.post(f"{API}/host/bookings/{code}/accept")
    as_(ctx, "guest")
    view = ctx.get(f"{API}/me/bookings/{code}").json()
    assert view["refund_if_cancelled"] == 1000  # 9 jours avant : 50 % (entre 7 et 14 jours)
    r = ctx.post(f"{API}/me/bookings/{code}/cancel", json={}).json()
    assert r["refund_amount"] == 1000 and r["escrow_status"] == "released"
    as_(ctx, "host")
    b = [x for x in ctx.get(f"{API}/host/bookings").json() if x["code"] == code][0]
    assert b["host_net"] == round(1000 - 1000 * 0.10, 2) and b["commission_amount"] == 100


def test_instant_book_and_blocks(ctx):
    pid = make_active(ctx, title="Appart Instant", instant_book=True, units=1)
    r = ctx.post(f"{API}/book", json=book_body(pid, d(30), d(32)))
    assert r.status_code == 201, r.text
    assert r.json()["booking"]["status"] == "confirmed"
    ctx.inst = (pid, r.json()["booking"]["code"])
    as_(ctx, "host")
    # blocage sur des dates déjà réservées refusé ; ailleurs accepté
    assert ctx.post(f"{API}/host/properties/{pid}/blocks", json={"start_date": d(31), "end_date": d(33)}).status_code == 409
    r = ctx.post(f"{API}/host/properties/{pid}/blocks", json={"start_date": d(50), "end_date": d(55), "reason": "Travaux"})
    assert r.status_code == 201 and len(r.json()["blocks"]) == 1
    as_(ctx, "guest2")
    assert ctx.post(f"{API}/book", json=book_body(pid, d(52), d(53))).status_code == 409
    assert ctx.post(f"{API}/book", json=book_body(pid, d(30), d(31))).status_code == 409
    cal = ctx.get(f"{API}/properties/{pid}/calendar", params={"start": d(49), "days": 8}).json()
    assert [x["available"] for x in cal] == [True, False, False, False, False, False, True, True]
    # suppression du logement avec historique refusée
    as_(ctx, "host")
    assert ctx.delete(f"{API}/host/properties/{pid}").status_code == 409


def test_stay_dispute_release_review_wallet(ctx):
    pid = make_active(ctx, title="Lodge Litige", units=1, price_per_night=200, cleaning_fee=0, instant_book=True)
    r = ctx.post(f"{API}/book", json=book_body(pid, d(5), d(7)))
    code = r.json()["booking"]["code"]
    # simulation : le séjour a commencé hier
    with Session(engine) as s:
        b = s.exec(select(Booking).where(Booking.code == code)).one()
        b.check_in, b.check_out = date.today(), date.today() + timedelta(days=2)
        s.add(b)
        s.commit()
        expire_overdue(s)
    view = ctx.get(f"{API}/me/bookings/{code}").json()
    assert view["status"] == "checked_in" and view["can_dispute"] and not view["can_cancel"]
    r = ctx.post(f"{API}/me/bookings/{code}/dispute", json={"reason": "Pas conforme", "note": "Pas d'eau chaude"})
    assert r.status_code == 200 and r.json()["status"] == "disputed"
    # litige : le temps ne libère pas les fonds
    with Session(engine) as s:
        b = s.exec(select(Booking).where(Booking.code == code)).one()
        b.check_in = date.today() - timedelta(days=3)
        s.add(b)
        s.commit()
        expire_overdue(s)
    assert ctx.get(f"{API}/me/bookings/{code}").json()["escrow_status"] == "held"
    as_(ctx, "admin")
    r = ctx.post(f"{API}/admin/bookings/{code}/resolve", json={"action": "refund", "refund_amount": 100, "note": "Geste commercial"})
    assert r.status_code == 200 and r.json()["refund_amount"] == 100 and r.json()["escrow_status"] == "released"
    assert ctx.post(f"{API}/admin/bookings/{code}/resolve", json={"action": "release"}).status_code == 409
    ov = ctx.get(f"{API}/admin/overview").json()
    assert ov["properties_active"] >= 3 and ov["bookings"] >= 4


def test_auto_release_review_and_payout(ctx):
    pid = make_active(ctx, title="Lodge Avis", units=1, price_per_night=400, cleaning_fee=0, instant_book=True)
    code = ctx.post(f"{API}/book", json=book_body(pid, d(4), d(6))).json()["booking"]["code"]
    assert ctx.post(f"{API}/reviews", json={"booking_code": code, "rating": 5}).status_code == 409  # séjour pas terminé
    with Session(engine) as s:
        b = s.exec(select(Booking).where(Booking.code == code)).one()
        b.check_in, b.check_out = date.today() - timedelta(days=4), date.today() - timedelta(days=2)
        s.add(b)
        s.commit()
        expire_overdue(s)
        expire_overdue(s)
    view = ctx.get(f"{API}/me/bookings/{code}").json()
    assert view["status"] == "completed" and view["escrow_status"] == "released" and view["can_review"]
    r = ctx.post(f"{API}/reviews", json={"booking_code": code, "rating": 5, "cleanliness": 5, "accuracy": 4, "location": 5, "value": 4, "comment": "Superbe séjour"})
    assert r.status_code == 201, r.text
    assert ctx.post(f"{API}/reviews", json={"booking_code": code, "rating": 4}).status_code == 409
    detail = ctx.get(f"{API}/properties/{ctx.get(f'{API}/home').json()['latest'][0]['slug']}").json()
    assert detail["rating_count"] == 1 and detail["review_summary"]["avg"] == 5

    as_(ctx, "host")
    rid = ctx.get(f"{API}/host/reviews").json()[0]["id"]
    assert ctx.post(f"{API}/host/reviews/{rid}/reply", json={"reply": "Merci !"}).json()["host_reply"] == "Merci !"
    w = ctx.get(f"{API}/host/wallet").json()
    # 800 * 90 % = 720 pour ce séjour, + remboursement partiel du litige (200-100 → 90) + annulation stricte (900)
    assert w["available"] > 0 and w["total_earned"] >= 720
    assert ctx.post(f"{API}/host/payouts", json={"amount": w["available"] + 1}).status_code == 422
    assert ctx.post(f"{API}/host/payouts", json={"amount": 5}).status_code == 422  # sous le minimum
    r = ctx.post(f"{API}/host/payouts", json={"amount": 500})
    assert r.status_code == 201, r.text
    assert ctx.get(f"{API}/host/wallet").json()["available"] == round(w["available"] - 500, 2)
    stats = ctx.get(f"{API}/host/stats").json()
    assert stats["properties"] >= 4 and stats["revenue"] > 0
    as_(ctx, "admin")
    pay = ctx.get(f"{API}/admin/payouts", params={"status": "requested"}).json()[0]
    assert ctx.patch(f"{API}/admin/payouts/{pay['id']}", json={"status": "paid", "admin_note": "OK"}).json()["status"] == "paid"
    assert ctx.patch(f"{API}/admin/payouts/{pay['id']}", json={"status": "paid"}).status_code == 409
    # modération d'un avis
    assert ctx.patch(f"{API}/admin/reviews/{rid}", params={"hidden": "true"}).json()["is_hidden"] is True
    as_(ctx, "guest")
    assert ctx.get(f"{API}/properties/{detail['slug']}").json()["rating_count"] == 0


def test_expired_request_and_stale_payment(ctx):
    pid = make_active(ctx, title="Lodge Silence", units=1)
    code = ctx.post(f"{API}/book", json=book_body(pid, d(20), d(22))).json()["booking"]["code"]
    with Session(engine) as s:
        b = s.exec(select(Booking).where(Booking.code == code)).one()
        b.host_deadline = datetime.utcnow() - timedelta(hours=1)
        s.add(b)
        s.commit()
    view = ctx.get(f"{API}/me/bookings/{code}").json()
    assert view["status"] == "expired" and view["escrow_status"] == "refunded" and view["refund_amount"] == view["total"]
    assert ctx.post(f"{API}/quote", json={"property_id": pid, "check_in": d(20), "check_out": d(22), "guests": 2}).status_code == 200


def test_favorites_admin_hosts_and_settings(ctx):
    as_(ctx, "guest")
    assert ctx.post(f"{API}/favorites/{ctx.pid}").status_code == 204
    assert ctx.post(f"{API}/favorites/{ctx.pid}").status_code == 204  # idempotent
    favs = ctx.get(f"{API}/me/favorites").json()
    assert len(favs) == 1 and favs[0]["is_favorite"]
    assert ctx.delete(f"{API}/favorites/{ctx.pid}").status_code == 204
    assert ctx.get(f"{API}/me/favorites").json() == []
    as_(ctx, "admin")
    host = ctx.get(f"{API}/admin/hosts").json()[0]
    r = ctx.patch(f"{API}/admin/hosts/{host['id']}", json={"is_verified": True, "commission_rate": 5})
    assert r.json()["is_verified"] and r.json()["commission_rate"] == 5
    assert ctx.put(f"{API}/admin/settings", json={"values": {"commission_rate": "12"}}).json()["commission_rate"] == "12"
    assert ctx.put(f"{API}/admin/settings", json={"values": {"bogus": "1"}}).status_code == 422
    assert ctx.put(f"{API}/admin/settings", json={"values": {"commission_rate": "abc"}}).status_code == 422
    # hôte vérifié : publication directe, commission négociée appliquée
    as_(ctx, "host")
    r = ctx.post(f"{API}/host/properties", json=prop_body(ctx, title="Auto Publié", price_per_night=100, cleaning_fee=0))
    pid = r.json()["id"]
    assert ctx.post(f"{API}/host/properties/{pid}/submit").json()["status"] == "active"
    as_(ctx, "guest")
    q = ctx.post(f"{API}/quote", json={"property_id": pid, "check_in": d(60), "check_out": d(61), "guests": 1}).json()
    assert q["total"] == 100
    # non-admin refusé sur l'admin : le garde d'admin est surchargé dans ce fichier, on vérifie la pause hôte
    as_(ctx, "host")
    assert ctx.post(f"{API}/host/properties/{pid}/pause").json()["status"] == "paused"
    as_(ctx, "guest")
    assert ctx.post(f"{API}/quote", json={"property_id": pid, "check_in": d(60), "check_out": d(61), "guests": 1}).status_code == 404
