"""HFood C2 — migration `f1c2a0b1d2e3` (commande parent, sous-commandes par vendeur, lignes figées).

Additive : 3 nouvelles tables, aucune table existante modifiée.
SQLite (toujours) et PostgreSQL jetable (si HFOOD_TEST_PG_URL : mêmes garde-fous que les tests A1, schéma isolé).
Ne modifie jamais os.environ : l'URL est passée au sous-processus alembic."""
import os
import subprocess
import sys
import tempfile
from datetime import datetime

import pytest
import sqlalchemy as sa

from tests import pg_safety as safety

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A2, C2, D1 = "e2a2b3c4d5f6", "f1c2a0b1d2e3", "a4d1c2b3e5f6"
NEW = ["payment_method", "payment_ref", "payment_note", "status_note"]
TABLES = ["foodorder", "foodsuborder", "foodorderitem"]
PG = os.environ.get(safety.ENV_URL, "").strip()
TARGET = None
if PG:
    _env = dict(os.environ)
    TARGET = safety.check_test_url(PG, environ=_env)
    safety.require_confirmation(TARGET, environ=_env)


class Db:
    def __init__(self, kind):
        self.pg, self.tmp, self.schema, self.schema_created = kind == "pg", None, None, False
        if self.pg:
            self.schema = safety.new_schema_name()
            self.url = safety.scoped_url(TARGET, self.schema)
        else:
            self.tmp = tempfile.mkdtemp(prefix="hfood_mig_d1_")
            self.url = f"sqlite:///{self.tmp}/mig.db"
        self.engine = sa.create_engine(self.url)

    def create(self):
        if self.pg:
            safety.create_schema(self.engine, self.schema)
            self.schema_created = True

    def alembic(self, *args):
        env = {**os.environ, "DATABASE_URL": self.url, "PYTHONDONTWRITEBYTECODE": "1"}
        return subprocess.run([sys.executable, "-B", "-m", "alembic", *args], cwd=BACKEND, env=env, capture_output=True, text=True)

    def ok(self, *args):
        r = self.alembic(*args)
        assert r.returncode == 0, r.stderr[-1500:]

    def cols(self):
        self.engine.dispose()
        return {c["name"] for c in sa.inspect(self.engine).get_columns("restaurant")}

    def has_marks(self):
        self.engine.dispose()
        return sa.inspect(self.engine).has_table("alembic_hfood_a2_marks")

    def marks(self):
        with self.engine.connect() as cx:
            return {r[0] for r in cx.execute(sa.text("SELECT name FROM alembic_hfood_a2_marks"))}

    def indexes(self):
        self.engine.dispose()
        return {i["name"] for i in sa.inspect(self.engine).get_indexes("restaurant")}

    def insert_row(self, slug="m"):
        from app.restaurant.models import Restaurant
        rs = Restaurant(slug=slug, owner_id=self.uid, name="Mig " + slug)
        vals = {c: getattr(rs, c) for c in self.cols() if c != "id" and getattr(rs, c, None) is not None}
        with self.engine.begin() as cx:
            cx.execute(sa.text(f"INSERT INTO restaurant ({', '.join(vals)}) VALUES ({', '.join(':' + k for k in vals)})"), vals)

    def row(self, slug="m"):
        with self.engine.connect() as cx:
            return dict(cx.execute(sa.text("SELECT * FROM restaurant WHERE slug = :s"), {"s": slug}).mappings().one())

    def close(self):
        try:
            self.engine.dispose()
            if self.pg and self.schema_created:
                e = sa.create_engine(safety.scoped_url(TARGET, self.schema))
                try:
                    safety.drop_schema(e, self.schema)
                finally:
                    e.dispose()
        finally:
            if self.tmp:
                import shutil
                shutil.rmtree(self.tmp, ignore_errors=True)


@pytest.fixture(params=["sqlite", pytest.param("pg", marks=pytest.mark.skipif(not PG, reason="nécessite HFOOD_TEST_PG_URL (PostgreSQL de test)"))])
def db(request):
    d = Db(request.param)
    try:
        d.create()
        d.ok("upgrade", C2)  # base : état C2 (avant D1)
        from app.models import User
        from sqlmodel import Session
        with Session(d.engine) as s:
            u = User(email=f"md{request.param}@x.com")
            s.add(u)
            s.commit()
            s.refresh(u)
            d.uid = u.id
        d.insert_row("m")  # une fiche existante AVANT D1
        yield d
    finally:
        d.close()


def cols(db):
    db.engine.dispose()
    return {c["name"] for c in sa.inspect(db.engine).get_columns("foodsuborder")}


def seed_order(db):
    now = datetime.utcnow()
    with db.engine.begin() as cx:
        cx.execute(sa.text("INSERT INTO foodorder (code, user_id, idempotency_key, created_at) VALUES ('HF-D1AAAA11', :u, 'k1d1', :t)"), {"u": db.uid, "t": now})
        oid = cx.execute(sa.text("SELECT id FROM foodorder")).scalar()
        rid = cx.execute(sa.text("SELECT id FROM restaurant")).scalar()
        cx.execute(sa.text("INSERT INTO foodsuborder (code, order_id, restaurant_id, status, payment_status, created_at, updated_at) VALUES ('HS-D1AAAA11', :o, :r, 'accepted', 'unpaid', :t, :t)"), {"o": oid, "r": rid, "t": now})


def test_upgrade_adds_nullable_columns_and_keeps_orders(db):
    seed_order(db)
    assert not set(NEW) & cols(db)
    db.ok("upgrade", D1)
    assert set(NEW) <= cols(db)
    with db.engine.connect() as cx:
        r = cx.execute(sa.text("SELECT status, payment_status, payment_ref FROM foodsuborder")).one()
    assert tuple(r) == ("accepted", "unpaid", None)  # commande existante intacte


def test_rerun_noop_and_downgrade_keeps_orders(db):
    seed_order(db)
    db.ok("upgrade", D1)
    db.ok("upgrade", D1)
    assert set(NEW) <= cols(db)
    db.ok("downgrade", C2)
    assert not set(NEW) & cols(db)
    with db.engine.connect() as cx:
        assert cx.execute(sa.text("SELECT status FROM foodsuborder")).scalar() == "accepted"  # la commande reste, seules les 4 colonnes de suivi partent


def test_chain_single_head(db):
    db.ok("upgrade", D1)
    heads = {ln.split()[0] for ln in db.alembic("heads").stdout.splitlines() if "(head)" in ln}
    D2 = "b5d2c3e4f6a7"  # D2 prolonge D1
    assert D2 in heads and D1 not in heads and C2 not in heads and heads - {D2} <= {"a1d5c8e2f4b7"}
