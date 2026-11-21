"""HFood — Phase A1 (SQLite) : anti double-réservation, permissions admin, uploads, rate limiting.

Authentification RÉELLE (jetons signés, vraie confirmation admin) : aucune dépendance de sécurité n'est surchargée.
Le test de concurrence sur PostgreSQL est dans `test_hfood_a1_pg.py` (nécessite HFOOD_TEST_PG_URL)."""
import atexit
import io
import os
import shutil
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="hfood_a1_")
atexit.register(shutil.rmtree, _tmpdir, ignore_errors=True)  # dossier jetable de la base SQLite : retiré à la fin
_db = os.path.join(_tmpdir, "hfood_a1.db")
_pre = os.environ.get("DATABASE_URL", "").strip()


def _is_throwaway(url):
    """Base jetable : fichier SQLite du dossier temporaire / mémoire, OU la base PostgreSQL de test déjà validée par les
    garde-fous cumulatifs de tests/pg_safety.py (cas de test_hfood_a1_pg.py, qui importe ce module)."""
    if url.startswith("sqlite"):
        path = url.split("///", 1)[-1]
        if ":memory:" in url:
            return True
        # chemin ABSOLU dans le dossier temporaire uniquement (un chemin relatif viserait la base de dev du projet)
        return os.path.isabs(path) and os.path.realpath(path).startswith(os.path.realpath(tempfile.gettempdir()) + os.sep)
    pgu = os.environ.get("HFOOD_TEST_PG_URL", "").strip()
    if not pgu:
        return False
    from sqlalchemy.engine import make_url
    from tests import pg_safety as S
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    target = S.check_test_url(pgu, environ=env)
    S.require_confirmation(target, environ=env)
    return S._same_db(make_url(url), target.url)


# Ce fichier crée des tables et des données : il ne doit JAMAIS tourner contre une vraie base.
if _pre and not _is_throwaway(_pre):
    raise RuntimeError("test_hfood_a1 refuse de tourner : DATABASE_URL ne désigne pas une base jetable (SQLite temporaire ou base PostgreSQL de test validée).")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerModule, User, UserRole  # noqa: E402
from app.restaurant import images as imgcheck, limits as L, services as svc  # noqa: E402
from app.restaurant.models import Reservation  # noqa: E402
from app.restaurant.routers import owner as owner_router  # noqa: E402
from app.services.rate_limit import limiter as shared_limiter  # noqa: E402
from app.upload_store import UploadBlob  # noqa: E402
from tests.threads_util import run_parallel  # noqa: E402

API = "/api/v1/restaurant"
PW = "motdepasse1"


def img(fmt="PNG", size=(8, 8), **kw):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 80, 40)).save(buf, fmt, **kw)
    return buf.getvalue()


def day(offset=2):
    d = svc.local_now().date() + timedelta(days=offset)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d


def distinct_days(n, start=2):
    """n dates futures DISTINCTES. `day(a)` et `day(a+1)` peuvent désigner la même date (le dimanche est sauté) :
    selon le jour d'exécution, deux « jours différents » devenaient le même et provoquaient un 409 parasite."""
    out, off = [], start
    while len(out) < n:
        d = day(off)
        if d not in out:
            out.append(d)
        off += 1
    return out


@pytest.fixture(scope="module", autouse=True)
def _isolated_globals(tmp_path_factory):
    """Isole ce module du reste de la suite : tout ce qu'il change globalement est restauré à la fin.
      * dossier d'uploads : un dossier TEMPORAIRE (jamais le vrai `uploads/` du projet, qui peut contenir des fichiers réels) ;
      * limiteur global (auth…) : désactivé le temps du module seulement (celui du module restaurant reste actif)."""
    mp = pytest.MonkeyPatch()
    root = tmp_path_factory.mktemp("uploads")
    (root / "restaurant").mkdir()
    mp.setattr(owner_router, "UPLOAD_ROOT", root)
    mp.setattr(shared_limiter, "enabled", False)
    try:
        yield root
    finally:
        mp.undo()


def test_a1_uploads_are_sandboxed_outside_the_project_uploads_dir(_isolated_globals):
    from pathlib import Path
    project_uploads = Path(__file__).resolve().parent.parent / "uploads"
    assert owner_router.UPLOAD_ROOT == _isolated_globals
    assert project_uploads not in owner_router.UPLOAD_ROOT.parents and owner_router.UPLOAD_ROOT != project_uploads


