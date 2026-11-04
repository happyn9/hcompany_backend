"""frais et plafonds H-Money réglables par l'admin

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
"""
import sqlalchemy as sa
from alembic import op

revision = 'c7d8e9f0a1b2'
down_revision = 'b6c7d8e9f0a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('moneysettings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('fee_pct', sa.Float(), nullable=False), sa.Column('min_fee_usd', sa.Float(), nullable=False),
        sa.Column('min_usd', sa.Float(), nullable=False), sa.Column('max_usd', sa.Float(), nullable=False),
        sa.Column('daily_max_usd', sa.Float(), nullable=False),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True), sa.Column('updated_at', sa.DateTime(), nullable=False))


def downgrade() -> None:
    op.drop_table('moneysettings')
