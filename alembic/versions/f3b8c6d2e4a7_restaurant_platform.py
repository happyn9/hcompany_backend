"""restaurant platform

Revision ID: f3b8c6d2e4a7
Revises: e2a7b5c9d3f1
Create Date: 2026-10-28 10:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f3b8c6d2e4a7'
down_revision: Union[str, None] = 'e2a7b5c9d3f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('restaurant',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('slug', sa.String(), nullable=False), sa.Column('owner_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('partner_application_id', sa.Integer(), sa.ForeignKey('partnerapplication.id')),
        sa.Column('name', sa.String(), nullable=False), sa.Column('summary', sa.String(), nullable=False, server_default=''),
        sa.Column('description', sa.String(), nullable=False, server_default=''), sa.Column('cuisines', sa.String(), nullable=False, server_default=''),
        sa.Column('country', sa.String(), nullable=False, server_default='Zambie'), sa.Column('city', sa.String(), nullable=False, server_default=''),
        sa.Column('area', sa.String(), nullable=False, server_default=''), sa.Column('address', sa.String(), nullable=False, server_default=''),
        sa.Column('latitude', sa.Float()), sa.Column('longitude', sa.Float()),
        sa.Column('phone', sa.String(), nullable=False, server_default=''), sa.Column('whatsapp', sa.String(), nullable=False, server_default=''),
        sa.Column('price_level', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('open_time', sa.String(), nullable=False, server_default='11:00'), sa.Column('close_time', sa.String(), nullable=False, server_default='22:00'),
        sa.Column('closed_days', sa.String(), nullable=False, server_default=''),
        sa.Column('slot_minutes', sa.Integer(), nullable=False, server_default='90'), sa.Column('max_party', sa.Integer(), nullable=False, server_default='12'),
        sa.Column('instant_confirm', sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column('accepts_preorder', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('has_terrace', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('room_w', sa.Float(), nullable=False, server_default='14'), sa.Column('room_d', sa.Float(), nullable=False, server_default='10'),
        sa.Column('status', sa.String(), nullable=False, server_default='draft'), sa.Column('status_reason', sa.String()),
        sa.Column('is_featured', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('rating_avg', sa.Float(), nullable=False, server_default='0'), sa.Column('rating_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False), sa.Column('approved_at', sa.DateTime()))
    op.create_index('ix_restaurant_slug', 'restaurant', ['slug'], unique=True)
    op.create_index('ix_restaurant_owner_id', 'restaurant', ['owner_id'])
    op.create_index('ix_restaurant_name', 'restaurant', ['name'])
    op.create_index('ix_restaurant_city', 'restaurant', ['city'])
    op.create_index('ix_restaurant_status', 'restaurant', ['status'])
    op.create_table('restaurantimage',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False),
        sa.Column('path', sa.String(), nullable=False), sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('ix_restaurantimage_restaurant_id', 'restaurantimage', ['restaurant_id'])
    op.create_table('menucategory',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False), sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('ix_menucategory_restaurant_id', 'menucategory', ['restaurant_id'])
    op.create_table('menuitem',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('menucategory.id')), sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False, server_default=''), sa.Column('price', sa.Float(), nullable=False),
        sa.Column('image_path', sa.String()), sa.Column('tags', sa.String(), nullable=False, server_default=''),
        sa.Column('is_available', sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('ix_menuitem_restaurant_id', 'menuitem', ['restaurant_id'])
    op.create_table('diningtable',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False),
        sa.Column('label', sa.String(), nullable=False), sa.Column('seats', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('shape', sa.String(), nullable=False, server_default='round'), sa.Column('zone', sa.String(), nullable=False, server_default='indoor'),
        sa.Column('x', sa.Float(), nullable=False, server_default='2'), sa.Column('z', sa.Float(), nullable=False, server_default='2'),
        sa.Column('rotation', sa.Float(), nullable=False, server_default='0'), sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_index('ix_diningtable_restaurant_id', 'diningtable', ['restaurant_id'])
    op.create_table('reservation',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('code', sa.String(), nullable=False),
        sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False), sa.Column('table_id', sa.Integer(), sa.ForeignKey('diningtable.id')),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False), sa.Column('name', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=False, server_default=''), sa.Column('party_size', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('day', sa.Date(), nullable=False), sa.Column('time', sa.String(), nullable=False, server_default='19:00'),
        sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default='90'), sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('note', sa.String(), nullable=False, server_default=''), sa.Column('preorder', sa.String(), nullable=False, server_default='[]'),
        sa.Column('preorder_total', sa.Float(), nullable=False, server_default='0'), sa.Column('restaurant_name', sa.String(), nullable=False, server_default=''),
        sa.Column('table_label', sa.String(), nullable=False, server_default=''), sa.Column('decline_reason', sa.String()),
        sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False))
    op.create_index('ix_reservation_code', 'reservation', ['code'], unique=True)
    op.create_index('ix_reservation_restaurant_id', 'reservation', ['restaurant_id'])
    op.create_index('ix_reservation_table_id', 'reservation', ['table_id'])
    op.create_index('ix_reservation_user_id', 'reservation', ['user_id'])
    op.create_index('ix_reservation_day', 'reservation', ['day'])
    op.create_index('ix_reservation_status', 'reservation', ['status'])
    op.create_table('restaurantreview',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurant.id'), nullable=False),
        sa.Column('reservation_id', sa.Integer(), sa.ForeignKey('reservation.id'), nullable=False, unique=True), sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False), sa.Column('comment', sa.String(), nullable=False, server_default=''), sa.Column('created_at', sa.DateTime(), nullable=False))
    op.create_index('ix_restaurantreview_restaurant_id', 'restaurantreview', ['restaurant_id'])


def downgrade() -> None:
    for t in ('restaurantreview', 'reservation', 'diningtable', 'menuitem', 'menucategory', 'restaurantimage', 'restaurant'):
        op.drop_table(t)
