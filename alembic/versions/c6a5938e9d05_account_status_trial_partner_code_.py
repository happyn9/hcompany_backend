"""account status, trial, partner code, password change

Revision ID: c6a5938e9d05
Revises: 44226f2a33b3
Create Date: 2026-09-09 12:24:19.709282

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'c6a5938e9d05'
down_revision: Union[str, None] = '44226f2a33b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Type ENUM créé explicitement une seule fois — PostgreSQL ne le crée
# jamais tout seul pour un ALTER TABLE sur une table existante (seulement
# pour un CREATE TABLE). Voir la migration précédente pour le même piège.
accountstatus_enum = sa.Enum('active', 'disabled', 'blocked', name='accountstatus')


def upgrade() -> None:
    bind = op.get_bind()
    accountstatus_enum.create(bind, checkfirst=True)

    with op.batch_alter_table('user', schema=None) as batch_op:
        # server_default obligatoire : la colonne est NOT NULL et la table
        # contient déjà des lignes (les comptes existants doivent recevoir
        # une valeur par défaut, pas juste les nouveaux).
        batch_op.add_column(sa.Column(
            'account_status',
            sa.Enum('active', 'disabled', 'blocked', name='accountstatus', create_type=False),
            nullable=False,
            server_default='active',
        ))
        batch_op.add_column(sa.Column('partner_code', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('trial_ends_at', sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f('ix_user_partner_code'), ['partner_code'], unique=True)

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('account_status', server_default=None)


def downgrade() -> None:
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_partner_code'))
        batch_op.drop_column('trial_ends_at')
        batch_op.drop_column('partner_code')
        batch_op.drop_column('account_status')

    bind = op.get_bind()
    accountstatus_enum.drop(bind, checkfirst=True)
