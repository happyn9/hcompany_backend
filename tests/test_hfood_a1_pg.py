"""HFood — Phase A1.1 sur un VRAI PostgreSQL : concurrence réelle (threads) + contrainte d'exclusion.

Test DESTRUCTIF PROTÉGÉ (voir tests/pg_safety.py) : il crée puis supprime son propre schéma `hfood_a1_<hex>` et ne
touche ni à `public` ni aux autres schémas. Il ne s'exécute que si TOUTES les conditions sont réunies, sinon il ÉCHOUE :
    HFOOD_TEST_PG_URL=postgresql://postgres@127.0.0.1:54331/hfood_test_a1 \
    HFOOD_TEST_PG_CONFIRM=detruire-schema-test:hfood_test_a1 \
    python -m pytest tests/test_hfood_a1_pg.py -q
(base nommée hfood_test_*, hôte local, différente de DATABASE_URL, hôte de production refusé).
Sans HFOOD_TEST_PG_URL, le fichier est simplement ignoré. Il doit tourner dans son propre processus (cf. run_tests.sh)."""
import os
import subprocess
import sys

import pytest

import atexit
import shutil
import tempfile

from tests import pg_safety as safety
from tests.threads_util import run_parallel

PG = os.environ.get(safety.ENV_URL, "").strip()
if not PG:
    pytest.skip("HFOOD_TEST_PG_URL non défini : test PostgreSQL non exécuté", allow_module_level=True)

# --- Garde-fous : toute violation lève une erreur (échec sûr) AVANT la moindre connexion ---------------------------
_ENV_BEFORE = dict(os.environ)
_RESTORE = safety.EnvRestore("DATABASE_URL", "ENVIRONMENT")
atexit.register(_RESTORE.restore)  # filet de sécurité si la fixture ne s'exécute/finalise pas
TARGET = safety.check_test_url(PG, environ=_ENV_BEFORE)
safety.require_confirmation(TARGET, environ=_ENV_BEFORE)
SCHEMA = safety.new_schema_name()
os.environ["DATABASE_URL"] = safety.scoped_url(TARGET, SCHEMA)  # search_path forcé sur le schéma de test
os.environ.setdefault("ENVIRONMENT", "development")

import sqlalchemy as sa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerModule, User, UserRole  # noqa: E402
from app.restaurant import limits as L, services as svc  # noqa: E402
from app.restaurant.models import Reservation  # noqa: E402
from app.restaurant.routers import owner as owner_router  # noqa: E402
from app.services.rate_limit import limiter as shared_limiter  # noqa: E402
from app.restaurant import images as imgcheck  # noqa: E402
from tests.test_hfood_a1 import API, PW, H, book, day, img, mk  # noqa: E402

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 8  # demandes simultanées
_UNIQ = SCHEMA.rsplit("_", 1)[1]
SENTINEL_SCHEMA = f"hfood_sentinel_{_UNIQ}"        # noms UNIQUES par exécution : ne peuvent viser aucun objet préexistant
SENTINEL_PUBLIC = f"hfood_sentinel_{_UNIQ}_pub"


def _others(cx):
    """Tables de tous les schémas SAUF le schéma de test (pour prouver l'absence d'effet)."""
    return sorted(cx.execute(sa.text(
        "SELECT table_schema || '.' || table_name FROM information_schema.tables "
        "WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema <> :s"), {"s": SCHEMA}).scalars().all())


def _exec(sql):
    with engine.begin() as cx:
        cx.execute(sa.text(sql))


