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
A2, C2 = "e2a2b3c4d5f6", "f1c2a0b1d2e3"
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
            self.tmp = tempfile.mkdtemp(prefix="hfood_mig_c2_")
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
        d.ok("upgrade", A2)  # base : état A2 (avant C2)
        from app.models import User
        from sqlmodel import Session
        with Session(d.engine) as s:
            u = User(email=f"mc{request.param}@x.com")
            s.add(u)
            s.commit()
            s.refresh(u)
            d.uid = u.id
        d.insert_row("m")  # une fiche existante AVANT C2
        yield d
    finally:
        d.close()


def tables(db):
    db.engine.dispose()
    return set(sa.inspect(db.engine).get_table_names())


def test_upgrade_creates_tables_keeps_existing_rows(db):
    assert not (set(TABLES) & tables(db))
    db.ok("upgrade", C2)
    assert set(TABLES) <= tables(db)
    assert db.row("m")["name"] == "Mig m"  # la fiche existante est intacte
    insp = sa.inspect(db.engine)
    uqs = {u["name"] for u in insp.get_unique_constraints("foodorder")}
    assert "uq_foodorder_user_idem" in uqs  # idempotence garantie par la base
    assert any(i["unique"] and i["column_names"] == ["code"] for i in insp.get_indexes("foodsuborder"))


def test_unique_idempotency_and_foreign_keys_enforced(db):
    db.ok("upgrade", C2)
    now = datetime.utcnow()
    ins = "INSERT INTO foodorder (code, user_id, idempotency_key, created_at) VALUES (:c, :u, :k, :t)"
    with db.engine.begin() as cx:
        cx.execute(sa.text(ins), {"c": "HF-AAAA1111", "u": db.uid, "k": "k1", "t": now})
    with pytest.raises(sa.exc.IntegrityError):
        with db.engine.begin() as cx:
            cx.execute(sa.text(ins), {"c": "HF-BBBB2222", "u": db.uid, "k": "k1", "t": now})  # même compte + même clé
    with db.engine.begin() as cx:
        cx.execute(sa.text(ins), {"c": "HF-CCCC3333", "u": db.uid, "k": "k2", "t": now})  # autre clé : accepté
    if db.pg:  # SQLite n'applique pas les FK par défaut ; PostgreSQL oui
        with pytest.raises(sa.exc.IntegrityError):
            with db.engine.begin() as cx:
                cx.execute(sa.text("INSERT INTO foodsuborder (code, order_id, restaurant_id, created_at, updated_at) VALUES ('HS-X', 999999, 999999, :t, :t)"), {"t": now})


def test_rerun_is_noop(db):
    db.ok("upgrade", C2)
    db.ok("downgrade", A2)
    db.ok("upgrade", C2)
    db.ok("upgrade", C2)
    assert set(TABLES) <= tables(db)


def test_downgrade_drops_only_order_tables(db):
    db.ok("upgrade", C2)
    db.ok("downgrade", A2)
    assert not (set(TABLES) & tables(db))
    assert db.row("m")["name"] == "Mig m"  # restaurants, utilisateurs et colonnes A2 conservés
    assert {"seller_type", "offers_delivery"} <= db.cols()


def test_chain_and_single_new_head(db):
    db.ok("upgrade", C2)
    with db.engine.connect() as cx:
        assert cx.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() == C2
    heads = {ln.split()[0] for ln in db.alembic("heads").stdout.splitlines() if "(head)" in ln}
    assert "c6e3d4f5a7b8" in heads and "b5d2c3e4f6a7" not in heads and "a4d1c2b3e5f6" not in heads and C2 not in heads and A2 not in heads and heads - {"c6e3d4f5a7b8"} <= {"a1d5c8e2f4b7"}  # D1 prolonge C2, D2 prolonge D1 ; la branche historique a1d5… est inchangée
