"""HFood C2 : commandes (commande parent, sous-commandes par vendeur, lignes figées)

Revision ID: f1c2a0b1d2e3
Revises: e2a2b3c4d5f6

Additive : crée 3 tables (`foodorder`, `foodsuborder`, `foodorderitem`). Aucune table ni colonne existante n'est modifiée.
Ré-exécutable (tables / index déjà présents : ignorés). Le downgrade supprime ces 3 tables (et leurs données de commande).
"""
import os
import sys

import sqlalchemy as sa
from alembic import op

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from _safe import has_table  # noqa: E402

revision = 'f1c2a0b1d2e3'
down_revision = 'e2a2b3c4d5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not has_table('foodorder'):
        op.create_table(
            'foodorder',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('code', sa.String(), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False),
            sa.Column('idempotency_key', sa.String(), nullable=False),
            sa.Column('request_hash', sa.String(), nullable=False, server_default=''),
            sa.Column('contact_name', sa.String(), nullable=False, server_default=''),
            sa.Column('phone', sa.String(), nullable=False, server_default=''),
            sa.Column('note', sa.String(), nullable=False, server_default=''),
            sa.Column('currency', sa.String(), nullable=False, server_default='ZMW'),
            sa.Column('items_total', sa.Float(), nullable=False, server_default='0'),
            sa.Column('fees_known_total', sa.Float(), nullable=False, server_default='0'),
            sa.Column('fees_pending', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('grand_total', sa.Float(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.UniqueConstraint('user_id', 'idempotency_key', name='uq_foodorder_user_idem'),
        )
        op.create_index('ix_foodorder_code', 'foodorder', ['code'], unique=True)
        op.create_index('ix_foodorder_user_id', 'foodorder', ['user_id'])
        op.create_index('ix_foodorder_idempotency_key', 'foodorder', ['idempotency_key'])
    if not has_table('foodsuborder'):
        op.create_table(
            'foodsuborder',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('code', sa.String(), nullable=False),
            sa.Column('order_id', sa.Integer(), sa.ForeignKey('foodorder.id'), nullable=False),
            sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False),
            sa.Column('restaurant_name', sa.String(), nullable=False, server_default=''),
            sa.Column('seller_type', sa.String(), nullable=False, server_default='restaurant'),
            sa.Column('fulfilment', sa.String(), nullable=False, server_default='delivery'),
            sa.Column('delivery_address', sa.String(), nullable=False, server_default=''),
            sa.Column('delivery_zone', sa.String(), nullable=False, server_default=''),
            sa.Column('delivery_fee', sa.Float(), nullable=True),
            sa.Column('delivery_fee_note', sa.String(), nullable=False, server_default=''),
            sa.Column('delivery_terms', sa.String(), nullable=False, server_default=''),
            sa.Column('items_total', sa.Float(), nullable=False, server_default='0'),
            sa.Column('total_known', sa.Float(), nullable=False, server_default='0'),
            sa.Column('fee_pending', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('status', sa.String(), nullable=False, server_default='pending'),
            sa.Column('payment_status', sa.String(), nullable=False, server_default='unpaid'),
            sa.Column('decline_reason', sa.String(), nullable=True),
            sa.Column('note', sa.String(), nullable=False, server_default=''),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_foodsuborder_code', 'foodsuborder', ['code'], unique=True)
        op.create_index('ix_foodsuborder_order_id', 'foodsuborder', ['order_id'])
        op.create_index('ix_foodsuborder_restaurant_id', 'foodsuborder', ['restaurant_id'])
        op.create_index('ix_foodsuborder_status', 'foodsuborder', ['status'])
        op.create_index('ix_foodsuborder_payment_status', 'foodsuborder', ['payment_status'])
    if not has_table('foodorderitem'):
        op.create_table(
            'foodorderitem',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('sub_order_id', sa.Integer(), sa.ForeignKey('foodsuborder.id'), nullable=False),
            sa.Column('menu_item_id', sa.Integer(), nullable=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('unit_price', sa.Float(), nullable=False),
            sa.Column('qty', sa.Integer(), nullable=False),
            sa.Column('line_total', sa.Float(), nullable=False),
        )
        op.create_index('ix_foodorderitem_sub_order_id', 'foodorderitem', ['sub_order_id'])
        op.create_index('ix_foodorderitem_menu_item_id', 'foodorderitem', ['menu_item_id'])


def downgrade() -> None:
    for t in ('foodorderitem', 'foodsuborder', 'foodorder'):
        if has_table(t):
            op.drop_table(t)