@pytest.fixture(scope="module")
def w():
    assert engine.dialect.name == "postgresql"
    made = {"sent_schema": False, "sent_table": False, "schema": False}  # SEULS les objets réellement créés par ce test
    before = None
    problems = []
    mp = pytest.MonkeyPatch()
    uploads = None
    try:
        with engine.connect() as cx:
            assert cx.execute(sa.text("SELECT current_database()")).scalar() == TARGET.database
        # Sentinelles (noms uniques, sans IF NOT EXISTS) dans `public` et dans un autre schéma : doivent survivre intactes.
        with engine.begin() as cx:
            cx.execute(sa.text(f"CREATE SCHEMA {SENTINEL_SCHEMA}"))
            made["sent_schema"] = True
            cx.execute(sa.text(f"CREATE TABLE {SENTINEL_SCHEMA}.t (v int)"))
            cx.execute(sa.text(f"INSERT INTO {SENTINEL_SCHEMA}.t VALUES (1)"))
        with engine.begin() as cx:
            cx.execute(sa.text(f"CREATE TABLE public.{SENTINEL_PUBLIC} (v int)"))
            made["sent_table"] = True
            cx.execute(sa.text(f"INSERT INTO public.{SENTINEL_PUBLIC} VALUES (2)"))
        with engine.connect() as cx:
            before = _others(cx)
        safety.create_schema(engine, SCHEMA)
        made["schema"] = True
        r = subprocess.run([sys.executable, "-B", "-m", "alembic", "upgrade", "heads"], cwd=BACKEND, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, capture_output=True, text=True)
        assert r.returncode == 0, r.stderr[-2000:]
        # réglages globaux du module : TOUS restaurés au teardown (mp.undo)
        mp.setattr(shared_limiter, "enabled", False)
        mp.setattr(L.limiter, "enabled", False)
        mp.setattr(owner_router, "MAX_RESTAURANTS", 1000)
        mp.setattr(svc, "MAX_ACTIVE_PER_USER", 10_000)
        uploads = tempfile.mkdtemp(prefix="hfood_a1_pg_uploads_")  # jamais le vrai dossier `uploads/` du projet
        os.makedirs(os.path.join(uploads, "restaurant"))
        mp.setattr(owner_router, "UPLOAD_ROOT", __import__("pathlib").Path(uploads))
        keys = ["boss", "owner"] + [f"u{i}" for i in range(N)]
        with TestClient(app) as client:
            for k in keys:
                assert client.post("/api/v1/auth/register", json={"email": f"{k}@pg.example.com", "password": PW, "full_name": f"{k} Test"}).status_code in (200, 201)
            users = {}
            with Session(engine) as s:
                for k in keys:
                    u = s.exec(select(User).where(User.email == f"{k}@pg.example.com")).one()
                    u.is_verified = True
                    if k == "boss":
                        u.role = UserRole.admin
                    s.add(u)
                    s.commit()
                    users[k] = u.id
                s.add(PartnerModule(user_id=users["owner"], module="restaurant"))
                s.commit()
            tokens = {k: client.post("/api/v1/auth/login", json={"email": f"{k}@pg.example.com", "password": PW}).json()["access_token"] for k in keys}
            client.cookies.clear()
            client.users, client.tokens, client.others_before = users, tokens, before
            yield client
    finally:
        # Nettoyage INDÉPENDANT de l'endroit où l'initialisation a échoué ; chaque étape est protégée, les problèmes sont remontés à la fin.
        def step(label, fn):
            try:
                fn()
            except BaseException as exc:  # noqa: BLE001
                problems.append(f"{label}: {type(exc).__name__}: {exc}")

        if made["schema"]:
            step("drop schéma de test", lambda: safety.drop_schema(engine, SCHEMA))  # uniquement NOTRE schéma (motif strict)

        def verify():
            with engine.connect() as cx:
                assert _others(cx) == before, "un autre schéma a été modifié"
                assert cx.execute(sa.text(f"SELECT v FROM {SENTINEL_SCHEMA}.t")).scalar() == 1
                assert cx.execute(sa.text(f"SELECT v FROM public.{SENTINEL_PUBLIC}")).scalar() == 2
                assert cx.execute(sa.text("SELECT count(*) FROM information_schema.schemata WHERE schema_name = :s"), {"s": SCHEMA}).scalar() == 0

        if before is not None and made["schema"] and made["sent_schema"] and made["sent_table"]:
            step("vérification des autres schémas", verify)
        if made["sent_table"]:
            step("drop sentinelle public", lambda: _exec(f"DROP TABLE IF EXISTS public.{SENTINEL_PUBLIC}"))
        if made["sent_schema"]:
            step("drop schéma sentinelle", lambda: _exec(f"DROP SCHEMA IF EXISTS {SENTINEL_SCHEMA} CASCADE"))
        mp.undo()  # limiteurs, plafonds et dossier d'uploads remis dans leur état d'origine
        if uploads:
            shutil.rmtree(uploads, ignore_errors=True)
        step("dispose", engine.dispose)
        _RESTORE.restore()  # variables d'environnement remises dans leur état d'origine
        if problems:
            raise AssertionError("; ".join(problems))


