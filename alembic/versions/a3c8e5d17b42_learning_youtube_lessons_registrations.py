"""learning: youtube lessons, progress, in-person registrations

Revision ID: a3c8e5d17b42
Revises: f6a1c9e3b7d2
Create Date: 2026-10-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = 'a3c8e5d17b42'
down_revision: Union[str, None] = 'f6a1c9e3b7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('course') as batch:
        batch.add_column(sa.Column('category', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='Numérique'))
        batch.add_column(sa.Column('image_url', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch.add_column(sa.Column('youtube_playlist_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch.add_column(sa.Column('outcomes', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''))
        batch.add_column(sa.Column('requirements', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''))
        batch.add_column(sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('is_published', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column('synced_at', sa.DateTime(), nullable=True))

    op.create_table(
        'lesson',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('section', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('youtube_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('thumbnail_url', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('source', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('is_published', sa.Boolean(), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['course.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lesson_course_id', 'lesson', ['course_id'])
    op.create_index('ix_lesson_youtube_id', 'lesson', ['youtube_id'])

    op.create_table(
        'lessonprogress',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=False),
        sa.Column('completed', sa.Boolean(), nullable=False),
        sa.Column('position_seconds', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.ForeignKeyConstraint(['lesson_id'], ['lesson.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'lesson_id', name='uq_lessonprogress_user_lesson'),
    )
    op.create_index('ix_lessonprogress_user_id', 'lessonprogress', ['user_id'])
    op.create_index('ix_lessonprogress_lesson_id', 'lessonprogress', ['lesson_id'])

    op.create_table(
        'trainingregistration',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('full_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('phone', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('city', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('course_id', sa.Integer(), nullable=True),
        sa.Column('course_title', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('availability', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('message', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.ForeignKeyConstraint(['course_id'], ['course.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trainingregistration_user_id', 'trainingregistration', ['user_id'])
    op.create_index('ix_trainingregistration_email', 'trainingregistration', ['email'])


def downgrade() -> None:
    op.drop_table('trainingregistration')
    op.drop_table('lessonprogress')
    op.drop_table('lesson')
    with op.batch_alter_table('course') as batch:
        for col in ('synced_at', 'is_published', 'sort_order', 'requirements', 'outcomes',
                    'youtube_playlist_id', 'image_url', 'category'):
            batch.drop_column(col)