@pytest.fixture(autouse=True)
def _limits(monkeypatch):
    """Par défaut les limites sont relâchées ; chaque test de débit fixe les siennes."""
    for k in ("RATE_RESERVE", "RATE_CANCEL", "RATE_REVIEW", "RATE_UPLOAD", "RATE_OWNER_NEW", "RATE_OWNER_ACT", "RATE_BROWSE"):
        monkeypatch.setattr(L, k, "100000/minute")
    L.limiter.reset()
    monkeypatch.setattr(svc, "MAX_ACTIVE_PER_USER", 10_000)  # règle métier hors sujet : les mêmes comptes réservent souvent
    monkeypatch.setattr(owner_router, "MAX_RESTAURANTS", 1000)  # les tests créent beaucoup de restaurants avec le même compte


@pytest.fixture(scope="module")
def w():
    """Monde de test : comptes réels, jetons, restaurants."""
    SQLModel.metadata.create_all(engine)
    with TestClient(app) as client:
        users, roles = {}, {"boss": UserRole.admin, "boss2": UserRole.admin}
        for key in ("boss", "boss2", "owner", "nomod", "g1", "g2", "g3", "stranger"):
            r = client.post("/api/v1/auth/register", json={"email": f"{key}@a1.example.com", "password": PW, "full_name": f"{key} Test"})
            assert r.status_code in (200, 201), r.text
        with Session(engine) as s:
            for key in ("boss", "boss2", "owner", "nomod", "g1", "g2", "g3", "stranger"):
                u = s.exec(select(User).where(User.email == f"{key}@a1.example.com")).one()
                u.is_verified = True
                if key in roles:
                    u.role = roles[key]
                s.add(u)
                s.commit()
                users[key] = u.id
            s.add(PartnerModule(user_id=users["owner"], module="restaurant"))
            s.add(PartnerModule(user_id=users["nomod"], module="restaurant", active=False))
            s.commit()
        tokens = {}
        for key in users:
            r = client.post("/api/v1/auth/login", json={"email": f"{key}@a1.example.com", "password": PW})
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


def mk(w, name="A1 Resto", tables=None, approve=True):
    ho = H(w, "owner")
    p = w.post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(img()), "image/png")}, headers=ho)
    assert p.status_code == 200, p.text
    body = {"name": name, "summary": "s", "description": "d", "cuisines": ["grill"], "city": "Lusaka", "address": "x", "phone": "0971", "closed_days": [],
            "slot_minutes": 90, "max_party": 8, "images": [p.json()["path"]]}
    rid = w.post(f"{API}/owner/restaurants", json=body, headers=ho).json()["id"]
    w.post(f"{API}/owner/restaurants/{rid}/items", json={"name": "Plat", "price": 10}, headers=ho)
    w.put(f"{API}/owner/restaurants/{rid}/tables", json=tables or [{"label": "T1", "seats": 4, "x": 2, "z": 2}], headers=ho)
    assert w.post(f"{API}/owner/restaurants/{rid}/submit", headers=ho).status_code == 200
    if approve:
        assert w.post(f"{API}/admin/restaurants/{rid}/approve", headers=H(w, "boss", True)).status_code == 200
    return rid, body


def book(w, who, rid, d, t="19:00", **kw):
    return w.post(f"{API}/reservations", json={"restaurant_id": rid, "day": d.isoformat(), "time": t, "party_size": 2, "name": "Test Client", **kw}, headers=H(w, who))


def act(w, code, action, who="owner", **kw):
    return w.post(f"{API}/owner/reservations/{code}/action", json={"action": action, **kw}, headers=H(w, who))


# ======================================================================================
# A1.1 — double réservation (SQLite : vérification transactionnelle ; PostgreSQL : voir test_hfood_a1_pg.py)
# ======================================================================================
def test_a11_forced_interleave_gives_one_booking_and_one_409(w):
    """Reproduction de la sonde P1 de l'audit : la 2e demande s'exécute ENTRE le choix de la table et l'insertion de la 1re."""
    rid, _ = mk(w, "A1.1 Race")
    d = day(3)
    orig = svc.build_preorder
    state = {"inner": None, "done": False}

    def hooked(session, r, lines):
        if not state["done"]:
            state["done"] = True
            state["inner"] = book(w, "g2", rid, d)
        return orig(session, r, lines)

    svc.build_preorder = hooked
    try:
        outer = book(w, "g1", rid, d)
    finally:
        svc.build_preorder = orig
    codes = sorted([state["inner"].status_code, outer.status_code])
    assert codes == [201, 409], codes
    with Session(engine) as s:
        n = len(s.exec(select(Reservation).where(Reservation.restaurant_id == rid, Reservation.status.in_(("pending", "confirmed")))).all())
    assert n == 1


