"""HFood A2 : type de vendeur (restaurant / vendeur individuel), livraison et conditions de vente

Revision ID: e2a2b3c4d5f6
Revises: d1a2b3c4e5f6

Additive : ajoute 7 colonnes à `restaurant` (+ index sur `seller_type`). Valeurs par défaut côté serveur :
les lignes existantes deviennent `restaurant`, sans livraison. Aucune donnée supprimée ni modifiée.

Les colonnes RÉELLEMENT créées par cette migration sont notées dans la table marqueur `alembic_hfood_a2_marks` :
le downgrade ne retire que celles-là (une colonne qui existait déjà, avec ses données, est conservée).
Ré-exécutable (colonnes / index / marqueurs déjà présents : ignorés).
"""
import sqlalchemy as sa
from alembic import op

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from _safe import add_col, has_col, has_index, has_table  # noqa: E402

revision = 'e2a2b3c4d5f6'
down_revision = 'd1a2b3c4e5f6'
branch_labels = None
depends_on = None

MARKS = 'alembic_hfood_a2_marks'
INDEX = 'ix_restaurant_seller_type'


def _columns():
    return [
        sa.Column('seller_type', sa.String(), nullable=False, server_default='restaurant'),
        sa.Column('offers_delivery', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('delivery_zones', sa.String(), nullable=False, server_default=''),
        sa.Column('delivery_fee', sa.Float(), nullable=True),
        sa.Column('delivery_fee_note', sa.String(), nullable=False, server_default=''),
        sa.Column('delivery_terms', sa.String(), nullable=False, server_default=''),
        sa.Column('sale_notes', sa.String(), nullable=False, server_default=''),
    ]


def _marked():
    if not has_table(MARKS):
        return set()
    return {r[0] for r in op.get_bind().execute(sa.text(f"SELECT name FROM {MARKS}"))}


def upgrade() -> None:
    if not has_table('restaurant'):
        return
    if not has_table(MARKS):
        op.create_table(MARKS, sa.Column('name', sa.String(), primary_key=True))
    done = _marked()
    for col in _columns():
        if add_col('restaurant', col) and col.name not in done:
            op.get_bind().execute(sa.text(f"INSERT INTO {MARKS} (name) VALUES (:n)"), {"n": col.name})
    if has_col('restaurant', 'seller_type') and not has_index('restaurant', INDEX):
        op.create_index(INDEX, 'restaurant', ['seller_type'])
        op.get_bind().execute(sa.text(f"INSERT INTO {MARKS} (name) SELECT :n WHERE NOT EXISTS (SELECT 1 FROM {MARKS} WHERE name = :n)"), {"n": "index:" + INDEX})


def downgrade() -> None:
    if not has_table('restaurant'):
        return
    marked = _marked()
    if ("index:" + INDEX) in marked and has_index('restaurant', INDEX):
        op.drop_index(INDEX, table_name='restaurant')
    for col in reversed(_columns()):
        if col.name in marked and has_col('restaurant', col.name):
            with op.batch_alter_table('restaurant') as b:
                b.drop_column(col.name)
    if has_table(MARKS):
        op.drop_table(MARKS)
