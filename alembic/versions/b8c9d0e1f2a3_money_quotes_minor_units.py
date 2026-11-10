"""H-Money : devis persistants et montants en unités mineures entières

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
"""
import sqlalchemy as sa
from alembic import op
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _safe import add_col, has_col, has_table, has_index

revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None

BIG = sa.BigInteger()


def upgrade() -> None:
    fresh = not has_col('moneytransfer', 'send_minor')
    for col in ('send_minor', 'fee_minor', 'total_minor', 'receive_minor', 'requested_minor'):
        add_col('moneytransfer', sa.Column(col, BIG, nullable=False, server_default='0'))
    add_col('moneytransfer', sa.Column('quote_id', sa.String(), nullable=False, server_default=''))
    add_col('moneytransfer', sa.Column('rate_k', sa.String(), nullable=False, server_default=''))
    add_col('moneytransfer', sa.Column('request_type', sa.String(), nullable=False, server_default=''))
    add_col('moneytransfer', sa.Column('requested_currency', sa.String(), nullable=False, server_default=''))
    add_col('moneytransfer', sa.Column('amount_side', sa.String(), nullable=False, server_default=''))
    if not has_index('moneytransfer', 'ix_moneytransfer_quote_id'):
        op.create_index('ix_moneytransfer_quote_id', 'moneytransfer', ['quote_id'])
    # Reprise de l'existant : centimes = arrondi des anciens montants float (une seule fois)
    # (seulement si les colonnes viennent d'être créées : on n'écrase jamais des montants déjà repris)
    pairs = (('send_minor', 'send_amount'), ('fee_minor', 'fee'), ('total_minor', 'total_paid'), ('receive_minor', 'receive_amount')) if fresh else ()
    for new, old in pairs:
        op.execute(f"UPDATE moneytransfer SET {new} = CAST(ROUND({old} * 100) AS BIGINT)")
    if has_table('moneyquote'):
        return
    op.create_table('moneyquote',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False, index=True),
        sa.Column('kind', sa.String(), nullable=False), sa.Column('direction', sa.String(), nullable=False), sa.Column('mode', sa.String(), nullable=False),
        sa.Column('request_type', sa.String(), nullable=False, server_default=''),
        sa.Column('from_country', sa.String(), nullable=False), sa.Column('to_country', sa.String(), nullable=False),
        sa.Column('pay_currency', sa.String(), nullable=False), sa.Column('receive_currency', sa.String(), nullable=False),
        sa.Column('send_minor', BIG, nullable=False), sa.Column('fee_minor', BIG, nullable=False), sa.Column('total_minor', BIG, nullable=False), sa.Column('receive_minor', BIG, nullable=False),
        sa.Column('rate_k', sa.String(), nullable=False), sa.Column('market_mid', sa.String(), nullable=False),
        sa.Column('fee_pct', sa.String(), nullable=False, server_default=''), sa.Column('margin', sa.String(), nullable=False, server_default=''),
        sa.Column('pay_operator', sa.String(), nullable=False, server_default=''), sa.Column('receive_operator', sa.String(), nullable=False, server_default=''),
        sa.Column('provider_cost_minor', BIG, nullable=False, server_default='0'), sa.Column('net_minor', BIG, nullable=False, server_default='0'),
        sa.Column('params_json', sa.String(), nullable=False, server_default='{}'), sa.Column('transfer_code', sa.String(), nullable=False, server_default=''),
        sa.Column('status', sa.String(), nullable=False, server_default='open', index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('expires_at', sa.DateTime(), nullable=False))


def downgrade() -> None:
    op.drop_table('moneyquote')
    op.drop_index('ix_moneytransfer_quote_id', table_name='moneytransfer')
    for col in ('amount_side', 'requested_currency', 'request_type', 'rate_k', 'quote_id', 'requested_minor', 'receive_minor', 'total_minor', 'fee_minor', 'send_minor'):
        op.drop_column('moneytransfer', col)