def test_a11_two_different_tables_both_succeed(w):
    rid, _ = mk(w, "A1.1 Deux tables", tables=[{"label": "T1", "seats": 4, "x": 2, "z": 2}, {"label": "T2", "seats": 4, "x": 5, "z": 2}])
    d = day(4)
    a, b = book(w, "g1", rid, d), book(w, "g2", rid, d)
    assert (a.status_code, b.status_code) == (201, 201)
    assert a.json()["table_label"] != b.json()["table_label"]
    assert book(w, "g3", rid, d).status_code == 409  # plus aucune table libre à cette heure


def test_a11_non_conflicting_slots_ok_and_adjacent_ok(w):
    rid, _ = mk(w, "A1.1 Créneaux")
    d = day(5)
    # durée 90 min : 19:00-20:30 ; 20:30 démarre exactement à la fin (fin exclusive) ; 21:00 aussi
    assert book(w, "g1", rid, d, "19:00").status_code == 201
    assert book(w, "g2", rid, d, "20:30").status_code == 201
    assert book(w, "g3", rid, d, "12:00").status_code == 201
    assert book(w, "stranger", rid, d, "20:00").status_code == 409  # 20:00 chevauche 19:00-20:30
    assert book(w, "stranger", rid, d + timedelta(days=1), "19:00").status_code in (201, 422)  # autre jour : non concerné


def test_a11_cancelled_then_rebook(w):
    rid, _ = mk(w, "A1.1 Annulée")
    d = day(6)
    a = book(w, "g1", rid, d)
    assert a.status_code == 201
    assert book(w, "g2", rid, d).status_code == 409
    assert w.post(f"{API}/me/reservations/{a.json()['code']}/cancel", headers=H(w, "g1")).status_code == 200
    assert book(w, "g2", rid, d).status_code == 201


def test_a11_declined_then_rebook(w):
    rid, _ = mk(w, "A1.1 Refusée")
    d = day(7)
    a = book(w, "g1", rid, d)
    assert a.status_code == 201
    code = a.json()["code"]
    # confirmation manuelle requise ? sinon la réservation est déjà « confirmed » : on utilise l'action autorisée
    if a.json()["status"] == "pending":
        assert act(w, code, "decline", reason="complet").status_code == 200
    else:
        assert act(w, code, "cancel", reason="complet").status_code == 200
    assert book(w, "g2", rid, d).status_code == 201


@pytest.mark.parametrize("path,blocks", [
    (("confirm",), True), (("confirm", "seat"), True),
    (("confirm", "seat", "complete"), False), (("confirm", "no_show"), False), (("cancel",), False), (("decline",), False),
])
def test_a11_statuses_that_block_or_free_a_table(w, path, blocks):
    """pending / confirmed / seated BLOQUENT la table ; completed / no_show / cancelled / declined la LIBÈRENT."""
    rid, _ = mk(w, f"A1.1 Statuts {'-'.join(path)}")
    d = day(8)
    r = book(w, "g1", rid, d)
    assert r.status_code == 201
    code = r.json()["code"]
    if r.json()["status"] == "pending" or path[0] != "confirm":
        for a in path:
            res = act(w, code, a, reason="x")
            assert res.status_code == 200, (a, res.text)
    else:  # confirmation instantanée : déjà « confirmed »
        for a in path[1:] if path[0] == "confirm" else path:
            assert act(w, code, a, reason="x").status_code == 200
    again = book(w, "g2", rid, d)
    assert (again.status_code == 409) is blocks, (path, again.status_code)


def test_a11_owner_move_to_taken_table_is_409_and_to_free_table_ok(w):
    rid, _ = mk(w, "A1.1 Move", tables=[{"label": "T1", "seats": 4, "x": 2, "z": 2}, {"label": "T2", "seats": 4, "x": 5, "z": 2}, {"label": "T3", "seats": 4, "x": 8, "z": 2}])
    d = day(9)
    a, b = book(w, "g1", rid, d), book(w, "g2", rid, d)
    assert (a.status_code, b.status_code) == (201, 201)
    with Session(engine) as s:
        ra = s.exec(select(Reservation).where(Reservation.code == a.json()["code"])).one()
        rb = s.exec(select(Reservation).where(Reservation.code == b.json()["code"])).one()
        from app.restaurant.models import DiningTable
        free = [t.id for t in s.exec(select(DiningTable).where(DiningTable.restaurant_id == rid)).all() if t.id not in (ra.table_id, rb.table_id)][0]
        taken_by_b = rb.table_id
    r = w.post(f"{API}/owner/reservations/{a.json()['code']}/action", json={"action": "move", "table_id": taken_by_b}, headers=H(w, "owner"))
    assert r.status_code == 409, r.text
    r = w.post(f"{API}/owner/reservations/{a.json()['code']}/action", json={"action": "move", "table_id": free}, headers=H(w, "owner"))
    assert r.status_code == 200, r.text
    with Session(engine) as s:
        assert s.exec(select(Reservation).where(Reservation.code == a.json()["code"])).one().table_id == free


