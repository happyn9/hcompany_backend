"""HFood — Phase C2 sur un VRAI PostgreSQL : checkout idempotent sous concurrence, décisions vendeur concurrentes.

Test DESTRUCTIF PROTÉGÉ (voir tests/pg_safety.py) : il crée puis supprime son propre schéma `hfood_a1_<hex>` (même motif
sûr que les tests A1) et ne touche à aucun autre schéma. Il ne s'exécute que si HFOOD_TEST_PG_URL et
HFOOD_TEST_PG_CONFIRM sont définis (base `hfood_test_*`, hôte local, différente de DATABASE_URL) ; sinon il est ignoré.
Il doit tourner dans son propre processus."""
import atexit
import os
import shutil
import subprocess
import sys
import tempfile

import pytest

from tests import pg_safety as safety
from tests.threads_util import run_parallel

PG = os.environ.get(safety.ENV_URL, "").strip()
if not PG:
    pytest.skip("HFOOD_TEST_PG_URL non défini : test PostgreSQL non exécuté", allow_module_level=True)

_ENV_BEFORE = dict(os.environ)
_RESTORE = safety.EnvRestore("DATABASE_URL", "ENVIRONMENT")
atexit.register(_RESTORE.restore)
TARGET = safety.check_test_url(PG, environ=_ENV_BEFORE)
safety.require_confirmation(TARGET, environ=_ENV_BEFORE)
SCHEMA = safety.new_schema_name()
os.environ["DATABASE_URL"] = safety.scoped_url(TARGET, SCHEMA)
os.environ.setdefault("ENVIRONMENT", "development")

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PartnerModule, User, UserRole  # noqa: E402
from app.restaurant import limits as L, services as svc  # noqa: E402
from app.restaurant.models import FoodOrder, FoodSubOrder  # noqa: E402
from app.restaurant.routers import owner as owner_router  # noqa: E402
from app.services.rate_limit import limiter as shared_limiter  # noqa: E402
from tests.c2_util import API, PW, H, checkout, key, live_as, vend  # noqa: E402

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 8


@pytest.fixture(scope="module")
def w():
    mp = pytest.MonkeyPatch()
    made, uploads = False, None
    try:
        safety.create_schema(engine, SCHEMA)
        made = True
        r = subprocess.run([sys.executable, "-B", "-m", "alembic", "upgrade", "heads"], cwd=BACKEND, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, capture_output=True, text=True)
        assert r.returncode == 0, r.stderr[-2000:]
        mp.setattr(shared_limiter, "enabled", False)
        mp.setattr(L.limiter, "enabled", False)
        mp.setattr(owner_router, "MAX_RESTAURANTS", 1000)
        mp.setattr(L, "ORDER_MAX_ACTIVE", 10_000)
        uploads = tempfile.mkdtemp(prefix="hfood_c2_pg_uploads_")
        os.makedirs(os.path.join(uploads, "restaurant"))
        mp.setattr(owner_router, "UPLOAD_ROOT", __import__("pathlib").Path(uploads))
        keys = ["boss", "owner", "other", "g1"]
        with TestClient(app) as client:
            for k in keys:
                assert client.post("/api/v1/auth/register", json={"email": f"{k}@c2pg.example.com", "password": PW, "full_name": f"{k} Test"}).status_code in (200, 201)
            users = {}
            with Session(engine) as s:
                for k in keys:
                    u = s.exec(select(User).where(User.email == f"{k}@c2pg.example.com")).one()
                    u.is_verified = True
                    if k == "boss":
                        u.role = UserRole.admin
                    s.add(u)
                    s.commit()
                    users[k] = u.id
                for k in ("owner", "other"):
                    s.add(PartnerModule(user_id=users[k], module="restaurant"))
                s.commit()
            tokens = {k: client.post("/api/v1/auth/login", json={"email": f"{k}@c2pg.example.com", "password": PW}).json()["access_token"] for k in keys}
            client.cookies.clear()
            client.users, client.tokens = users, tokens
            yield client
    finally:
        problems = []
        if made:
            try:
                safety.drop_schema(engine, SCHEMA)
            except BaseException as exc:  # noqa: BLE001
                problems.append(f"drop schéma: {exc}")
        mp.undo()
        if uploads:
            shutil.rmtree(uploads, ignore_errors=True)
        engine.dispose()
        _RESTORE.restore()
        if problems:
            raise AssertionError("; ".join(problems))


@pytest.fixture(scope="module")
def shop(w):
    rid, iid = live_as(w, "owner", "C2PG Vendeur", 20.0)
    return rid, iid


def test_pg_schema_has_order_tables(w):
    import sqlalchemy as sa
    with engine.connect() as cx:
        assert cx.execute(sa.text("SELECT current_schema()")).scalar() == SCHEMA
        n = cx.execute(sa.text("SELECT count(*) FROM information_schema.tables WHERE table_schema = :s AND table_name IN ('foodorder','foodsuborder','foodorderitem')"), {"s": SCHEMA}).scalar()
        assert n == 3


def test_same_idempotency_key_in_parallel_creates_exactly_one_order(w, shop):
    rid, iid = shop
    k = key()
    with Session(engine) as s:
        before = len(s.exec(select(FoodOrder)).all())
    res = run_parallel([lambda: checkout(w, "g1", [vend(rid, iid, 2)], k=k) for _ in range(N)])
    assert all(r.status_code in (200, 201) for r in res), [r.text for r in res]
    assert len({r.json()["code"] for r in res}) == 1  # tous reçoivent la MÊME commande
    assert sum(1 for r in res if r.json()["replayed"] is False) >= 1
    with Session(engine) as s:
        assert len(s.exec(select(FoodOrder)).all()) == before + 1
        assert len(s.exec(select(FoodSubOrder).where(FoodSubOrder.order_id == s.exec(select(FoodOrder.id).where(FoodOrder.code == res[0].json()["code"])).one())).all()) == 1


def test_distinct_keys_in_parallel_create_distinct_orders(w, shop):
    rid, iid = shop
    res = run_parallel([lambda: checkout(w, "g1", [vend(rid, iid, 1)]) for _ in range(N)])
    assert all(r.status_code == 201 for r in res), [r.text for r in res]
    assert len({r.json()["code"] for r in res}) == N


def test_concurrent_accept_and_decline_only_one_wins(w, shop):
    rid, iid = shop
    o = checkout(w, "g1", [vend(rid, iid, 1)]).json()
    code = o["suborders"][0]["code"]
    acts = [{"action": "accept"}, {"action": "decline", "reason": "Rupture"}] * 3
    res = run_parallel([lambda a=a: w.post(f"{API}/seller/orders/{code}/decision", json=a, headers=H(w, "owner")) for a in acts])
    ok = [r for r in res if r.status_code == 200]
    assert len(ok) == 1 and all(r.status_code == 409 for r in res if r is not ok[0])
    final = w.get(f"{API}/me/orders/{o['code']}", headers=H(w, "g1")).json()["suborders"][0]["status"]
    assert final == ok[0].json()["status"]


def test_concurrent_client_cancel_vs_seller_accept(w, shop):
    rid, iid = shop
    o = checkout(w, "g1", [vend(rid, iid, 1)]).json()
    code = o["suborders"][0]["code"]
    res = run_parallel([
        lambda: w.post(f"{API}/me/suborders/{code}/cancel", headers=H(w, "g1")),
        lambda: w.post(f"{API}/seller/orders/{code}/decision", json={"action": "accept"}, headers=H(w, "owner")),
    ])
    assert sorted(r.status_code for r in res) == [200, 409]  # un seul gagne, jamais d'état incohérent
