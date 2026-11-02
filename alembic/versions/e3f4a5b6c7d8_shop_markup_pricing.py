"""H-Shopping : commission incluse dans le prix (prix vendeur + taux figé)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('shopproduct', sa.Column('seller_price', sa.Float(), nullable=True))
    op.add_column('shopproduct', sa.Column('commission_rate_locked', sa.Float(), nullable=True))
    op.add_column('shopproductvariant', sa.Column('seller_price', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('shopproductvariant', 'seller_price')
    op.drop_column('shopproduct', 'commission_rate_locked')
    op.drop_column('shopproduct', 'seller_price')
