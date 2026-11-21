"""HFood — Phase A2 (SQLite) : restaurant vs vendeur individuel, livraison / conditions de vente, contact direct.

Inclut la passe de correction : F1 (changement de type : jamais auto-réservable, protégé côté serveur), F2 (notifications
selon le type), V7 (plats indisponibles gardés sur la fiche publique avec `is_available = False`).
Authentification RÉELLE ; base SQLite jetable ; uploads dans un dossier temporaire (jamais le vrai `uploads/`)."""
import atexit
import io
import os
import shutil
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="hfood_a2_")
atexit.register(shutil.rmtree, _tmpdir, ignore_errors=True)
_db = os.path.join(_tmpdir, "hfood_a2.db")
_pre = os.environ.get("DATABASE_URL", "").strip()
if _pre:
    raise RuntimeError("test_hfood_a2 refuse de tourner : DATABASE_URL est défini (base jetable SQLite uniquement).")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Notification, PartnerModule, User, UserRole  # noqa: E402
from app.restaurant import limits as L, services as svc  # noqa: E402
from app.restaurant.models import DiningTable, Reservation, Restaurant  # noqa: E402
from app.restaurant.routers import owner as owner_router  # noqa: E402
from app.services.rate_limit import limiter as shared_limiter  # noqa: E402

API = "/api/v1/restaurant"
PW = "motdepasse1"


def img():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 80, 40)).save(buf, "PNG")
    return buf.getvalue()


def day(offset=2):
    d = svc.local_now().date() + timedelta(days=offset)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d


@pytest.fixture(scope="module", autouse=True)
def _isolated(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    root = tmp_path_factory.mktemp("uploads")
    (root / "restaurant").mkdir()
    mp.setattr(owner_router, "UPLOAD_ROOT", root)
    mp.setattr(shared_limiter, "enabled", False)
    for k in ("RATE_RESERVE", "RATE_CANCEL", "RATE_REVIEW", "RATE_UPLOAD", "RATE_OWNER_NEW", "RATE_OWNER_ACT", "RATE_BROWSE"):
        mp.setattr(L, k, "100000/minute")
    mp.setattr(svc, "MAX_ACTIVE_PER_USER", 10_000)
    mp.setattr(owner_router, "MAX_RESTAURANTS", 1000)
    L.limiter.reset()
    try:
        yield root
    finally:
        mp.undo()


@pytest.fixture(scope="module")
def w():
    SQLModel.metadata.create_all(engine)
    with TestClient(app) as client:
        users, roles = {}, {"boss": UserRole.admin}
        keys = ("boss", "owner", "other", "g1", "g2")
        for key in keys:
            r = client.post("/api/v1/auth/register", json={"email": f"{key}@a2.example.com", "password": PW, "full_name": f"{key} Test"})
            assert r.status_code in (200, 201), r.text
        with Session(engine) as s:
            for key in keys:
                u = s.exec(select(User).where(User.email == f"{key}@a2.example.com")).one()
                u.is_verified = True
                if key in roles:
                    u.role = roles[key]
                s.add(u)
                s.commit()
                users[key] = u.id
            for key in ("owner", "other"):
                s.add(PartnerModule(user_id=users[key], module="restaurant"))
            s.commit()
        tokens = {}
        for key in users:
            r = client.post("/api/v1/auth/login", json={"email": f"{key}@a2.example.com", "password": PW})
            assert r.status_code == 200, r.text
            tokens[key] = r.json()["access_token"]
        client.cookies.clear()
        client.users, client.tokens = users, tokens
        yield client


def H(w, who, confirm=False):
    h = {"Authorization": f"Bearer {w.tokens[who]}"}
    if confirm:
        r = w.post("/api/v1/admin-security/confirm", json={"password": PW}, headers=h)
        assert r.status_code == 200, r.text
        w.cookies.clear()
        h["X-Admin-Confirm"] = r.json()["confirm_token"]
    return h


def photo(w, who="owner"):
    p = w.post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(img()), "image/png")}, headers=H(w, who))
    assert p.status_code == 200, p.text
    return p.json()["path"]


def create(w, name, seller_type=None, **kw):
    body = {"name": name, "summary": "Résumé", "city": "Lusaka", "phone": "0971", **kw}
    if seller_type:
        body["seller_type"] = seller_type
    r = w.post(f"{API}/owner/restaurants", json=body, headers=H(w, "owner"))
    assert r.status_code == 201, r.text
    return r.json()


