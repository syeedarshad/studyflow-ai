"""
Phase 2.2 — Alembic Migration Tests
Verifies that Alembic migration upgrade() and downgrade() functions are correctly structured and defined.
"""

import importlib
import pytest


def test_phase4_alembic_migration_functions_exist():
    """Verifies that Phase 4 AI usage table migration script has callable upgrade() and downgrade() functions."""
    module = importlib.import_module(
        "migrations.versions.20260819_1900_add_ai_usage_logs_table"
    )

    assert hasattr(module, "upgrade"), "Migration script missing upgrade() function"
    assert hasattr(module, "downgrade"), "Migration script missing downgrade() function"
    assert callable(module.upgrade)
    assert callable(module.downgrade)
    assert module.revision == "b3c4d5e6f7a8"
    assert module.down_revision == "c3d4e5f6a7b8"
