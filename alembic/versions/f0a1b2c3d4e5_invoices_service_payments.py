"""factures H-Money et registre des paiements de services

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
"""
import sqlalchemy as sa
from alembic import op

revision = 'f0a1b2c3d4e5'
down_revision = 'e9f0a1b2c3d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('invoice',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('code', sa.String(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False), sa.Column('client_name', sa.String(), nullable=False),
        sa.Column('client_email', sa.String(), nullable=False, server_default=''), sa.Column('client_phone', sa.String(), nullable=False, server_default=''),
        sa.Column('client_country', sa.String(), nullable=False, server_default='ZM'), sa.Column('currency', sa.String(), nullable=False, server_default=''),
        sa.Column('items_json', sa.String(), nullable=False, server_default='[]'), sa.Column('total', sa.Float(), nullable=False, server_default='0'),
        sa.Column('note', sa.String(), nullable=False, server_default=''), sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('transfer_code', sa.String(), nullable=False, server_default=''), sa.Column('cancelled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_index('ix_invoice_code', 'invoice', ['code'], unique=True)
    op.create_index('ix_invoice_user_id', 'invoice', ['user_id'])
    op.create_index('ix_invoice_client_email', 'invoice', ['client_email'])
    op.create_index('ix_invoice_transfer_code', 'invoice', ['transfer_code'])
    op.create_table('servicepayment',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('service', sa.String(), nullable=False), sa.Column('ref', sa.String(), nullable=False),
        sa.Column('payer_user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False), sa.Column('payee_user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('currency', sa.String(), nullable=False), sa.Column('gross', sa.Float(), nullable=False, server_default='0'),
        sa.Column('commission', sa.Float(), nullable=False, server_default='0'), sa.Column('net_to_payee', sa.Float(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(), nullable=False, server_default='held'), sa.Column('transfer_ref', sa.String(), nullable=False, server_default=''),
        sa.Column('note', sa.String(), nullable=False, server_default=''), sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))
    for c in ('service', 'ref', 'payer_user_id', 'payee_user_id', 'status'):
        op.create_index(f'ix_servicepayment_{c}', 'servicepayment', [c])


def downgrade() -> None:
    op.drop_table('servicepayment')
    op.drop_table('invoice')
