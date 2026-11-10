"""Aides pour des migrations ré-exécutables (colonnes/tables/index déjà présents)."""
import sqlalchemy as sa
from alembic import op


def _insp():
    return sa.inspect(op.get_bind())


def has_table(t):
    return t in _insp().get_table_names()


def has_col(t, c):
    return has_table(t) and c in {x['name'] for x in _insp().get_columns(t)}


def has_index(t, name):
    return has_table(t) and name in {x['name'] for x in _insp().get_indexes(t)}


def add_col(t, column):
    if not has_col(t, column.name):
        op.add_column(t, column)
        return True
    return False
