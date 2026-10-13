"""learning: bouquets, devises, abonnements, contenu exclusif, Zamtel

Revision ID: b9d4e7a2c1f5
Revises: a3c8e5d17b42
Create Date: 2026-10-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = 'b9d4e7a2c1f5'
down_revision: Union[str, None] = 'a3c8e5d17b42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

S = sqlmodel.sql.sqltypes.AutoString


def upgrade() -> None:
    with op.batch_alter_table('course') as batch:
        batch.add_column(sa.Column('members_only', sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table('lesson') as batch:
        batch.add_column(sa.Column('members_only', sa.Boolean(), nullable=False, server_default=sa.false()))

    if op.get_bind().dialect.name == 'postgresql':
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'zamtel_money'")

    op.create_table(
        'learningplan',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', S(), nullable=False),
        sa.Column('name', S(), nullable=False),
        sa.Column('audience', S(), nullable=False),
        sa.Column('tagline', S(), nullable=False),
        sa.Column('features', S(), nullable=False),
        sa.Column('price_monthly', sa.Float(), nullable=False),
        sa.Column('price_yearly', sa.Float(), nullable=False),
        sa.Column('per_seat', sa.Boolean(), nullable=False),
        sa.Column('min_seats', sa.Integer(), nullable=False),
        sa.Column('max_seats', sa.Integer(), nullable=False),
        sa.Column('includes_inperson', sa.Boolean(), nullable=False),
        sa.Column('includes_exclusive', sa.Boolean(), nullable=False),
        sa.Column('highlight', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_learningplan_code', 'learningplan', ['code'], unique=True)

    op.create_table(
        'currencyrate',
        sa.Column('code', S(), nullable=False),
        sa.Column('label', S(), nullable=False),
        sa.Column('symbol', S(), nullable=False),
        sa.Column('rate', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('code'),
    )

    op.create_table(
        'learningsubscription',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reference', S(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('plan_code', S(), nullable=False),
        sa.Column('plan_name', S(), nullable=False),
        sa.Column('period', S(), nullable=False),
        sa.Column('seats', sa.Integer(), nullable=False),
        sa.Column('org_name', S(), nullable=True),
        sa.Column('amount_pivot', sa.Float(), nullable=False),
        sa.Column('pivot_currency', S(), nullable=False),
        sa.Column('display_currency', S(), nullable=False),
        sa.Column('includes_inperson', sa.Boolean(), nullable=False),
        sa.Column('includes_exclusive', sa.Boolean(), nullable=False),
        sa.Column('method', S(), nullable=False),
        sa.Column('phone_number', S(), nullable=True),
        sa.Column('provider_reference', S(), nullable=True),
        sa.Column('simulated', sa.Boolean(), nullable=False),
        sa.Column('status', S(), nullable=False),
        sa.Column('failure_reason', S(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('starts_at', sa.DateTime(), nullable=True),
        sa.Column('ends_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.ForeignKeyConstraint(['plan_id'], ['learningplan.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_learningsubscription_reference', 'learningsubscription', ['reference'], unique=True)
    op.create_index('ix_learningsubscription_user_id', 'learningsubscription', ['user_id'])
    op.create_index('ix_learningsubscription_status', 'learningsubscription', ['status'])

    op.create_table(
        'learningsubscriptionmember',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('subscription_id', sa.Integer(), nullable=False),
        sa.Column('email', S(), nullable=False),
        sa.Column('added_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['subscription_id'], ['learningsubscription.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_learningsubscriptionmember_subscription_id', 'learningsubscriptionmember', ['subscription_id'])
    op.create_index('ix_learningsubscriptionmember_email', 'learningsubscriptionmember', ['email'])


def downgrade() -> None:
    op.drop_table('learningsubscriptionmember')
    op.drop_table('learningsubscription')
    op.drop_table('currencyrate')
    op.drop_table('learningplan')
    with op.batch_alter_table('lesson') as batch:
        batch.drop_column('members_only')
    with op.batch_alter_table('course') as batch:
        batch.drop_column('members_only')