def put(w, rid, body, who="owner"):
    return w.put(f"{API}/owner/restaurants/{rid}", json=body, headers=H(w, who))


def full(w, rid, **changes):
    """Corps de PUT complet (le PUT remplace les champs de base ; seuls les champs A2 absents sont conservés)."""
    v = w.get(f"{API}/owner/restaurants/{rid}", headers=H(w, "owner")).json()
    body = {k: v[k] for k in ("name", "summary", "description", "city", "area", "address", "phone", "whatsapp", "images")}
    body.update(changes)
    return body


def add_dish(w, rid, **kw):
    r = w.post(f"{API}/owner/restaurants/{rid}/items", json={"name": "Plat", "price": 10, **kw}, headers=H(w, "owner"))
    assert r.status_code == 201, r.text
    return r.json()


def approve(w, rid):
    r = w.post(f"{API}/admin/restaurants/{rid}/approve", headers=H(w, "boss", True))
    assert r.status_code == 200, r.text
    return r.json()


def live_individual(w, name, **kw):
    """Vendeur individuel complet, envoyé pour validation puis approuvé."""
    v = create(w, name, "individual", images=[photo(w)], **kw)
    add_dish(w, v["id"])
    s = w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner"))
    assert s.status_code == 200, s.text
    approve(w, v["id"])
    return v["id"]


def live_restaurant(w, name, with_tables=True):
    v = create(w, name, address="Rue 1", images=[photo(w)])
    add_dish(w, v["id"])
    if with_tables:
        t = w.put(f"{API}/owner/restaurants/{v['id']}/tables", json=[{"label": "T1", "seats": 4, "x": 2, "z": 2}], headers=H(w, "owner"))
        assert t.status_code == 200, t.text
    s = w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner"))
    assert s.status_code == 200, s.text
    approve(w, v["id"])
    return v["id"]


def book(w, who, rid, d, t="19:00"):
    return w.post(f"{API}/reservations", json={"restaurant_id": rid, "day": d.isoformat(), "time": t, "party_size": 2, "name": "Client"}, headers=H(w, who))


def notifs(uid):
    with Session(engine) as s:
        return [(n.title, n.body) for n in s.exec(select(Notification).where(Notification.user_id == uid).order_by(Notification.id)).all()]


def set_row(rid, **kw):
    with Session(engine) as s:
        r = s.get(Restaurant, rid)
        for k, v in kw.items():
            setattr(r, k, v)
        s.add(r)
        s.commit()


# ───────────────────────── A. profils vendeurs ─────────────────────────
def test_default_type_is_restaurant_and_individual_needs_no_address(w):
    a = create(w, "A2 Défaut")
    assert a["seller_type"] == "restaurant" and a["offers_delivery"] is False and a["delivery_fee"] is None
    b = create(w, "A2 Individuel", "individual")  # sans adresse, sans horaires métier
    assert b["seller_type"] == "individual" and b["address"] == ""


def test_invalid_seller_type_rejected(w):
    r = w.post(f"{API}/owner/restaurants", json={"name": "A2 Bad", "seller_type": "dealer"}, headers=H(w, "owner"))
    assert r.status_code == 422


def test_other_owner_cannot_change_type(w):
    a = create(w, "A2 Privé", "individual")
    r = put(w, a["id"], {"name": "A2 Privé", "seller_type": "restaurant"}, who="other")
    assert r.status_code == 404


# ───────────────────────── C. livraison et conditions de vente ─────────────────────────
def test_delivery_fields_roundtrip_and_fee_semantics(w):
    a = create(w, "A2 Livraison", "individual", offers_delivery=True, delivery_zones="Kabulonga, Woodlands", delivery_fee=25, delivery_fee_note="Selon la distance",
               delivery_terms="Livraison le jour même", sale_notes="Commande 24 h à l'avance")
    assert (a["offers_delivery"], a["delivery_fee"], a["delivery_zones"]) == (True, 25, "Kabulonga, Woodlands")
    assert a["sale_notes"] == "Commande 24 h à l'avance" and a["delivery_terms"] == "Livraison le jour même"
    free = put(w, a["id"], {"name": "A2 Livraison", "delivery_fee": 0}).json()
    assert free["delivery_fee"] == 0  # 0 = gratuite (≠ à convenir)
    tbd = put(w, a["id"], {"name": "A2 Livraison", "delivery_fee": None}).json()
    assert tbd["delivery_fee"] is None  # null explicite = à convenir
    assert put(w, a["id"], {"name": "A2 Livraison", "delivery_fee": -1}).status_code == 422


