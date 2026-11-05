"""H-Lodge : locations au mois (loyer, mois d'avance, garantie)

Revision ID: a1b2c3d4e5f7
Revises: f0a1b2c3d4e5
"""
import sqlalchemy as sa
from alembic import op

revision = 'a1b2c3d4e5f7'
down_revision = 'f0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('property', sa.Column('rent_per_month', sa.Float(), nullable=False, server_default='0'))
    op.add_column('property', sa.Column('advance_months', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('property', sa.Column('deposit_months', sa.Float(), nullable=False, server_default='0'))
    op.add_column('property', sa.Column('lease_min_months', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    for c in ('lease_min_months', 'deposit_months', 'advance_months', 'rent_per_month'):
        op.drop_column('property', c)
