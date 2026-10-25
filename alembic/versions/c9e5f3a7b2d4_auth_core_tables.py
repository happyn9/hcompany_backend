"""auth core tables (authentification intégrée)

Revision ID: c9e5f3a7b2d4
Revises: b8d4e2f6a1c3
Create Date: 2026-10-25 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c9e5f3a7b2d4'
down_revision: Union[str, None] = 'b8d4e2f6a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('authuser',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=True),
        sa.Column('google_id', sa.String(), nullable=True),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'))
    op.create_index('ix_authuser_email', 'authuser', ['email'], unique=True)
    op.create_index('ix_authuser_phone', 'authuser', ['phone'], unique=False)
    op.create_index('ix_authuser_google_id', 'authuser', ['google_id'], unique=True)
    op.create_table('authotp',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('identifier', sa.String(), nullable=False),
        sa.Column('purpose', sa.String(), nullable=False),
        sa.Column('code_hash', sa.String(), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'))
    op.create_index('ix_authotp_identifier', 'authotp', ['identifier'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_authotp_identifier', table_name='authotp')
    op.drop_table('authotp')
    op.drop_index('ix_authuser_google_id', table_name='authuser')
    op.drop_index('ix_authuser_phone', table_name='authuser')
    op.drop_index('ix_authuser_email', table_name='authuser')
    op.drop_table('authuser')
