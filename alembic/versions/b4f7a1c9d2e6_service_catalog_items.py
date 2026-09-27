"""service catalog items (DB-backed catalog + logos)

Revision ID: b4f7a1c9d2e6
Revises: 9a1c4e2f7b3d
Create Date: 2026-09-26 00:00:00.000000

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'b4f7a1c9d2e6'
down_revision: Union[str, None] = '9a1c4e2f7b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Catalogue de départ — reprend les 8 services précédemment codés en dur
# dans routers/services.py, avec un logo placeholder généré (voir
# scripts/generate_service_logos.py) pour chacun. H-Money reste désactivé
# (transfert d'argent pas encore disponible).
SEED_ITEMS = [
    ("h_transport_bus", "H-Transport (Bus)", "H-Transport (Bus)",
     "Réservez vos trajets en bus entre la RDC et la Zambie.",
     "Book your bus trips between the DRC and Zambia.",
     "service-logos/h_transport_bus.svg", False, 0),
    ("h_transport_colis", "H-Transport (Colis)", "H-Transport (Parcels)",
     "Envoyez et suivez vos colis en toute simplicité.",
     "Send and track your parcels with ease.",
     "service-logos/h_transport_colis.svg", False, 1),
    ("h_logement", "H-Logement", "H-Lodging",
     "Réservez un hébergement chez nos partenaires.",
     "Book accommodation with our partners.",
     "service-logos/h_logement.svg", False, 2),
    ("h_restaurant", "H-Restaurant", "H-Restaurant",
     "Commandez ou réservez une table chez nos restaurants partenaires.",
     "Order or book a table at our partner restaurants.",
     "service-logos/h_restaurant.svg", False, 3),
    ("h_learning", "H-Learning", "H-Learning",
     "Accédez à nos formations et cours en ligne.",
     "Access our online courses and training programs.",
     "service-logos/h_learning.svg", False, 4),
    ("h_money", "H-Money", "H-Money",
     "Envoi et réception d'argent entre la RDC et la Zambie.",
     "Send and receive money between the DRC and Zambia.",
     "service-logos/h_money.svg", True, 5),
    ("h_translate", "H-Translate", "H-Translate",
     "Service d'interprétation et de traduction.",
     "Interpretation and translation services.",
     "service-logos/h_translate.svg", False, 6),
    ("h_shopping", "H-Shopping", "H-Shopping",
     "Achetez auprès de nos boutiques partenaires.",
     "Shop at our partner stores.",
     "service-logos/h_shopping.svg", False, 7),
]


def upgrade() -> None:
    op.create_table(
        'servicecatalogitem',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('label_fr', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('label_en', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('description_fr', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('description_en', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('logo_path', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('disabled', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_servicecatalogitem_key'), 'servicecatalogitem', ['key'], unique=True)

    catalog_table = sa.table(
        'servicecatalogitem',
        sa.column('key', sqlmodel.sql.sqltypes.AutoString()),
        sa.column('label_fr', sqlmodel.sql.sqltypes.AutoString()),
        sa.column('label_en', sqlmodel.sql.sqltypes.AutoString()),
        sa.column('description_fr', sqlmodel.sql.sqltypes.AutoString()),
        sa.column('description_en', sqlmodel.sql.sqltypes.AutoString()),
        sa.column('logo_path', sqlmodel.sql.sqltypes.AutoString()),
        sa.column('disabled', sa.Boolean()),
        sa.column('sort_order', sa.Integer()),
        sa.column('created_at', sa.DateTime()),
        sa.column('updated_at', sa.DateTime()),
    )
    now = datetime.utcnow()
    op.bulk_insert(
        catalog_table,
        [
            {
                "key": key, "label_fr": label_fr, "label_en": label_en,
                "description_fr": desc_fr, "description_en": desc_en,
                "logo_path": logo_path, "disabled": disabled, "sort_order": sort_order,
                "created_at": now, "updated_at": now,
            }
            for key, label_fr, label_en, desc_fr, desc_en, logo_path, disabled, sort_order in SEED_ITEMS
        ],
    )

    # service_key passe d'un enum fermé ('servicekey') à une chaîne libre —
    # ServiceSubscription référence désormais ServiceCatalogItem.key de
    # façon souple, pour permettre à l'admin d'ajouter de nouveaux services
    # sans nouvelle migration. batch_alter_table pour rester compatible
    # SQLite (dev) et PostgreSQL (prod).
    with op.batch_alter_table('servicesubscription', schema=None) as batch_op:
        batch_op.alter_column(
            'service_key',
            existing_type=sa.Enum(
                'h_transport_bus', 'h_transport_colis', 'h_logement', 'h_restaurant',
                'h_learning', 'h_money', 'h_translate', 'h_shopping',
                name='servicekey',
            ),
            type_=sqlmodel.sql.sqltypes.AutoString(),
            existing_nullable=False,
        )
    # DROP TYPE n'existe qu'en PostgreSQL — SQLite (dev) n'a pas de vrai type
    # enum créé séparément, donc rien à supprimer là-bas.
    if op.get_bind().dialect.name == "postgresql":
        op.execute('DROP TYPE IF EXISTS servicekey')


def downgrade() -> None:
    with op.batch_alter_table('servicesubscription', schema=None) as batch_op:
        batch_op.alter_column(
            'service_key',
            existing_type=sqlmodel.sql.sqltypes.AutoString(),
            type_=sa.Enum(
                'h_transport_bus', 'h_transport_colis', 'h_logement', 'h_restaurant',
                'h_learning', 'h_money', 'h_translate', 'h_shopping',
                name='servicekey',
            ),
            existing_nullable=False,
        )
    op.drop_index(op.f('ix_servicecatalogitem_key'), table_name='servicecatalogitem')
    op.drop_table('servicecatalogitem')