def test_a11_new_reservation_records_occupation_window(w):
    rid, _ = mk(w, "A1.1 Plage")
    d = day(10)
    code = book(w, "g1", rid, d, "19:00").json()["code"]
    with Session(engine) as s:
        x = s.exec(select(Reservation).where(Reservation.code == code)).one()
    assert x.start_at.isoformat() == f"{d.isoformat()}T19:00:00" and x.end_at.isoformat() == f"{d.isoformat()}T20:30:00"


# ======================================================================================
# A1.2 — permissions administratives
# ======================================================================================
ADMIN_ROUTES = [
    ("get", "/overview", None), ("get", "/restaurants", None),
    ("post", "/restaurants/{rid}/approve", None), ("post", "/restaurants/{rid}/reject", {"reason": "non conforme"}),
    ("post", "/restaurants/{rid}/suspend", {"reason": "test"}), ("post", "/restaurants/{rid}/feature", None),
]


def _call(w, m, path, body, headers):
    kw = {"headers": headers}
    if body is not None:
        kw["json"] = body
    return getattr(w, m)(f"{API}/admin{path}", **kw)


def test_a12_all_admin_routes_share_the_same_rule(w):
    rid, _ = mk(w, "A1.2 Perm", approve=False)
    for m, path, body in ADMIN_ROUTES:
        p = path.format(rid=rid)
        assert _call(w, m, p, body, {}).status_code == 401, ("anonyme", p)
        assert _call(w, m, p, body, H(w, "stranger")).status_code == 403, ("non-admin", p)
        assert _call(w, m, p, body, H(w, "owner")).status_code == 403, ("propriétaire non-admin", p)
        assert _call(w, m, p, body, H(w, "boss")).status_code == 428, ("admin NON confirmé", p)
        forged = {**H(w, "boss"), "X-Admin-Confirm": "x.y.z"}
        assert _call(w, m, p, body, forged).status_code == 428, ("jeton falsifié", p)
        other = {**H(w, "boss"), "X-Admin-Confirm": H(w, "boss2", True)["X-Admin-Confirm"]}
        assert _call(w, m, p, body, other).status_code == 428, ("confirmation d'un autre admin", p)
    hb = H(w, "boss", True)
    rid2, _ = mk(w, "A1.2 Perm bis", approve=False)
    for m, path, body in ADMIN_ROUTES:
        target = rid2 if path.endswith("/reject") else rid  # reject exige « pending » : restaurant dédié
        r = _call(w, m, path.format(rid=target), body, hb)
        assert r.status_code == 200, ("admin confirmé", path, r.status_code, r.text)


def dep_calls(dependant, seen=None):
    """TOUTES les dépendances d'une route, récursivement (une dépendance qui dépend elle-même de la garde compte)."""
    seen = set() if seen is None else seen
    out = []
    for d in dependant.dependencies:
        if id(d) in seen:
            continue
        seen.add(id(d))
        out.append(d.call)
        out += dep_calls(d, seen)
    return out


def test_a12_every_route_of_the_admin_router_is_protected():
    """Garde-fou structurel : une future route ajoutée au routeur admin sans confirmation fera échouer ce test.
    La vérification est RÉCURSIVE (dépendances de dépendances) et couvre aussi les dépendances posées sur le routeur."""
    from fastapi.routing import APIRoute
    from app.admin_security import require_admin_confirmed
    from app.restaurant.routers.admin import router
    routes = [r for r in router.routes if isinstance(r, APIRoute)]
    assert len(routes) == len(router.routes) and len(routes) >= 6  # aucune route « exotique » ignorée
    for route in routes:
        assert require_admin_confirmed in dep_calls(route.dependant), f"{route.path} n'exige pas require_admin_confirmed"


def test_a12_recursive_dependency_check_detects_nested_and_missing_guards():
    """Preuve que le contrôle récursif voit une garde imbriquée ET repère une route non protégée."""
    from fastapi import APIRouter, Depends
    from fastapi.routing import APIRoute
    from app.admin_security import require_admin_confirmed

    def wrapper(_=Depends(require_admin_confirmed)):  # garde atteinte seulement via une 2e couche
        return True

    r1 = APIRouter()
    r1.get("/nested")(lambda ok=Depends(wrapper): {"ok": ok})
    r1.get("/open")(lambda: {"ok": True})
    r2 = APIRouter(dependencies=[Depends(require_admin_confirmed)])
    r2.get("/router-level")(lambda: {"ok": True})
    by = {rt.path: rt for rt in list(r1.routes) + list(r2.routes) if isinstance(rt, APIRoute)}
    assert require_admin_confirmed in dep_calls(by["/nested"].dependant)
    assert require_admin_confirmed not in dep_calls(by["/open"].dependant)
    assert require_admin_confirmed in dep_calls(by["/router-level"].dependant)
    assert require_admin_confirmed not in [d.call for d in by["/nested"].dependant.dependencies]  # le contrôle SUPERFICIEL aurait échoué


