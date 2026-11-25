"""HFood E : avis liés à une sous-commande terminée (+ modération administrateur)

Revision ID: c6e3d4f5a7b8
Revises: b5d2c3e4f6a7

Additive : 1 nouvelle table `foodorderreview` (un avis maximum par sous-commande : contrainte unique). Ré-exécutable.
Le downgrade supprime cette table (les avis liés aux commandes sont perdus ; commandes et avis de réservation restent).
"""
import os
import sys

import sqlalchemy as sa
from alembic import op

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from _safe import has_index, has_table  # noqa: E402

revision = 'c6e3d4f5a7b8'
down_revision = 'b5d2c3e4f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not has_table('foodorderreview'):
        op.create_table(
            'foodorderreview',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('sub_order_id', sa.Integer(), sa.ForeignKey('foodsuborder.id'), nullable=False, unique=True),
            sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False),
            sa.Column('rating', sa.Integer(), nullable=False),
            sa.Column('comment', sa.String(), nullable=False, server_default=''),
            sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('hidden_reason', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
        )
    for c in ('restaurant_id', 'user_id', 'hidden'):
        if not has_index('foodorderreview', f'ix_foodorderreview_{c}'):
            op.create_index(f'ix_foodorderreview_{c}', 'foodorderreview', [c])


def downgrade() -> None:
    if has_table('foodorderreview'):
        op.drop_table('foodorderreview')
