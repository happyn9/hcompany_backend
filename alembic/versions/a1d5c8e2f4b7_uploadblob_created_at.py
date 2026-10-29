"""uploadblob.created_at (délai de grâce du nettoyage des images orphelines)

Revision ID: a1d5c8e2f4b7
Revises: f3b8c6d2e4a7
Create Date: 2026-10-29 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1d5c8e2f4b7'
down_revision: Union[str, None] = 'f3b8c6d2e4a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in sa.inspect(bind).get_columns("uploadblob")]
    if "created_at" in cols:  # idempotent
        return
    # 1) colonne nullable sans défaut (SQLite refuse un défaut non constant dans ALTER TABLE)
    op.add_column("uploadblob", sa.Column("created_at", sa.DateTime(), nullable=True))
    # 2) les fichiers existants reçoivent la date du déploiement : le délai de grâce court
    #    à partir de maintenant, rien n'est supprimé avant plusieurs jours.
    op.execute("UPDATE uploadblob SET created_at = CURRENT_TIMESTAMP")
    # 3) PostgreSQL : on verrouille la colonne (NOT NULL + défaut) ; SQLite reste nullable (le modèle fournit la date).
    if bind.dialect.name == "postgresql":
        op.alter_column("uploadblob", "created_at", nullable=False, server_default=sa.text("now()"))


def downgrade() -> None:
    op.drop_column("uploadblob", "created_at")
