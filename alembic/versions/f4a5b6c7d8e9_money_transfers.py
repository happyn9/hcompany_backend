"""H-Money : envois et demandes d'argent ZM ⇄ CD

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    S = lambda n, **k: sa.Column(n, sa.String(), nullable=False, server_default='', **k)
    F = lambda n: sa.Column(n, sa.Float(), nullable=False, server_default='0')
    op.create_table('moneytransfer',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code', sa.String(), nullable=False, unique=True, index=True), sa.Column('kind', sa.String(), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False, index=True),
        sa.Column('payer_user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=True, index=True),
        sa.Column('from_country', sa.String(), nullable=False), sa.Column('to_country', sa.String(), nullable=False),
        S('send_currency'), F('send_amount'), F('fee'), F('total_paid'), sa.Column('receive_currency', sa.String(), nullable=False), F('receive_amount'), F('rate'),
        S('counterpart_name'), S('counterpart_phone'), S('counterpart_operator'), S('pay_phone'), S('pay_operator'), S('note'),
        sa.Column('status', sa.String(), nullable=False, index=True), S('provider'), S('provider_ref'), S('failure_reason'),
        sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False), sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('flagged', sa.Boolean(), nullable=False, server_default=sa.false()), S('review_note'))
    op.create_table('moneyagent',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False, index=True),
        sa.Column('country', sa.String(), nullable=False, index=True), sa.Column('can_set_rates', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('can_review', sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('assigned_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True), sa.Column('created_at', sa.DateTime(), nullable=False))
    op.create_table('moneyaudit',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('actor_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False, index=True),
        sa.Column('action', sa.String(), nullable=False, index=True), S('target'), S('detail'), sa.Column('created_at', sa.DateTime(), nullable=False))


def downgrade() -> None:
    op.drop_table('moneyaudit')
    op.drop_table('moneyagent')
    op.drop_table('moneytransfer')
