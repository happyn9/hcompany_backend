"""shop product colors

Revision ID: b8d4e2f6a1c3
Revises: a7c3d9e1b5f2
Create Date: 2026-10-25 01:10:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b8d4e2f6a1c3'
down_revision: Union[str, None] = 'a7c3d9e1b5f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('shopproduct') as b:
        b.add_column(sa.Column('colors', sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    with op.batch_alter_table('shopproduct') as b:
        b.drop_column('colors')
