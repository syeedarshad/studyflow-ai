"""
StudyFlow AI — Database Initializer
─────────────────────────────────────────────────────────────
Creates all tables on first startup.
In production use Alembic migrations for schema changes.
"""

import asyncio
import logging

from database.base import Base, engine

logger = logging.getLogger(__name__)


async def init_db() -> None:
    """Create all tables if they do not exist. Idempotent."""
    # Import all models so their table metadata is registered on Base.
    # This must happen before create_all().
    from app.api.auth import models as auth_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified / created.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(init_db())