def test_a12_admin_acting_on_foreign_restaurant_through_owner_routes_needs_confirmation(w):
    rid, body = mk(w, "A1.2 Indirect")
    path = f"{API}/owner/restaurants/{rid}"
    assert w.get(path, headers=H(w, "boss")).status_code == 428           # admin non confirmé
    assert w.put(path, json=body, headers=H(w, "boss")).status_code == 428
    assert w.get(path, headers=H(w, "boss", True)).status_code == 200      # admin confirmé
    assert w.get(path, headers=H(w, "stranger")).status_code == 404        # non-admin : inchangé
    assert w.get(path, headers=H(w, "owner")).status_code == 200           # propriétaire : inchangé


# ======================================================================================
# A1.3 — uploads
# ======================================================================================
def up(w, who, data, ctype="image/png", name="a.png"):
    return w.post(f"{API}/owner/uploads", files={"file": (name, io.BytesIO(data), ctype)}, headers=H(w, who))


def _disk_files():
    root = owner_router.UPLOAD_ROOT / "restaurant"
    return set(os.listdir(root)) if root.exists() else set()


def _blobs():
    with Session(engine) as s:
        return len(s.exec(select(UploadBlob)).all())


@pytest.mark.parametrize("fmt,ctype,ext", [("PNG", "image/png", ".png"), ("JPEG", "image/jpeg", ".jpg"), ("WEBP", "image/webp", ".webp")])
def test_a13_valid_images_accepted(w, fmt, ctype, ext):
    r = up(w, "owner", img(fmt), ctype)
    assert r.status_code == 200 and r.json()["path"].endswith(ext)


def test_a13_extension_comes_from_real_format_not_declared_type(w):
    r = up(w, "owner", img("PNG"), "image/jpeg", "x.jpg")
    assert r.status_code == 200 and r.json()["path"].endswith(".png")


@pytest.mark.parametrize("label,data,ctype", [
    ("texte renommé .jpg", b"ceci n'est pas une image du tout", "image/jpeg"),
    ("faux WebP (en-tête RIFF seul)", b"RIFF\x24\x00\x00\x00WAVEfmt " + b"0" * 40, "image/webp"),
    ("RIFF + WEBP mais vide", b"RIFF\x04\x00\x00\x00WEBP", "image/webp"),
    ("PNG tronqué", img("PNG", (64, 64))[:80], "image/png"),
    ("JPEG tronqué", img("JPEG", (64, 64))[:60], "image/jpeg"),
    ("en-tête PNG puis du bruit", b"\x89PNG\r\n\x1a\n" + b"0" * 64, "image/png"),
    ("SVG", b"<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>", "image/png"),
    ("vide", b"", "image/png"),
])
def test_a13_invalid_content_rejected_and_leaves_no_orphan(w, label, data, ctype):
    disk, blobs = _disk_files(), _blobs()
    r = up(w, "owner", data, ctype)
    assert r.status_code == 400, (label, r.status_code, r.text)
    assert _disk_files() == disk and _blobs() == blobs, f"orphelin laissé après refus : {label}"


def test_a13_unsupported_declared_type_rejected(w):
    assert up(w, "owner", img("PNG"), "application/pdf", "a.pdf").status_code == 400


def test_a13_animated_image_rejected(w):
    from PIL import Image
    buf = io.BytesIO()
    frames = [Image.new("RGB", (8, 8), c) for c in ((255, 0, 0), (0, 255, 0))]
    frames[0].save(buf, "WEBP", save_all=True, append_images=frames[1:], duration=100)
    assert up(w, "owner", buf.getvalue(), "image/webp").status_code == 400


def test_a13_too_large_file_rejected(w, monkeypatch):
    monkeypatch.setattr(L, "UPLOAD_MAX_BYTES", 40)  # toute image valide pèse davantage
    disk, blobs = _disk_files(), _blobs()
    data = img("PNG", (32, 32))
    assert len(data) > 40
    assert up(w, "owner", data).status_code == 400
    assert _disk_files() == disk and _blobs() == blobs


