"""taux d'envoi et de retrait par sens (H-Money)

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
"""
import sqlalchemy as sa
from alembic import op

revision = 'b6c7d8e9f0a1'
down_revision = 'a5b6c7d8e9f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('moneyrate',
        sa.Column('from_country', sa.String(2), primary_key=True), sa.Column('to_country', sa.String(2), primary_key=True),
        sa.Column('send_rate', sa.Float(), nullable=True), sa.Column('withdraw_rate', sa.Float(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True), sa.Column('updated_at', sa.DateTime(), nullable=False))


def downgrade() -> None:
    op.drop_table('moneyrate')
