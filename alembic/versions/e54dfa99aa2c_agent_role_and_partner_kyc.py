"""agent role and partner application KYC fields

Revision ID: e54dfa99aa2c
Revises: d7e2b1f4a8c3
Create Date: 2026-09-28 22:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e54dfa99aa2c'
down_revision: Union[str, None] = 'd7e2b1f4a8c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

agentreviewstatus_enum = sa.Enum('pending', 'forwarded', 'rejected', name='agentreviewstatus')


def upgrade() -> None:
    # --- user.role : "agent" ajouté au rôle ---
    # Plutôt que d'altérer le type ENUM Postgres existant (ALTER TYPE ...
    # ADD VALUE a des contraintes de transaction gênantes), on suit le même
    # principe déjà appliqué à ServiceSubscription.service_key : on convertit
    # la colonne en chaîne libre. batch_alter_table pour rester compatible
    # SQLite (dev) et PostgreSQL (prod).
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column(
            'role',
            existing_type=sa.Enum('admin', 'partner', 'client', name='userrole'),
            type_=sqlmodel.sql.sqltypes.AutoString(),
            existing_nullable=False,
        )
    if op.get_bind().dialect.name == "postgresql":
        op.execute('DROP TYPE IF EXISTS userrole')

    # --- partnerapplication : dossier KYC + revue agent ---
    bind = op.get_bind()
    agentreviewstatus_enum.create(bind, checkfirst=True)

    with op.batch_alter_table('partnerapplication', schema=None) as batch_op:
        batch_op.add_column(sa.Column('phone', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('address', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('id_document_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('id_document_number', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('id_document_path', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column(
            'agent_review_status',
            sa.Enum('pending', 'forwarded', 'rejected', name='agentreviewstatus', create_type=False),
            nullable=False,
            server_default='pending',
        ))
        batch_op.add_column(sa.Column('agent_review_note', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('agent_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('agent_reviewed_at', sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            'fk_partnerapplication_agent_id_user', 'user', ['agent_id'], ['id']
        )

    with op.batch_alter_table('partnerapplication', schema=None) as batch_op:
        batch_op.alter_column('agent_review_status', server_default=None)

    # Candidatures déjà approuvées/rejetées avant cette migration : on les
    # marque comme "forwarded" pour ne pas les coincer derrière la nouvelle
    # règle (admin_update_status exige agent_review_status == forwarded
    # pour toute NOUVELLE approbation, mais ces dossiers sont déjà tranchés).
    op.execute(
        "UPDATE partnerapplication SET agent_review_status = 'forwarded' "
        "WHERE status = 'approved'"
    )


def downgrade() -> None:
    with op.batch_alter_table('partnerapplication', schema=None) as batch_op:
        batch_op.drop_constraint('fk_partnerapplication_agent_id_user', type_='foreignkey')
        batch_op.drop_column('agent_reviewed_at')
        batch_op.drop_column('agent_id')
        batch_op.drop_column('agent_review_note')
        batch_op.drop_column('agent_review_status')
        batch_op.drop_column('id_document_path')
        batch_op.drop_column('id_document_number')
        batch_op.drop_column('id_document_type')
        batch_op.drop_column('address')
        batch_op.drop_column('phone')

    bind = op.get_bind()
    agentreviewstatus_enum.drop(bind, checkfirst=True)

    userrole_enum = sa.Enum('admin', 'partner', 'client', name='userrole')
    if bind.dialect.name == "postgresql":
        userrole_enum.create(bind, checkfirst=True)
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column(
            'role',
            existing_type=sqlmodel.sql.sqltypes.AutoString(),
            type_=sa.Enum('admin', 'partner', 'client', name='userrole', create_type=False),
            existing_nullable=False,
        )
