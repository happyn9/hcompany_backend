"""H-Money : frais, marges et frais minimum par sens

Revision ID: a7b8c9d0e1f2
Revises: b2c3d4e5f6a8
"""
import sqlalchemy as sa
from alembic import op
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _safe import add_col, has_col, has_table, has_index

revision = 'a7b8c9d0e1f2'
down_revision = 'b2c3d4e5f6a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col, default in (('fee_pct_cz', '4.0'), ('margin_zc_pct', '1.5'), ('margin_cz_pct', '1.5'), ('min_fee_zmw', '10.0')):
        add_col('moneysettings', sa.Column(col, sa.Float(), nullable=False, server_default=default))


def downgrade() -> None:
    for col in ('min_fee_zmw', 'margin_cz_pct', 'margin_zc_pct', 'fee_pct_cz'):
        op.drop_column('moneysettings', col)
