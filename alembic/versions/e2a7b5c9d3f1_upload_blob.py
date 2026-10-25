"""upload blob (images durables)

Revision ID: e2a7b5c9d3f1
Revises: d1f6a4b8c2e5
Create Date: 2026-10-26 00:40:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e2a7b5c9d3f1'
down_revision: Union[str, None] = 'd1f6a4b8c2e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('uploadblob',
        sa.Column('path', sa.String(length=200), primary_key=True),
        sa.Column('content_type', sa.String(), nullable=False, server_default='image/png'),
        sa.Column('data', sa.LargeBinary(), nullable=False))


def downgrade() -> None:
    op.drop_table('uploadblob')
