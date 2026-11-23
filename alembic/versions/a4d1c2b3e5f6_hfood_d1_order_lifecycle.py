"""HFood D1 : suivi de commande (paiement manuel déclaré/confirmé, notes de statut)

Revision ID: a4d1c2b3e5f6
Revises: f1c2a0b1d2e3

Additive : 4 colonnes nullables sur `foodsuborder` (payment_method, payment_ref, payment_note, status_note). Ré-exécutable.
Le downgrade retire ces 4 colonnes (leurs données de suivi sont perdues ; les commandes elles-mêmes restent).
"""
import os
import sys

import sqlalchemy as sa
from alembic import op

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from _safe import add_col, has_col  # noqa: E402

revision = 'a4d1c2b3e5f6'
down_revision = 'f1c2a0b1d2e3'
branch_labels = None
depends_on = None
COLS = ("payment_method", "payment_ref", "payment_note", "status_note")


def upgrade() -> None:
    for c in COLS:
        add_col('foodsuborder', sa.Column(c, sa.String(), nullable=True))


def downgrade() -> None:
    for c in reversed(COLS):
        if has_col('foodsuborder', c):
            with op.batch_alter_table('foodsuborder') as b:
                b.drop_column(c)
