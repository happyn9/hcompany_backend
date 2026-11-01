"""dashboard partenaire unique : plans, fonctions payantes, marque, invitations

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('partnerplan',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), primary_key=True),
        sa.Column('plan', sa.String(), nullable=False, server_default='standard'), sa.Column('pro_until', sa.DateTime(), nullable=True),
        sa.Column('upgrade_requested_at', sa.DateTime(), nullable=True), sa.Column('updated_at', sa.DateTime(), nullable=False))
    op.create_table('partnerfeature',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False, index=True),
        sa.Column('key', sa.String(), nullable=False, index=True), sa.Column('status', sa.String(), nullable=False, server_default='requested'),
        sa.Column('requested_at', sa.DateTime(), nullable=False), sa.Column('unlocked_at', sa.DateTime(), nullable=True),
        sa.Column('reference', sa.String(), nullable=False, server_default=''))
    op.create_table('partnerbranding',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), primary_key=True),
        sa.Column('display_name', sa.String(), nullable=False, server_default=''), sa.Column('tagline', sa.String(), nullable=False, server_default=''),
        sa.Column('accent', sa.String(), nullable=False, server_default=''), sa.Column('logo_url', sa.String(), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(), nullable=False))
    op.create_table('applicationinvite',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('token_hash', sa.String(), nullable=False, unique=True, index=True), sa.Column('email', sa.String(), nullable=False, index=True),
        sa.Column('note', sa.String(), nullable=False, server_default=''), sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('expires_at', sa.DateTime(), nullable=False), sa.Column('used_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    for t in ('applicationinvite', 'partnerbranding', 'partnerfeature', 'partnerplan'):
        op.drop_table(t)