def test_pg_schema_isolation_and_target(w):
    """Tout vit dans le schéma de test ; `public` et les autres schémas sont inchangés ; base = base de test."""
    with engine.connect() as cx:
        assert cx.execute(sa.text("SELECT current_schema()")).scalar() == SCHEMA
        assert cx.execute(sa.text("SELECT current_database()")).scalar() == TARGET.database
        assert cx.execute(sa.text("SELECT count(*) FROM information_schema.tables WHERE table_schema = :s AND table_name = 'reservation'"), {"s": SCHEMA}).scalar() == 1
        assert _others(cx) == w.others_before
        assert cx.execute(sa.text("SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'public'")).scalar() == 1


def _dates(n, start=3):
    """n dates futures DISTINCTES (day() saute le dimanche par prudence ; les restaurants de test ne ferment aucun jour)."""
    out, off = [], start
    while len(out) < n:
        d = day(off)
        if d not in out:
            out.append(d)
        off += 1
    return out


def _post_reservation(w, k, rid, d, time, name="Course"):
    return TestClient(app).post(f"{API}/reservations", json={"restaurant_id": rid, "day": d.isoformat(), "time": time, "party_size": 2, "name": name}, headers={"Authorization": f"Bearer {w.tokens[k]}"}).status_code


def _race(w, rid, d, time, who):
    """N demandes lancées EN MÊME TEMPS (barrière, délai maximal, erreurs de threads capturées) ; codes HTTP triés."""
    return sorted(run_parallel([lambda k=k: _post_reservation(w, k, rid, d, time) for k in who], timeout=90))


def _blocking(rid, d):
    with Session(engine) as s:
        return len(s.exec(select(Reservation).where(Reservation.restaurant_id == rid, Reservation.day == d, Reservation.status.in_(("pending", "confirmed", "seated")))).all())


def test_pg_constraint_installed_by_migration(w):
    with engine.connect() as cx:
        rows = cx.execute(sa.text("SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.conname = 'reservation_no_table_overlap' AND n.nspname = :s"), {"s": SCHEMA}).scalars().all()
    assert len(rows) == 1 and "EXCLUDE USING gist" in rows[0]  # filtrée sur NOTRE schéma (aucune confusion avec d'autres schémas)


def test_pg_concurrent_same_table_same_slot_single_winner(w):
    """Critère d'acceptation : N demandes simultanées sur la même table et le même créneau → exactement 1 réservation."""
    rid, _ = mk(w, "PG Course")
    users = [f"u{i}" for i in range(N)]
    for rnd, d in enumerate(_dates(5, 3)):  # plusieurs manches pour multiplier les entrelacements
        codes = _race(w, rid, d, "19:00", users)
        assert codes.count(201) == 1, (rnd, codes)
        assert set(codes) <= {201, 409}, (rnd, codes)  # jamais de 500
        assert _blocking(rid, d) == 1


