"""tarifs par opérateur (pawaPay), marge cible, coût agrégateur par opération

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
"""
import sqlalchemy as sa
from alembic import op

revision = 'e9f0a1b2c3d4'
down_revision = 'd8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('moneyoperatorfee',
        sa.Column('country', sa.String(2), primary_key=True), sa.Column('operator', sa.String(), primary_key=True), sa.Column('direction', sa.String(3), primary_key=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column('pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('tiers_json', sa.String(), nullable=False, server_default='[]'), sa.Column('confirmed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('note', sa.String(), nullable=False, server_default=''), sa.Column('updated_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.add_column('moneysettings', sa.Column('target_margin_pct', sa.Float(), nullable=False, server_default='1.0'))
    op.add_column('moneytransfer', sa.Column('provider_cost', sa.Float(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('moneytransfer', 'provider_cost')
    op.drop_column('moneysettings', 'target_margin_pct')
    op.drop_table('moneyoperatorfee')