def test_a13_dimensions_over_limit_rejected(w, monkeypatch):
    monkeypatch.setattr(L, "UPLOAD_MAX_SIDE", 50)
    disk = _disk_files()
    assert up(w, "owner", img("PNG", (51, 10))).status_code == 400
    assert up(w, "owner", img("PNG", (50, 50))).status_code == 200
    monkeypatch.setattr(L, "UPLOAD_MAX_PIXELS", 1000)
    assert up(w, "owner", img("PNG", (40, 40))).status_code == 400  # 1600 px > 1000
    assert len(_disk_files() - disk) == 1


def png_header_only(width, height):
    """PNG minimal dont l'en-tête DÉCLARE width×height mais qui ne contient aucun pixel : quelques dizaines d'octets,
    aucune allocation mémoire (ni ici, ni dans Pillow qui refuse sur l'en-tête)."""
    import struct
    import zlib

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"")) + chunk(b"IEND", b"")


@pytest.mark.parametrize("width,height", [(30000, 30000), (10000, 10000)])  # ≈ 900 Mpx (erreur Pillow) / 100 Mpx (avertissement Pillow)
def test_a13_decompression_bomb_rejected(w, monkeypatch, width, height):
    # limites applicatives volontairement relevées pour exercer la protection de Pillow elle-même
    monkeypatch.setattr(L, "UPLOAD_MAX_SIDE", 100000)
    monkeypatch.setattr(L, "UPLOAD_MAX_PIXELS", 10**12)
    data = png_header_only(width, height)
    assert len(data) < 200
    disk, blobs = _disk_files(), _blobs()
    r = up(w, "owner", data)
    assert r.status_code == 400, r.text
    assert _disk_files() == disk and _blobs() == blobs


def test_a13_access_control(w):
    assert w.post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(img()), "image/png")}).status_code == 401  # anonyme
    assert up(w, "stranger", img()).status_code == 403   # aucun module restaurant
    assert up(w, "nomod", img()).status_code == 403      # module désactivé
    assert up(w, "owner", img()).status_code == 200      # module actif


def test_a13_quota_count_and_volume(w, monkeypatch):
    with Session(engine) as s0:
        n0, _ = imgcheck.usage(s0, w.users["owner"])
    monkeypatch.setattr(L, "UPLOAD_MAX_FILES", n0 + 2)
    assert up(w, "owner", img()).status_code == 200
    assert up(w, "owner", img()).status_code == 200
    disk, blobs = _disk_files(), _blobs()
    r = up(w, "owner", img())
    assert r.status_code == 409 and "Limite" in r.json()["detail"]
    assert _disk_files() == disk and _blobs() == blobs
    # un autre compte n'est pas pénalisé
    with Session(engine) as s:
        s.add(PartnerModule(user_id=w.users["g3"], module="restaurant"))
        s.commit()
    assert up(w, "g3", img()).status_code == 200
    monkeypatch.setattr(L, "UPLOAD_MAX_FILES", 10_000)
    with Session(engine) as s0:
        _, total = imgcheck.usage(s0, w.users["owner"])
    monkeypatch.setattr(L, "UPLOAD_MAX_TOTAL_BYTES", total + 10)
    assert up(w, "owner", img("PNG", (64, 64))).status_code == 409


def _consistency():
    with Session(engine) as s0:
        return imgcheck.check_consistency(owner_router.UPLOAD_ROOT, s0)


def _fixed_names(monkeypatch, hexes):
    """Force les noms tirés par uuid4 (pour provoquer des collisions de façon déterministe)."""
    import uuid as _u
    it = iter(hexes)
    monkeypatch.setattr(imgcheck.uuid, "uuid4", lambda: _u.UUID(next(it).ljust(32, "0")))


def test_a13_storage_failure_after_file_creation_leaves_no_orphan(w, monkeypatch):
    """Si l'enregistrement échoue APRÈS la création du fichier disque, ce fichier (créé par cette requête) est retiré."""
    def boom(self, *a, **k):
        raise RuntimeError("base indisponible")
    disk, blobs = _disk_files(), _blobs()
    with monkeypatch.context() as m:  # contexte : ne défait PAS les réglages de l'autouse `_limits`
        m.setattr(Session, "commit", boom)
        r = up(w, "owner", img())
    assert r.status_code == 503
    assert _disk_files() == disk and _blobs() == blobs
    assert _consistency()["disk_only"] == []


