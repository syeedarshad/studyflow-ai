"""Add ai_usage_logs table for server-side AI quota tracking

Revision ID: b3c4d5e6f7a8
Revises: 720a5b3f9c12
Create Date: 2026-08-19 19:00:00.000000

This migration:
  - Creates ai_usage_logs table for per-user AI quota tracking
  - Does NOT modify or drop existing tables (provider_keys is preserved)
  - Safe to run on production without data loss

NOTE: Find the correct down_revision by running:
  alembic heads
and replace the placeholder below with the actual head revision.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'   # Phase 3 tasks migration
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Create ai_usage_logs table ###
    op.create_table(
        'ai_usage_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=True),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('tokens_used', sa.Integer(), nullable=True),
        sa.Column('error_code', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_ai_usage_logs_user_id',
        'ai_usage_logs',
        ['user_id'],
        unique=False,
    )
    op.create_index(
        'ix_ai_usage_logs_user_date',
        'ai_usage_logs',
        ['user_id', 'requested_at'],
        unique=False,
    )


def downgrade() -> None:
    # ### Drop ai_usage_logs table ###
    op.drop_index('ix_ai_usage_logs_user_date', table_name='ai_usage_logs')
    op.drop_index('ix_ai_usage_logs_user_id', table_name='ai_usage_logs')
    op.drop_table('ai_usage_logs')