def test_legacy_put_keeps_a2_values(w):
    a = create(w, "A2 Legacy", "individual", offers_delivery=True, delivery_zones="Rhodes Park", delivery_fee=10, delivery_terms="T", sale_notes="N")
    r = put(w, a["id"], {"name": "A2 Legacy renommé", "summary": "Autre", "city": "Lusaka", "phone": "0971"}).json()  # ancien client : aucun champ A2
    assert r["name"] == "A2 Legacy renommé" and r["seller_type"] == "individual"
    assert (r["offers_delivery"], r["delivery_zones"], r["delivery_fee"], r["delivery_terms"], r["sale_notes"]) == (True, "Rhodes Park", 10, "T", "N")


# ───────────────────────── publication ─────────────────────────
def test_individual_checklist_and_submit(w):
    v = create(w, "A2 Checklist", "individual", phone="", whatsapp="", offers_delivery=True)
    assert set(v["missing"]) == {"un contact (téléphone ou WhatsApp)", "au moins une photo", "au moins un plat", "les zones de livraison"}
    r = w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner"))
    assert r.status_code == 422 and "contact" in r.json()["detail"] and "zones" in r.json()["detail"] and "table" not in r.json()["detail"]
    put(w, v["id"], {"name": "A2 Checklist", "summary": "R", "city": "Lusaka", "whatsapp": "+260971000000", "offers_delivery": True, "delivery_zones": "Roma", "images": [photo(w)]})
    add_dish(w, v["id"])
    assert w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner")).json()["status"] == "pending"


def test_restaurant_publication_rules_unchanged(w):
    v = create(w, "A2 Resto règles", address="")
    assert "résumé, ville et adresse" in v["missing"] and "au moins une table dans le plan de salle" in v["missing"]
    assert w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner")).status_code == 422


def test_individual_public_detail(w):
    rid = live_individual(w, "A2 Fiche publique", offers_delivery=True, delivery_zones="Kabulonga;Roma", delivery_fee=0, sale_notes="Paiement à la livraison")
    with Session(engine) as s:
        slug = s.get(Restaurant, rid).slug
    d = w.get(f"{API}/restaurants/{slug}").json()
    assert d["seller_type"] == "individual" and d["accepts_reservations"] is False
    assert d["tables"] == [] and d["slots"] == [] and d["accepts_preorder"] is False
    dv = d["delivery"]
    assert dv["offers"] is True and dv["zones"] == ["Kabulonga", "Roma"] and dv["fee"] == 0 and dv["payment"] == "manual"
    assert d["phone"] == "0971" and d["sale_notes"] == "Paiement à la livraison"


# ───────────────────────── règles serveur : pas de réservation ─────────────────────────
def test_individual_cannot_be_reserved_409(w):
    rid = live_individual(w, "A2 Sans résa")
    d = day(3)
    assert book(w, "g1", rid, d).status_code == 409
    assert w.get(f"{API}/restaurants/{rid}/slots", params={"day": d.isoformat()}).status_code == 409
    assert w.get(f"{API}/restaurants/{rid}/tables", params={"day": d.isoformat(), "time": "19:00"}).status_code == 409


def test_individual_cannot_save_tables_409(w):
    a = create(w, "A2 Sans tables", "individual")
    r = w.put(f"{API}/owner/restaurants/{a['id']}/tables", json=[{"label": "T1", "seats": 4, "x": 2, "z": 2}], headers=H(w, "owner"))
    assert r.status_code == 409
    with Session(engine) as s:
        assert s.exec(select(DiningTable).where(DiningTable.restaurant_id == a["id"])).all() == []


def test_restaurant_still_bookable(w):
    rid = live_restaurant(w, "A2 Résa OK")
    d = day(4)
    r = book(w, "g1", rid, d)
    assert r.status_code == 201, r.text
    assert w.get(f"{API}/restaurants/{rid}/slots", params={"day": d.isoformat()}).status_code == 200


