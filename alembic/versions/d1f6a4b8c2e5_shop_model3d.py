"""shop product model3d

Revision ID: d1f6a4b8c2e5
Revises: c9e5f3a7b2d4
Create Date: 2026-10-25 13:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd1f6a4b8c2e5'
down_revision: Union[str, None] = 'c9e5f3a7b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('shopproduct') as b:
        b.add_column(sa.Column('model3d', sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('shopproduct') as b:
        b.drop_column('model3d')
