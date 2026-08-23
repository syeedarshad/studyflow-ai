"""Phase 3 Tasks Architecture table

Revision ID: c3d4e5f6a7b8
Revises: a2b3c4d5e6f7
Create Date: 2026-08-18 17:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Create tasks table ###
    op.create_table(
        'tasks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False, server_default='Revision'),
        sa.Column('priority', sa.String(length=20), nullable=False, server_default='medium'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('xp_reward', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('due_date', sa.String(length=10), nullable=True),
        sa.Column('reminder_time', sa.String(length=50), nullable=True),
        sa.Column('is_recurring', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('recurrence_pattern', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('estimated_minutes', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('goal_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tasks_user_id'), 'tasks', ['user_id'], unique=False)
    op.create_index('ix_tasks_user_status', 'tasks', ['user_id', 'status'], unique=False)
    op.create_index('ix_tasks_user_due_date', 'tasks', ['user_id', 'due_date'], unique=False)
    op.create_index('ix_tasks_user_goal_id', 'tasks', ['user_id', 'goal_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_tasks_user_goal_id', table_name='tasks')
    op.drop_index('ix_tasks_user_due_date', table_name='tasks')
    op.drop_index('ix_tasks_user_status', table_name='tasks')
    op.drop_index(op.f('ix_tasks_user_id'), table_name='tasks')
    op.drop_table('tasks')
