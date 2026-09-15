"""contact accounts, offers, contract terms, user profile

Revision ID: 44226f2a33b3
Revises: 1c3da842f3bc
Create Date: 2026-09-08 13:15:02.102433

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '44226f2a33b3'
down_revision: Union[str, None] = '1c3da842f3bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Type ENUM défini une seule fois ici et réutilisé partout dans ce fichier.
contactstatus_enum = sa.Enum('new', 'answered', name='contactstatus')


def upgrade() -> None:
    op.create_table('userprofile',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('company_size', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('primary_interest', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('referral_source', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )

    # PostgreSQL crée automatiquement les types ENUM utilisés par les
    # colonnes d'un op.create_table() — rien de spécial à faire ici.
    op.create_table('offer',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('partner_application_id', sa.Integer(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('price', sa.Float(), nullable=False),
    sa.Column('duration_months', sa.Integer(), nullable=False),
    sa.Column('payment_mode', sa.Enum('monthly', 'quarterly', 'annual', 'one_time', name='paymentmode'), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('status', sa.Enum('proposed', 'accepted', 'declined', name='offerstatus'), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['partner_application_id'], ['partnerapplication.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # ContactMessage existe déjà : on lui AJOUTE une colonne ENUM via ALTER
    # TABLE. Sur PostgreSQL, contrairement à create_table(), ce chemin ne
    # crée JAMAIS le type tout seul — on doit le créer nous-mêmes avant,
    # sinon "type contactstatus does not exist".
    bind = op.get_bind()
    contactstatus_enum.create(bind, checkfirst=True)

    with op.batch_alter_table('contactmessage', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'status',
            sa.Enum('new', 'answered', name='contactstatus', create_type=False),
            nullable=False,
            server_default='new',
        ))
        batch_op.add_column(sa.Column('admin_reply', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_contactmessage_user_id', 'user', ['user_id'], ['id'])

    with op.batch_alter_table('contactmessage', schema=None) as batch_op:
        batch_op.alter_column('status', server_default=None)

    # `paymentmode` a déjà été créé plus haut par op.create_table('offer', ...)
    # — on référence le même type sans le recréer (create_type=False),
    # sinon PostgreSQL refuserait avec "type already exists".
    with op.batch_alter_table('contract', schema=None) as batch_op:
        batch_op.add_column(sa.Column('duration_months', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column(
            'payment_mode',
            sa.Enum('monthly', 'quarterly', 'annual', 'one_time', name='paymentmode', create_type=False),
            nullable=True,
        ))
        batch_op.add_column(sa.Column('offer_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_contract_offer_id', 'offer', ['offer_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('contract', schema=None) as batch_op:
        batch_op.drop_constraint('fk_contract_offer_id', type_='foreignkey')
        batch_op.drop_column('offer_id')
        batch_op.drop_column('payment_mode')
        batch_op.drop_column('duration_months')

    with op.batch_alter_table('contactmessage', schema=None) as batch_op:
        batch_op.drop_constraint('fk_contactmessage_user_id', type_='foreignkey')
        batch_op.drop_column('user_id')
        batch_op.drop_column('admin_reply')
        batch_op.drop_column('status')

    bind = op.get_bind()
    contactstatus_enum.drop(bind, checkfirst=True)

    op.drop_table('offer')
    op.drop_table('userprofile')
    # `paymentmode`/`offerstatus` sont supprimés automatiquement par
    # op.drop_table('offer') sur PostgreSQL (symétrique de create_table).
