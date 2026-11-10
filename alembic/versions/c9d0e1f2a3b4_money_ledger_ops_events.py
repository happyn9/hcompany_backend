"""H-Money : opérations fournisseur, événements, idempotence, grand livre, réserves

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
"""
import sqlalchemy as sa
from alembic import op
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _safe import add_col, has_col, has_table, has_index

revision = 'c9d0e1f2a3b4'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None

BIG = sa.BigInteger()
ACTIVE = "status IN ('initiated','pending','completed','unknown')"


def _ct(name, *cols):
    if not has_table(name):
        op.create_table(name, *cols)


def upgrade() -> None:
    legacy_done = has_table('moneyproviderop')
    add_col('moneytransfer', sa.Column('verify_needed', sa.Boolean(), nullable=False, server_default=sa.false()))
    add_col('moneytransfer', sa.Column('final_status', sa.String(), nullable=False, server_default=''))
    add_col('moneysettings', sa.Column('review_all', sa.Boolean(), nullable=False, server_default=sa.true()))
    _ct('moneyproviderop',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('transfer_code', sa.String(), nullable=False, index=True),
        sa.Column('kind', sa.String(), nullable=False), sa.Column('amount_minor', BIG, nullable=False), sa.Column('currency', sa.String(), nullable=False),
        sa.Column('country', sa.String(), nullable=False, server_default=''), sa.Column('operator', sa.String(), nullable=False, server_default=''),
        sa.Column('status', sa.String(), nullable=False, server_default='initiated', index=True), sa.Column('provider_ref', sa.String(), nullable=False, server_default=''),
        sa.Column('failure_reason', sa.String(), nullable=False, server_default=''), sa.Column('sim_status', sa.String(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False))
    if not has_index('moneyproviderop', 'uq_op_active'):
      op.create_index('uq_op_active', 'moneyproviderop', ['transfer_code', 'kind'], unique=True, sqlite_where=sa.text(ACTIVE), postgresql_where=sa.text(ACTIVE))
    _ct('moneyevent',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('provider', sa.String(), nullable=False), sa.Column('op_id', sa.String(), nullable=False, index=True),
        sa.Column('kind', sa.String(), nullable=False, server_default=''), sa.Column('status', sa.String(), nullable=False),
        sa.Column('transfer_code', sa.String(), nullable=False, server_default=''), sa.Column('signature_ok', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('detail', sa.String(), nullable=False, server_default=''), sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('provider', 'op_id', 'status', name='uq_money_event'))
    _ct('moneyidempotency',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False, index=True),
        sa.Column('scope', sa.String(), nullable=False), sa.Column('key', sa.String(), nullable=False), sa.Column('request_hash', sa.String(), nullable=False),
        sa.Column('state', sa.String(), nullable=False, server_default='processing'), sa.Column('status_code', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('response_json', sa.String(), nullable=False, server_default=''), sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'scope', 'key', name='uq_money_idem'))
    _ct('ledgerentry',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('journal_key', sa.String(), nullable=False, index=True), sa.Column('kind', sa.String(), nullable=False),
        sa.Column('transfer_code', sa.String(), nullable=False, server_default='', index=True), sa.Column('account', sa.String(), nullable=False, index=True),
        sa.Column('currency', sa.String(), nullable=False), sa.Column('debit_minor', BIG, nullable=False, server_default='0'), sa.Column('credit_minor', BIG, nullable=False, server_default='0'),
        sa.Column('memo', sa.String(), nullable=False, server_default=''), sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('journal_key', 'account', name='uq_ledger_line'))
    _ct('reservehold',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('transfer_code', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('currency', sa.String(), nullable=False, index=True), sa.Column('hold_minor', BIG, nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='active', index=True), sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('released_at', sa.DateTime(), nullable=True))
    _ct('moneyreserve',
        sa.Column('currency', sa.String(), primary_key=True), sa.Column('floor_minor', BIG, nullable=False, server_default='0'),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True), sa.Column('updated_at', sa.DateTime(), nullable=False))
    # Reprise des opérations déjà encaissées et en attente de contrôle : opération de collecte « completed » + journal J1, pour qu'elles puissent être versées ou remboursées
    if legacy_done:
        return
    op.execute("""INSERT INTO moneyproviderop (id, transfer_code, kind, amount_minor, currency, country, operator, status, provider_ref, failure_reason, sim_status, created_at, updated_at)
        SELECT 'legacy-' || code, code, 'collect', total_minor, send_currency, from_country, pay_operator, 'completed', provider_ref, '', '', created_at, created_at
        FROM moneytransfer WHERE status = 'under_review'""")
    op.execute("""INSERT INTO ledgerentry (journal_key, kind, transfer_code, account, currency, debit_minor, credit_minor, memo, created_at)
        SELECT code || '\\:J1', 'J1', code, 'PRV_' || send_currency, send_currency, total_minor, 0, 'reprise', created_at FROM moneytransfer WHERE status = 'under_review'""")
    op.execute("""INSERT INTO ledgerentry (journal_key, kind, transfer_code, account, currency, debit_minor, credit_minor, memo, created_at)
        SELECT code || '\\:J1', 'J1', code, 'DUE_' || send_currency, send_currency, 0, total_minor, 'reprise', created_at FROM moneytransfer WHERE status = 'under_review'""")


def downgrade() -> None:
    for t in ('moneyreserve', 'reservehold', 'ledgerentry', 'moneyidempotency', 'moneyevent'):
        op.drop_table(t)
    op.drop_index('uq_op_active', table_name='moneyproviderop')
    op.drop_table('moneyproviderop')
    op.drop_column('moneysettings', 'review_all')
    op.drop_column('moneytransfer', 'final_status')
    op.drop_column('moneytransfer', 'verify_needed')