def test_pg_database_alone_prevents_double_booking(w, monkeypatch):
    """Même SANS verrou ni vérification applicatifs, la base refuse le 2e : les perdants reçoivent 409 (IntegrityError traduite)."""
    monkeypatch.setattr(svc, "lock_restaurant", lambda session, r: None)
    monkeypatch.setattr(svc, "table_conflict", lambda session, x: False)
    rid, _ = mk(w, "PG Base seule")
    users = [f"u{i}" for i in range(N)]
    wins = 0
    for rnd, d in enumerate(_dates(5, 12)):
        codes = _race(w, rid, d, "20:00", users)
        assert set(codes) <= {201, 409}, codes
        assert _blocking(rid, d) == 1 and codes.count(201) == 1, (rnd, codes)
        wins += 1
    assert wins == 5


def test_pg_two_tables_two_winners_and_distinct_slots_all_succeed(w):
    rid, _ = mk(w, "PG Deux tables", tables=[{"label": "T1", "seats": 4, "x": 2, "z": 2}, {"label": "T2", "seats": 4, "x": 5, "z": 2}])
    d = day(20)
    codes = _race(w, rid, d, "19:00", [f"u{i}" for i in range(4)])
    assert codes.count(201) == 2 and codes.count(409) == 2, codes
    rid2, _ = mk(w, "PG Créneaux")
    d2 = day(21)
    out = run_parallel([lambda k=f"u{i}", t=t: _post_reservation(w, k, rid2, d2, t, "Créneau") for i, t in enumerate(("12:00", "15:00", "19:00"))], timeout=90)
    assert sorted(out) == [201, 201, 201], out


def test_pg_constraint_semantics_when_bypassing_the_application(w):
    """Insertions SQL directes : chevauchement refusé ; contigu, autre table, non-bloquant, ancienne ligne sans plage : acceptés."""
    rid, _ = mk(w, "PG SQL direct", tables=[{"label": "T1", "seats": 4, "x": 2, "z": 2}, {"label": "T2", "seats": 4, "x": 5, "z": 2}])
    with Session(engine) as s:
        from app.restaurant.models import DiningTable
        t1, t2 = [t.id for t in s.exec(select(DiningTable).where(DiningTable.restaurant_id == rid).order_by(DiningTable.id)).all()]
    d = day(30)
    from datetime import datetime, timedelta

    def ins(code, table, hh, mm, status="pending", with_range=True, dur=90):
        start = datetime(d.year, d.month, d.day, hh, mm)
        with engine.begin() as cx:
            cx.execute(sa.text(
                "INSERT INTO reservation (code,restaurant_id,table_id,user_id,name,phone,party_size,day,time,duration_minutes,start_at,end_at,status,note,preorder,preorder_total,restaurant_name,table_label,created_at,updated_at) "
                "VALUES (:c,:r,:t,:u,'Aa','',2,:d,:tm,:du,:s,:e,:st,'','[]',0,'R','T',now(),now())"),
                {"c": code, "r": rid, "t": table, "u": w.users["u0"], "d": d, "tm": f"{hh:02d}:{mm:02d}", "du": dur, "s": start if with_range else None,
                 "e": (start + timedelta(minutes=dur)) if with_range else None, "st": status})

    ins("SQL-1", t1, 19, 0)
    with pytest.raises(IntegrityError) as e:
        ins("SQL-2", t1, 20, 0)  # 20:00 < 20:30 : chevauche
    assert "reservation_no_table_overlap" in str(e.value)
    with pytest.raises(IntegrityError):
        ins("SQL-2b", t1, 18, 0)  # 18:00-19:30 chevauche 19:00
    ins("SQL-3", t1, 20, 30)                         # contigu : fin exclusive
    ins("SQL-4", t2, 19, 0)                          # autre table
    for i, st in enumerate(("cancelled", "declined", "completed", "no_show")):
        ins(f"SQL-5{i}", t1, 19, 0, status=st)       # statuts non bloquants : ne comptent pas
    ins("SQL-6", t1, 19, 0, with_range=False)        # ancienne ligne sans plage : hors contrainte


