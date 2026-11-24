"""HFood D2 : propositions de modification de commande (vendeur propose, client décide)

Revision ID: b5d2c3e4f6a7
Revises: a4d1c2b3e5f6

Additive : 2 nouvelles tables (`foodorderproposal`, `foodorderproposalline`) + index unique partiel « une seule proposition en attente par sous-commande ».
Ré-exécutable. Le downgrade supprime ces 2 tables (l'historique des propositions est perdu ; les commandes elles-mêmes restent).
"""
import os
import sys

import sqlalchemy as sa
from alembic import op

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from _safe import has_index, has_table  # noqa: E402

revision = 'b5d2c3e4f6a7'
down_revision = 'a4d1c2b3e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not has_table('foodorderproposal'):
        op.create_table(
            'foodorderproposal',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('sub_order_id', sa.Integer(), sa.ForeignKey('foodsuborder.id'), nullable=False),
            sa.Column('status', sa.String(), nullable=False, server_default='pending'),
            sa.Column('message', sa.String(), nullable=False, server_default=''),
            sa.Column('items_total_before', sa.Float(), nullable=False, server_default='0'),
            sa.Column('items_total_after', sa.Float(), nullable=False, server_default='0'),
            sa.Column('decision_note', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('expires_at', sa.DateTime(), nullable=False),
            sa.Column('decided_at', sa.DateTime(), nullable=True),
        )
    if not has_index('foodorderproposal', 'ix_foodorderproposal_sub_order_id'):
        op.create_index('ix_foodorderproposal_sub_order_id', 'foodorderproposal', ['sub_order_id'])
    if not has_index('foodorderproposal', 'ix_foodorderproposal_status'):
        op.create_index('ix_foodorderproposal_status', 'foodorderproposal', ['status'])
    if not has_index('foodorderproposal', 'uq_foodorderproposal_one_pending'):
        op.create_index('uq_foodorderproposal_one_pending', 'foodorderproposal', ['sub_order_id'], unique=True,
                        postgresql_where=sa.text("status = 'pending'"), sqlite_where=sa.text("status = 'pending'"))
    if not has_table('foodorderproposalline'):
        op.create_table(
            'foodorderproposalline',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('proposal_id', sa.Integer(), sa.ForeignKey('foodorderproposal.id'), nullable=False),
            sa.Column('order_item_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False, server_default=''),
            sa.Column('unit_price', sa.Float(), nullable=False, server_default='0'),
            sa.Column('qty_before', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('qty_after', sa.Integer(), nullable=False, server_default='0'),
        )
    for c in ('proposal_id', 'order_item_id'):
        if not has_index('foodorderproposalline', f'ix_foodorderproposalline_{c}'):
            op.create_index(f'ix_foodorderproposalline_{c}', 'foodorderproposalline', [c])


def downgrade() -> None:
    if has_table('foodorderproposalline'):
        op.drop_table('foodorderproposalline')
    if has_table('foodorderproposal'):
        op.drop_table('foodorderproposal')
