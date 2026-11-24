"""HFood D2 — migration `b5d2c3e4f6a7` (propositions de modification de commande).

Additive : 2 nouvelles tables.
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
C2, D1, D2 = "f1c2a0b1d2e3", "a4d1c2b3e5f6", "b5d2c3e4f6a7"
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
            self.tmp = tempfile.mkdtemp(prefix="hfood_mig_d2_")
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
        d.ok("upgrade", D1)  # base : état D1 (avant D2)
        from app.models import User
        from sqlmodel import Session
        with Session(d.engine) as s:
            u = User(email=f"md{request.param}@x.com")
            s.add(u)
            s.commit()
            s.refresh(u)
            d.uid = u.id
        d.insert_row("m")  # une fiche existante AVANT D2
        yield d
    finally:
        d.close()


def tables(db):
    db.engine.dispose()
    return set(sa.inspect(db.engine).get_table_names())


def seed_order(db):
    now = datetime.utcnow()
    with db.engine.begin() as cx:
        cx.execute(sa.text("INSERT INTO foodorder (code, user_id, idempotency_key, created_at) VALUES ('HF-D2AAAA11', :u, 'k1d2', :t)"), {"u": db.uid, "t": now})
        oid = cx.execute(sa.text("SELECT id FROM foodorder")).scalar()
        rid = cx.execute(sa.text("SELECT id FROM restaurant")).scalar()
        cx.execute(sa.text("INSERT INTO foodsuborder (code, order_id, restaurant_id, status, payment_status, created_at, updated_at) VALUES ('HS-D2AAAA11', :o, :r, 'accepted', 'unpaid', :t, :t)"), {"o": oid, "r": rid, "t": now})
        return cx.execute(sa.text("SELECT id FROM foodsuborder")).scalar()


def prop(db, sid, status="pending"):
    now = datetime.utcnow()
    with db.engine.begin() as cx:
        cx.execute(sa.text("INSERT INTO foodorderproposal (sub_order_id, status, message, items_total_before, items_total_after, created_at, expires_at) VALUES (:s, :st, '', 10, 5, :t, :t)"), {"s": sid, "st": status, "t": now})


def test_upgrade_adds_tables_and_keeps_orders(db):
    sid = seed_order(db)
    assert not {"foodorderproposal", "foodorderproposalline"} & tables(db)
    db.ok("upgrade", D2)
    assert {"foodorderproposal", "foodorderproposalline"} <= tables(db)
    with db.engine.connect() as cx:
        assert tuple(cx.execute(sa.text("SELECT status, payment_status FROM foodsuborder")).one()) == ("accepted", "unpaid")


def test_one_pending_proposal_per_suborder(db):
    sid = seed_order(db)
    db.ok("upgrade", D2)
    prop(db, sid)
    with pytest.raises(sa.exc.IntegrityError):
        prop(db, sid)
    prop(db, sid, "declined")  # l'historique n'est pas limité
    prop(db, sid, "declined")


def test_rerun_noop_and_downgrade_keeps_orders(db):
    seed_order(db)
    db.ok("upgrade", D2)
    db.ok("upgrade", D2)
    db.ok("downgrade", D1)
    assert not {"foodorderproposal", "foodorderproposalline"} & tables(db)
    with db.engine.connect() as cx:
        assert cx.execute(sa.text("SELECT count(*) FROM foodsuborder")).scalar() == 1
    db.ok("upgrade", "heads")
    assert {"foodorderproposal"} <= tables(db)