def test_pg_constraint_covers_overlap_across_midnight(w):
    """Une réservation 23:30→01:00 et une autre le lendemain à 00:30 se chevauchent : seule la contrainte PostgreSQL
    (plages datetime) le voit — la vérification applicative, elle, compare des heures d'une même journée."""
    from datetime import datetime, timedelta
    rid, _ = mk(w, "PG Minuit")
    with Session(engine) as s:
        from app.restaurant.models import DiningTable
        t1 = s.exec(select(DiningTable).where(DiningTable.restaurant_id == rid)).first().id
    d = day(50)

    def ins(code, dd, hh, mm, dur=90):
        st = datetime(dd.year, dd.month, dd.day, hh, mm)
        with engine.begin() as cx:
            cx.execute(sa.text(
                "INSERT INTO reservation (code,restaurant_id,table_id,user_id,name,phone,party_size,day,time,duration_minutes,start_at,end_at,status,note,preorder,preorder_total,restaurant_name,table_label,created_at,updated_at) "
                "VALUES (:c,:r,:t,:u,'Aa','',2,:d,:tm,:du,:s,:e,'confirmed','','[]',0,'R','T',now(),now())"),
                {"c": code, "r": rid, "t": t1, "u": w.users["u0"], "d": dd, "tm": f"{hh:02d}:{mm:02d}", "du": dur, "s": st, "e": st + timedelta(minutes=dur)})

    ins("MID-1", d, 23, 30)
    with pytest.raises(IntegrityError, match="reservation_no_table_overlap"):
        ins("MID-2", d + timedelta(days=1), 0, 30)   # 00:30 le lendemain : dans 23:30→01:00
    ins("MID-3", d + timedelta(days=1), 1, 0)         # 01:00 : contigu (fin exclusive)


def test_pg_cancel_frees_the_slot_for_a_new_booking(w):
    rid, _ = mk(w, "PG Annulation")
    d = day(40)
    a = book(w, "u0", rid, d)
    assert a.status_code == 201
    assert book(w, "u1", rid, d).status_code == 409
    assert w.post(f"{API}/me/reservations/{a.json()['code']}/cancel", headers=H(w, "u0")).status_code == 200
    assert book(w, "u1", rid, d).status_code == 201


def _upload(w, data):
    import io
    return TestClient(app).post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(data), "image/png")}, headers=H(w, "owner")).status_code


def _uploads_state(w):
    with Session(engine) as s0:
        n, _ = imgcheck.usage(s0, w.users["owner"])
        return n, imgcheck.check_consistency(owner_router.UPLOAD_ROOT, s0)


def test_pg_concurrent_uploads_cannot_exceed_quota_and_stay_consistent(w, monkeypatch):
    """Verrou consultatif PostgreSQL : 10 envois simultanés d'un même compte, place pour 3 → exactement 3 acceptés, 7 refusés (409)."""
    n0, _ = _uploads_state(w)
    monkeypatch.setattr(L, "UPLOAD_MAX_FILES", n0 + 3)
    data = img()
    for rnd in range(3):  # plusieurs manches (le quota se libère en le relevant entre deux)
        monkeypatch.setattr(L, "UPLOAD_MAX_FILES", n0 + 3 * (rnd + 1))
        codes = sorted(run_parallel([lambda: _upload(w, data) for _ in range(10)], timeout=120))
        assert codes == [200] * 3 + [409] * 7, (rnd, codes)
        n, cons = _uploads_state(w)
        assert n == n0 + 3 * (rnd + 1)
        assert cons["disk_only"] == [] and cons["mismatch"] == [], cons


def test_pg_concurrent_uploads_volume_quota(w, monkeypatch):
    monkeypatch.setattr(L, "UPLOAD_MAX_FILES", 10_000)
    data = img("PNG", (40, 40))
    with Session(engine) as s0:
        _, total = imgcheck.usage(s0, w.users["owner"])
    monkeypatch.setattr(L, "UPLOAD_MAX_TOTAL_BYTES", total + int(len(data) * 2.5))
    codes = sorted(run_parallel([lambda: _upload(w, data) for _ in range(8)], timeout=120))
    assert codes == [200] * 2 + [409] * 6, codes