def test_a13_preexisting_file_is_never_overwritten_nor_deleted(w, monkeypatch):
    """Collision de nom sur disque : le fichier préexistant reste intact (ni écrasé, ni supprimé), un autre nom est utilisé."""
    uid = w.users["owner"]
    root = owner_router.UPLOAD_ROOT / "restaurant"
    root.mkdir(parents=True, exist_ok=True)
    pre = root / f"{uid}-aaaaaaaaaaaa.png"
    pre.write_bytes(b"FICHIER-PREEXISTANT")
    try:
        with monkeypatch.context() as m:
            _fixed_names(m, ["aaaaaaaaaaaa", "bbbbbbbbbbbb"])
            r = up(w, "owner", img())
        assert r.status_code == 200 and r.json()["path"] == f"restaurant/{uid}-bbbbbbbbbbbb.png"
        assert pre.read_bytes() == b"FICHIER-PREEXISTANT"                      # intact
        # même scénario mais l'enregistrement échoue : le préexistant survit, seul NOTRE fichier est retiré
        disk = _disk_files()
        with monkeypatch.context() as m:
            _fixed_names(m, ["aaaaaaaaaaaa", "cccccccccccc"])
            m.setattr(Session, "commit", lambda self, *a, **k: (_ for _ in ()).throw(RuntimeError("panne")))
            r = up(w, "owner", img())
        assert r.status_code == 503 and pre.read_bytes() == b"FICHIER-PREEXISTANT"
        assert _disk_files() == disk and f"{uid}-cccccccccccc.png" not in _disk_files()
    finally:
        pre.unlink(missing_ok=True)  # uniquement ce fichier, créé par ce test


def test_a13_preexisting_blob_in_database_is_never_overwritten(w, monkeypatch):
    uid = w.users["owner"]
    path = f"restaurant/{uid}-dddddddddddd.png"
    with Session(engine) as s0:
        s0.add(UploadBlob(path=path, content_type="image/png", data=b"BLOB-PREEXISTANT"))
        s0.commit()
    try:
        with monkeypatch.context() as m:
            _fixed_names(m, ["dddddddddddd", "eeeeeeeeeeee"])
            r = up(w, "owner", img())
        assert r.status_code == 200 and r.json()["path"].endswith("eeeeeeeeeeee.png")
        with Session(engine) as s0:
            assert s0.get(UploadBlob, path).data == b"BLOB-PREEXISTANT"          # non écrasé
        assert not (owner_router.UPLOAD_ROOT / path).exists()                    # aucun fichier créé à sa place
    finally:
        with Session(engine) as s0:  # uniquement ce que ce test a créé
            b = s0.get(UploadBlob, path)
            if b:
                s0.delete(b)
                s0.commit()


def test_a13_no_free_name_gives_503_and_touches_nothing(w, monkeypatch):
    uid = w.users["owner"]
    root = owner_router.UPLOAD_ROOT / "restaurant"
    root.mkdir(parents=True, exist_ok=True)
    names = [f"{i:012x}" for i in range(0x1000, 0x1008)]
    made = []
    try:
        for n in names:
            f = root / f"{uid}-{n}.png"
            f.write_bytes(b"PRE-" + n.encode())
            made.append(f)
        blobs = _blobs()
        with monkeypatch.context() as m:
            _fixed_names(m, names)
            r = up(w, "owner", img())
        assert r.status_code == 503 and _blobs() == blobs
        assert all(f.read_bytes() == b"PRE-" + f.stem.split("-")[1].encode() for f in made)  # aucun fichier préexistant touché
    finally:
        for f in made:
            f.unlink(missing_ok=True)


def test_a13_concurrent_uploads_cannot_exceed_the_file_quota(w, monkeypatch):
    with Session(engine) as s0:
        n0, _ = imgcheck.usage(s0, w.users["owner"])
    monkeypatch.setattr(L, "UPLOAD_MAX_FILES", n0 + 3)
    disk0, blobs0 = _disk_files(), _blobs()
    data = img()
    codes = sorted(run_parallel([lambda: TestClient(app).post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(data), "image/png")}, headers=H(w, "owner")).status_code for _ in range(10)], timeout=90))
    assert codes == [200] * 3 + [409] * 7, codes                  # exactement la place restante, jamais plus
    assert _blobs() == blobs0 + 3 and len(_disk_files() - disk0) == 3
    c = _consistency()
    assert c["disk_only"] == [] and c["mismatch"] == []


def test_a13_concurrent_uploads_cannot_exceed_the_volume_quota(w, monkeypatch):
    monkeypatch.setattr(L, "UPLOAD_MAX_FILES", 10_000)
    data = img("PNG", (40, 40))
    with Session(engine) as s0:
        _, total = imgcheck.usage(s0, w.users["owner"])
    monkeypatch.setattr(L, "UPLOAD_MAX_TOTAL_BYTES", total + int(len(data) * 2.5))  # place pour 2 images, pas 3
    blobs0 = _blobs()
    codes = sorted(run_parallel([lambda: TestClient(app).post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(data), "image/png")}, headers=H(w, "owner")).status_code for _ in range(8)], timeout=90))
    assert codes == [200] * 2 + [409] * 6, codes
    assert _blobs() == blobs0 + 2


