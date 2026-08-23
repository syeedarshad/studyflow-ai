"""
StudyFlow AI — Alembic Migration Environment
─────────────────────────────────────────────────────────────
Reads the DATABASE_SYNC_URL from settings and registers all
model metadata so autogenerate can detect schema changes.
"""

import sys
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make sure the backend package root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.config import get_settings
from database.base import Base

# Import all models so their metadata is registered for autogenerate.
from app.api.auth import models as auth_models  # noqa: F401
from app.api.profile import models as profile_models  # noqa: F401
from app.api.providers import models as provider_models  # noqa: F401
from app.api.tasks import models as task_models  # noqa: F401

config = context.config
settings = get_settings()

# Override the sqlalchemy.url with the sync URL from our settings
# Escape '%' to '%%' because Alembic's configparser interprets '%' as interpolation
escaped_url = settings.DATABASE_SYNC_URL.replace("%", "%%")
config.set_main_option("sqlalchemy.url", escaped_url)

# Set up Python logging from the alembic.ini [loggers] section
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL scripts without a live DB connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply migrations against the live database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
