"""espaces publicitaires (promotions internes et partenaires)

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a5b6c7d8e9f0'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    S = lambda n, d='': sa.Column(n, sa.String(), nullable=False, server_default=d)
    op.create_table('promo',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('owner_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=True, index=True),
        sa.Column('module', sa.String(), nullable=False, server_default='internal', index=True), sa.Column('title', sa.String(), nullable=False),
        S('body'), S('image_url'), S('cta_label', 'Découvrir'), sa.Column('link', sa.String(), nullable=False), S('theme', 'coffee'),
        sa.Column('placement', sa.String(), nullable=False, server_default='any', index=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending', index=True), S('reject_reason'),
        sa.Column('starts_at', sa.DateTime(), nullable=True), sa.Column('ends_at', sa.DateTime(), nullable=True),
        sa.Column('impressions', sa.Integer(), nullable=False, server_default='0'), sa.Column('clicks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False))


def downgrade() -> None:
    op.drop_table('promo')