def test_a13_disk_and_database_stay_consistent_after_all_of_the_above(w):
    """Aucun orphelin disque, aucun contenu divergent entre le fichier et la copie en base."""
    c = _consistency()
    assert c["disk_only"] == [] and c["mismatch"] == [], c


# ======================================================================================
# A1.4 — rate limiting
# ======================================================================================
def test_a14_normal_request_allowed_then_429(w, monkeypatch):
    rid, _ = mk(w, "A1.4 Débit")
    monkeypatch.setattr(L, "RATE_RESERVE", "2/minute")
    L.limiter.reset()
    codes = [book(w, "g1", rid, d, "12:00").status_code for d in distinct_days(3, 20)]
    assert codes[:2] == [201, 201] and codes[2] == 429, codes


def test_a14_distinct_users_do_not_block_each_other(w, monkeypatch):
    rid, _ = mk(w, "A1.4 Distincts")
    monkeypatch.setattr(L, "RATE_RESERVE", "1/minute")
    L.limiter.reset()
    d1, d2 = distinct_days(2, 30)
    assert book(w, "g1", rid, d1, "12:00").status_code == 201
    assert book(w, "g1", rid, d2, "12:00").status_code == 429            # g1 est limité…
    assert book(w, "g2", rid, d1, "15:00").status_code == 201            # … pas g2, même « IP » de test
    assert book(w, "g3", rid, d1, "20:00").status_code == 201


def test_a14_categories_are_independent_and_configurable(w, monkeypatch):
    rid, _ = mk(w, "A1.4 Catégories")
    monkeypatch.setattr(L, "RATE_RESERVE", "1/minute")
    monkeypatch.setattr(L, "RATE_UPLOAD", "2/minute")
    L.limiter.reset()
    d1, d2 = distinct_days(2, 40)
    assert book(w, "g1", rid, d1, "12:00").status_code == 201
    assert book(w, "g1", rid, d2, "12:00").status_code == 429
    assert up(w, "owner", img()).status_code == 200                      # l'upload a son propre compteur
    assert up(w, "owner", img()).status_code == 200
    assert up(w, "owner", img()).status_code == 429
    assert w.get(f"{API}/search").status_code == 200                      # lecture publique non affectée


def test_a14_review_and_cancel_limited(w, monkeypatch):
    monkeypatch.setattr(L, "RATE_CANCEL", "1/minute")
    monkeypatch.setattr(L, "RATE_REVIEW", "1/minute")
    L.limiter.reset()
    h = H(w, "g1")
    assert w.post(f"{API}/me/reservations/NOPE1/cancel", headers=h).status_code == 404
    assert w.post(f"{API}/me/reservations/NOPE2/cancel", headers=h).status_code == 429
    assert w.post(f"{API}/me/reservations/NOPE1/review", json={"rating": 5, "comment": "x"}, headers=h).status_code == 404
    assert w.post(f"{API}/me/reservations/NOPE2/review", json={"rating": 5, "comment": "x"}, headers=h).status_code == 429


def test_a14_anonymous_browse_limited_by_ip(w, monkeypatch):
    monkeypatch.setattr(L, "RATE_BROWSE", "3/minute")
    L.limiter.reset()
    assert [w.get(f"{API}/search").status_code for _ in range(4)] == [200, 200, 200, 429]


def test_a14_storage_backend_unavailable_falls_back_to_memory(monkeypatch):
    """Redis injoignable : pas d'erreur 500, la limitation continue en mémoire."""
    from app.config import settings
    from slowapi.errors import RateLimitExceeded
    from slowapi import _rate_limit_exceeded_handler
    monkeypatch.setattr(settings, "redis_url", "redis://127.0.0.1:1/0")
    lim = L._build_limiter()
    mini = FastAPI()
    mini.state.limiter = lim
    mini.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @mini.get("/ping")
    @lim.limit("2/minute")
    def ping(request: Request):
        return {"ok": True}

    with TestClient(mini) as c:
        assert [c.get("/ping").status_code for _ in range(3)] == [200, 200, 429]


def test_a14_limit_cannot_be_bypassed_by_changing_the_path_parameter(w, monkeypatch):
    """Régression : avec un compteur par URL, chaque `code` de réservation aurait eu son propre compteur."""
    monkeypatch.setattr(L, "RATE_CANCEL", "2/minute")
    L.limiter.reset()
    h = H(w, "g1")
    codes = [w.post(f"{API}/me/reservations/BYPASS{i}/cancel", headers=h).status_code for i in range(5)]
    assert codes == [404, 404, 429, 429, 429], codes
