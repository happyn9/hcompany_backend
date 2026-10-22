"""partner modules and qr login

Revision ID: f4b2c8d1a9e6
Revises: e3a1b7c9d4f2
Create Date: 2026-10-21 14:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'f4b2c8d1a9e6'
down_revision: Union[str, None] = 'e3a1b7c9d4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('partnermodule',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('module', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('activated_at', sa.DateTime(), nullable=False),
    sa.Column('deactivated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('partnermodule', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_partnermodule_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_partnermodule_module'), ['module'], unique=False)

    op.create_table('qrsession',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('secret_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('device_label', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('qrsession', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_qrsession_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_qrsession_status'), ['status'], unique=False)

    # Les partenaires déjà approuvés qui ont déjà un profil gardent l'accès :
    # on active d'office les modules correspondants.
    conn = op.get_bind()
    for module, table, col in (("lodging", "lodgehost", "user_id"), ("transport", "transportoperator", "user_id"), ("shopping", "shop", "owner_id")):
        conn.execute(sa.text(
            f"INSERT INTO partnermodule (user_id, module, active, activated_at) "
            f"SELECT DISTINCT {col}, :m, :a, CURRENT_TIMESTAMP FROM {table}"
        ), {"m": module, "a": True})


def downgrade() -> None:
    with op.batch_alter_table('qrsession', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_qrsession_status'))
        batch_op.drop_index(batch_op.f('ix_qrsession_code'))
    op.drop_table('qrsession')
    with op.batch_alter_table('partnermodule', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_partnermodule_module'))
        batch_op.drop_index(batch_op.f('ix_partnermodule_user_id'))
    op.drop_table('partnermodule')
