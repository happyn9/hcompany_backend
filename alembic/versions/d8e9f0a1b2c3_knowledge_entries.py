"""assistante apprenante : paires question/réponse apprises

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
"""
import sqlalchemy as sa
from alembic import op

revision = 'd8e9f0a1b2c3'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('knowledgeentry',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('question', sa.String(), nullable=False), sa.Column('answer', sa.String(), nullable=False),
        sa.Column('lang', sa.String(), nullable=False), sa.Column('source', sa.String(), nullable=False),
        sa.Column('uses', sa.Integer(), nullable=False), sa.Column('helpful', sa.Integer(), nullable=False), sa.Column('unhelpful', sa.Integer(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False), sa.Column('thread_code', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False))
    op.create_index('ix_knowledgeentry_lang', 'knowledgeentry', ['lang'])
    op.create_index('ix_knowledgeentry_source', 'knowledgeentry', ['source'])
    op.create_index('ix_knowledgeentry_active', 'knowledgeentry', ['active'])
    op.create_index('ix_knowledgeentry_thread_code', 'knowledgeentry', ['thread_code'])


def downgrade() -> None:
    op.drop_table('knowledgeentry')
