"""HFood E — migration `c6e3d4f5a7b8` (avis liés aux commandes). SQLite toujours ; PostgreSQL jetable si HFOOD_TEST_PG_URL (mêmes garde-fous)."""
from datetime import datetime

import pytest
import sqlalchemy as sa

from tests.test_hfood_d2_migration import D2, Db, PG, db as _base_db, seed_order, tables  # noqa: F401

E = "c6e3d4f5a7b8"


@pytest.fixture
def db(_base_db):
    _base_db.ok("upgrade", D2)
    return _base_db


def test_upgrade_creates_table_and_keeps_data(db):
    sid = seed_order(db)
    assert "foodorderreview" not in tables(db)
    db.ok("upgrade", E)
    assert "foodorderreview" in tables(db)
    with db.engine.connect() as cx:
        assert cx.execute(sa.text("SELECT count(*) FROM foodsuborder")).scalar() == 1


def test_one_review_per_sub_order(db):
    sid = seed_order(db)
    db.ok("upgrade", E)
    with db.engine.connect() as cx:
        rid = cx.execute(sa.text("SELECT id FROM restaurant")).scalar()
    ins = "INSERT INTO foodorderreview (sub_order_id, restaurant_id, user_id, rating, comment, hidden, created_at) VALUES (:s, :r, :u, 5, '', :h, :t)"
    args = {"s": sid, "r": rid, "u": db.uid, "h": False, "t": datetime.utcnow()}
    with db.engine.begin() as cx:
        cx.execute(sa.text(ins), args)
    with pytest.raises(sa.exc.IntegrityError):
        with db.engine.begin() as cx:
            cx.execute(sa.text(ins), args)


def test_rerun_noop_and_downgrade_keeps_orders(db):
    seed_order(db)
    db.ok("upgrade", E)
    db.ok("upgrade", E)
    db.ok("downgrade", D2)
    assert "foodorderreview" not in tables(db)
    with db.engine.connect() as cx:
        assert cx.execute(sa.text("SELECT count(*) FROM foodsuborder")).scalar() == 1
    db.ok("upgrade", "heads")
    assert "foodorderreview" in tables(db)
