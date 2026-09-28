"""offer public_id for non-guessable payment URLs

Revision ID: f6a1c9e3b7d2
Revises: e54dfa99aa2c
Create Date: 2026-09-29 09:00:00.000000

"""
import secrets
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6a1c9e3b7d2'
down_revision: Union[str, None] = 'e54dfa99aa2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _generate_public_offer_id() -> str:
    # Même génération que app.models._generate_public_offer_id — un grand
    # nombre aléatoire (façon ID de profil Facebook), jamais un simple
    # auto-incrément, pour empêcher de deviner ou d'énumérer les offres
    # d'un autre partenaire depuis l'URL /paiement/....
    return "".join(secrets.choice("0123456789") for _ in range(18))


def upgrade() -> None:
    with op.batch_alter_table('offer', schema=None) as batch_op:
        batch_op.add_column(sa.Column('public_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # Backfill : chaque offre existante reçoit un identifiant public unique
    # généré côté Python (pas de fonction SQL portable pour un aléatoire
    # unique par ligne en une seule requête SQLite + Postgres).
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM offer")).fetchall()
    seen = set()
    for (offer_id,) in rows:
        pid = _generate_public_offer_id()
        while pid in seen:
            pid = _generate_public_offer_id()
        seen.add(pid)
        bind.execute(sa.text("UPDATE offer SET public_id = :pid WHERE id = :id"), {"pid": pid, "id": offer_id})

    with op.batch_alter_table('offer', schema=None) as batch_op:
        batch_op.alter_column('public_id', existing_type=sqlmodel.sql.sqltypes.AutoString(), nullable=False)
        batch_op.create_index('ix_offer_public_id', ['public_id'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('offer', schema=None) as batch_op:
        batch_op.drop_index('ix_offer_public_id')
        batch_op.drop_column('public_id')
