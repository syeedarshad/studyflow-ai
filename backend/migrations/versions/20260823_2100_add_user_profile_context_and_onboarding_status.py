"""Add user_profile_context table and users.onboarding_status

Revision ID: d4e5f6a7b8c9
Revises: b3c4d5e6f7a8
Create Date: 2026-08-23 21:00:00.000000

This migration:
  - Adds onboarding_status column to users table
  - Creates user_profile_context table for canonical user profile / RAG knowledge
  - Adds performance and multi-tenant isolation indexes
  - Safe to run without data loss
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add onboarding_status to users table
    op.add_column(
        'users',
        sa.Column('onboarding_status', sa.String(length=30), server_default='not_started', nullable=False)
    )

    # 2. Create user_profile_context table
    op.create_table(
        'user_profile_context',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('original_content', sa.Text(), nullable=True),
        sa.Column('extracted_summary', sa.Text(), nullable=True),
        sa.Column('context_metadata', sa.JSON(), server_default='{}', nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=30), server_default='completed', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 3. Create indexes
    op.create_index(
        'ix_user_profile_context_user_id',
        'user_profile_context',
        ['user_id'],
        unique=False
    )
    op.create_index(
        'ix_user_profile_context_user_source',
        'user_profile_context',
        ['user_id', 'source_type'],
        unique=False
    )
    op.create_index(
        'ix_user_profile_context_user_created',
        'user_profile_context',
        ['user_id', 'created_at'],
        unique=False
    )
    op.create_index(
        'ix_user_profile_context_user_hash',
        'user_profile_context',
        ['user_id', 'content_hash'],
        unique=False
    )


def downgrade() -> None:
    # 1. Drop indexes and table
    op.drop_index('ix_user_profile_context_user_hash', table_name='user_profile_context')
    op.drop_index('ix_user_profile_context_user_created', table_name='user_profile_context')
    op.drop_index('ix_user_profile_context_user_source', table_name='user_profile_context')
    op.drop_index('ix_user_profile_context_user_id', table_name='user_profile_context')
    op.drop_table('user_profile_context')

    # 2. Drop onboarding_status from users
    op.drop_column('users', 'onboarding_status')