def test_search_filters_and_excludes_individuals_by_slot(w):
    ind = live_individual(w, "A2 Rech Indiv", offers_delivery=True, delivery_zones="Roma")
    res = live_restaurant(w, "A2 Rech Resto")
    ids = lambda j: {i["id"] for i in j["items"]}  # noqa: E731
    only_ind = w.get(f"{API}/search", params={"seller_type": "individual"}).json()
    assert ind in ids(only_ind) and res not in ids(only_ind)
    assert all(i["seller_type"] == "individual" for i in only_ind["items"])
    assert ind in ids(w.get(f"{API}/search", params={"delivery": "true"}).json())
    assert res not in ids(w.get(f"{API}/search", params={"delivery": "true"}).json())
    d = day(5)
    by_slot = w.get(f"{API}/search", params={"day": d.isoformat(), "time": "19:00", "per_page": 48}).json()
    assert ind not in ids(by_slot) and res in ids(by_slot) and by_slot["excluded_individuals"] >= 1
    assert w.get(f"{API}/search", params={"seller_type": "individual", "day": d.isoformat(), "time": "19:00"}).json()["items"] == []


# ───────────────────────── F1 : changement de type ─────────────────────────
def test_f1_individual_to_restaurant_goes_back_to_draft_and_not_bookable(w):
    rid = live_individual(w, "A2 F1 vers resto")
    r = put(w, rid, {"name": "A2 F1 vers resto", "seller_type": "restaurant"})
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["status"] == "draft" and "individuel" in v["status_reason"] and v["accepts_reservations"] is False
    assert "au moins une table dans le plan de salle" in v["missing"] and "résumé, ville et adresse" in v["missing"]
    with Session(engine) as s:  # rien d'artificiel : ni table ni salle créées
        assert s.exec(select(DiningTable).where(DiningTable.restaurant_id == rid)).all() == []
    assert w.get(f"{API}/restaurants/{rid}").status_code in (404, 405)  # plus publié (liste publique uniquement par slug)
    assert w.post(f"{API}/owner/restaurants/{rid}/submit", headers=H(w, "owner")).status_code == 422
    assert book(w, "g1", rid, day(3)).status_code == 404  # brouillon : introuvable côté client


def test_f1_forced_active_without_tables_is_still_not_bookable(w):
    """Même si la fiche est remise « en ligne » (ex. action admin) sans plan de salle : 409 partout, aucun créneau proposé."""
    rid = live_individual(w, "A2 F1 forcé")
    put(w, rid, {"name": "A2 F1 forcé", "seller_type": "restaurant", "address": "Rue 2"})
    set_row(rid, status="active")
    d = day(3)
    assert book(w, "g1", rid, d).status_code == 409
    assert w.get(f"{API}/restaurants/{rid}/slots", params={"day": d.isoformat()}).status_code == 409
    assert w.get(f"{API}/restaurants/{rid}/tables", params={"day": d.isoformat(), "time": "19:00"}).status_code == 409
    with Session(engine) as s:
        slug = s.get(Restaurant, rid).slug
    det = w.get(f"{API}/restaurants/{slug}").json()
    assert det["accepts_reservations"] is False and det["slots"] == [] and det["tables"] == []
    with Session(engine) as s:
        assert s.exec(select(Reservation).where(Reservation.restaurant_id == rid)).all() == []


def test_f1_then_complete_and_resubmit_becomes_bookable(w):
    rid = live_individual(w, "A2 F1 complet")
    put(w, rid, full(w, rid, seller_type="restaurant", address="Rue 3"))
    assert w.put(f"{API}/owner/restaurants/{rid}/tables", json=[{"label": "T1", "seats": 4, "x": 2, "z": 2}], headers=H(w, "owner")).status_code == 200
    assert w.post(f"{API}/owner/restaurants/{rid}/submit", headers=H(w, "owner")).status_code == 200
    approve(w, rid)
    assert book(w, "g2", rid, day(6)).status_code == 201


def test_f1_restaurant_to_individual_blocked_with_running_reservations_then_ok(w):
    rid = live_restaurant(w, "A2 F1 vers indiv")
    d = day(3)
    r = book(w, "g1", rid, d)
    assert r.status_code == 201
    blocked = put(w, rid, {"name": "A2 F1 vers indiv", "seller_type": "individual"})
    assert blocked.status_code == 409
    assert w.get(f"{API}/owner/restaurants/{rid}", headers=H(w, "owner")).json()["seller_type"] == "restaurant"  # inchangé
    assert w.post(f"{API}/owner/reservations/{r.json()['code']}/action", json={"action": "decline", "reason": "x"}, headers=H(w, "owner")).status_code == 200
    ok = put(w, rid, {"name": "A2 F1 vers indiv", "seller_type": "individual"})
    assert ok.status_code == 200 and ok.json()["status"] == "draft"
    with Session(engine) as s:  # plan de salle et historique conservés
        assert len(s.exec(select(DiningTable).where(DiningTable.restaurant_id == rid)).all()) == 1
        assert len(s.exec(select(Reservation).where(Reservation.restaurant_id == rid)).all()) == 1


