"""pays, taux de change, bénéficiaires

Revision ID: c1d2e3f4a5b6
Revises: b0e1f2a3c4d5
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b0e1f2a3c4d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('country',
        sa.Column('code', sa.String(2), primary_key=True),
        sa.Column('name_fr', sa.String(), nullable=False), sa.Column('name_en', sa.String(), nullable=False, server_default=''),
        sa.Column('currency', sa.String(), nullable=False, server_default='USD'), sa.Column('dial_code', sa.String(), nullable=False, server_default=''),
        sa.Column('timezone', sa.String(), nullable=False, server_default='UTC'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_service_country', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
    op.create_table('fxrate',
        sa.Column('currency', sa.String(3), primary_key=True),
        sa.Column('per_usd', sa.Float(), nullable=False), sa.Column('margin_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('source', sa.String(), nullable=False, server_default='seed'), sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True))
    op.create_table('beneficiary',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False, index=True),
        sa.Column('service', sa.String(), nullable=False, index=True), sa.Column('ref', sa.String(), nullable=False, index=True),
        sa.Column('name', sa.String(), nullable=False), sa.Column('phone', sa.String(), nullable=False),
        sa.Column('country_code', sa.String(), nullable=False, server_default='ZM'), sa.Column('message', sa.String(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False))


def downgrade() -> None:
    op.drop_table('beneficiary')
    op.drop_table('fxrate')
    op.drop_table('country')
