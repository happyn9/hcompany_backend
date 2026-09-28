"""company training requests

Revision ID: d7e2b1f4a8c3
Revises: b4f7a1c9d2e6
Create Date: 2026-09-28 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd7e2b1f4a8c3'
down_revision: Union[str, None] = 'b4f7a1c9d2e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'companytrainingrequest',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('contact_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('contact_email', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('employee_count', sa.Integer(), nullable=False),
        sa.Column('domains', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('plan', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('monthly_price_per_employee', sa.Float(), nullable=False),
        sa.Column('estimated_total', sa.Float(), nullable=False),
        sa.Column('message', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('companytrainingrequest')