def test_type_change_on_draft_keeps_draft_without_reason(w):
    a = create(w, "A2 Brouillon")
    r = put(w, a["id"], {"name": "A2 Brouillon", "seller_type": "individual"}).json()
    assert r["status"] == "draft" and r["status_reason"] is None


def test_same_type_resend_does_not_unpublish(w):
    rid = live_individual(w, "A2 Même type")
    r = put(w, rid, {"name": "A2 Même type", "seller_type": "individual", "sale_notes": "Nouveau"}).json()
    assert r["status"] == "active" and r["sale_notes"] == "Nouveau"


# ───────────────────────── F2 : notifications selon le type ─────────────────────────
def test_f2_notifications_individual(w, monkeypatch):
    mails = []
    monkeypatch.setattr(svc, "send_email", lambda to, subject, body, **k: mails.append((subject, body)))
    v = create(w, "A2 Notif indiv", "individual", images=[photo(w)])
    add_dish(w, v["id"])
    assert w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner")).status_code == 200
    approve(w, v["id"])
    title, body = notifs(w.users["owner"])[-1]
    assert title == "Fiche vendeur validée"
    assert "contacter directement" in body and "réserver" not in body.lower()
    assert mails and "réserver" not in mails[-1][1].lower() and "Fiche vendeur validée" in mails[-1][0]
    r = w.post(f"{API}/admin/restaurants/{v['id']}/suspend", json={"reason": "Test"}, headers=H(w, "boss", True))
    assert r.status_code == 200
    assert notifs(w.users["owner"])[-1][0] == "Fiche vendeur suspendue"


def test_f2_reject_and_restaurant_unchanged(w):
    v = create(w, "A2 Notif rejet", "individual", images=[photo(w)])
    add_dish(w, v["id"])
    w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner"))
    assert w.post(f"{API}/admin/restaurants/{v['id']}/reject", json={"reason": "Photo floue"}, headers=H(w, "boss", True)).status_code == 200
    assert notifs(w.users["owner"])[-1][0] == "Fiche vendeur à corriger"
    rid = live_restaurant(w, "A2 Notif resto")
    title, body = [n for n in notifs(w.users["owner"]) if n[0] == "Restaurant validé"][-1]
    assert "réserver" in body


# ───────────────────────── admin ─────────────────────────
def test_admin_filter_and_row_type(w):
    ind = live_individual(w, "A2 Admin indiv")
    rows = w.get(f"{API}/admin/restaurants", params={"seller_type": "individual"}, headers=H(w, "boss", True)).json()
    assert rows and all(x["seller_type"] == "individual" for x in rows) and ind in {x["id"] for x in rows}


# ───────────────────────── V7 : plats indisponibles ─────────────────────────
def test_v7_unavailable_dishes_stay_visible_with_flag(w):
    v = create(w, "A2 V7", "individual", images=[photo(w)])
    c = w.post(f"{API}/owner/restaurants/{v['id']}/categories", json={"name": "Épuisé"}, headers=H(w, "owner")).json()
    cat = c["menu"][0]["id"]
    add_dish(w, v["id"], name="Dispo", price=5)
    add_dish(w, v["id"], name="Épuisé 1", price=7, category_id=cat, is_available=False)
    w.post(f"{API}/owner/restaurants/{v['id']}/submit", headers=H(w, "owner"))
    approve(w, v["id"])
    with Session(engine) as s:
        slug = s.get(Restaurant, v["id"]).slug
    menu = w.get(f"{API}/restaurants/{slug}").json()["menu"]
    items = {i["name"]: i for c in menu for i in c["items"]}
    assert items["Dispo"]["is_available"] is True and items["Épuisé 1"]["is_available"] is False
    assert any(c["name"] == "Épuisé" and [i["name"] for i in c["items"]] == ["Épuisé 1"] for c in menu)  # catégorie 100 % indisponible conservée
