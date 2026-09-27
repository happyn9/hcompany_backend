"""service subscriptions (client apps)

Revision ID: 9a1c4e2f7b3d
Revises: 67322a29f284
Create Date: 2026-09-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '9a1c4e2f7b3d'
down_revision: Union[str, None] = '67322a29f284'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'servicesubscription',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column(
            'service_key',
            sa.Enum(
                'h_transport_bus', 'h_transport_colis', 'h_logement', 'h_restaurant',
                'h_learning', 'h_money', 'h_translate', 'h_shopping',
                name='servicekey',
            ),
            nullable=False,
        ),
        sa.Column('message', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('requested', 'active', 'suspended', 'rejected', name='subscriptionstatus'),
            nullable=False,
        ),
        sa.Column('admin_note', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('activated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_servicesubscription_user_id'), 'servicesubscription', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_servicesubscription_user_id'), table_name='servicesubscription')
    op.drop_table('servicesubscription')
    op.execute('DROP TYPE IF EXISTS servicekey')
    op.execute('DROP TYPE IF EXISTS subscriptionstatus')
