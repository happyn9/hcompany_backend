"""onboarding pro : profil enrichi

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
"""
import sqlalchemy as sa
from alembic import op

revision = 'b2c3d4e5f6a8'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in ('account_type', 'company_name', 'country', 'city', 'language', 'interests', 'purpose'):
        op.add_column('userprofile', sa.Column(col, sa.String(), nullable=True))
    op.add_column('userprofile', sa.Column('wants_partner', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    for col in ('wants_partner', 'purpose', 'interests', 'language', 'city', 'country', 'company_name', 'account_type'):
        op.drop_column('userprofile', col)
