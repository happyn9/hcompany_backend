"""HFood A2 — migration `e2a2b3c4d5f6` (type de vendeur, livraison, conditions de vente).

Additive ; ne retire au downgrade que les colonnes qu'elle a réellement créées (table marqueur `alembic_hfood_a2_marks`).
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
A1, A2 = "d1a2b3c4e5f6", "e2a2b3c4d5f6"
NEW = ["seller_type", "offers_delivery", "delivery_zones", "delivery_fee", "delivery_fee_note", "delivery_terms", "sale_notes"]
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
            self.tmp = tempfile.mkdtemp(prefix="hfood_mig_a2_")
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
        d.ok("upgrade", A1)  # base : état A1.1 (avant A2)
        from app.models import User
        from sqlmodel import Session
        with Session(d.engine) as s:
            u = User(email=f"m{request.param}@x.com")
            s.add(u)
            s.commit()
            s.refresh(u)
            d.uid = u.id
        d.insert_row("m")  # une fiche existante AVANT A2
        yield d
    finally:
        d.close()


def test_upgrade_adds_columns_and_existing_rows_become_restaurants(db):
    assert not set(NEW) & db.cols()
    db.ok("upgrade", A2)
    assert set(NEW) <= db.cols() and "ix_restaurant_seller_type" in db.indexes()
    r = db.row("m")
    assert (r["seller_type"], bool(r["offers_delivery"]), r["delivery_fee"], r["delivery_zones"], r["sale_notes"]) == ("restaurant", False, None, "", "")
    assert r["name"] == "Mig m"  # données existantes intactes
    assert db.marks() >= set(NEW)


def test_rerun_is_noop(db):
    db.ok("upgrade", A2)
    before = db.row("m")
    db.ok("upgrade", A2)
    assert db.row("m") == before and set(NEW) <= db.cols()


def test_downgrade_removes_only_created_columns_and_keeps_data(db):
    db.ok("upgrade", A2)
    db.ok("downgrade", A1)
    assert not set(NEW) & db.cols() and not db.has_marks() and "ix_restaurant_seller_type" not in db.indexes()
    r = db.row("m")
    assert r["name"] == "Mig m" and r["city"] is not None  # le reste de la fiche est intact


def test_preexisting_column_and_its_data_survive_downgrade(db):
    typ = "TEXT" if not db.pg else "VARCHAR"
    with db.engine.begin() as cx:
        cx.execute(sa.text(f"ALTER TABLE restaurant ADD COLUMN sale_notes {typ} NOT NULL DEFAULT ''"))
        cx.execute(sa.text("UPDATE restaurant SET sale_notes = 'à conserver' WHERE slug = 'm'"))
    db.ok("upgrade", A2)
    assert "sale_notes" not in db.marks() and "seller_type" in db.marks()  # sale_notes n'a pas été créée par nous
    db.ok("downgrade", A1)
    assert "sale_notes" in db.cols() and db.row("m")["sale_notes"] == "à conserver"
    assert "seller_type" not in db.cols()


def test_upgrade_downgrade_upgrade_and_chain(db):
    db.ok("upgrade", A2)
    db.ok("downgrade", A1)
    db.ok("upgrade", A2)
    assert set(NEW) <= db.cols()
    with db.engine.connect() as cx:
        assert cx.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() == A2
    heads = {ln.split()[0] for ln in db.alembic("heads").stdout.splitlines() if "(head)" in ln}
    assert A2 in heads and A1 not in heads  # A2 prolonge A1.1 sans créer de nouvelle branche
    hist = db.alembic("history", "-r", f"{A1}:{A2}").stdout
    assert A2 in hist
