"""
StudyFlow AI — Database Initializer
─────────────────────────────────────────────────────────────
Handles two distinct startup behaviours depending on the
ENVIRONMENT / DEBUG setting:

  Development (DEBUG=True):
    Calls create_all() for convenience.  This lets a developer
    spin up the app against a fresh database without running
    Alembic manually.  Suitable for local work only.

  Production (DEBUG=False):
    Skips create_all().  Schema changes are owned exclusively by
    Alembic migrations; calling create_all() in production is
    dangerous because it cannot detect column additions, index
    changes, or data migrations.  Instead, we run a lightweight
    connectivity check to fail fast if the database is unreachable.

Model registration
───────────────────
All SQLAlchemy model modules must be imported here so their
metadata is registered on Base *before* any operation is
performed (create_all or Alembic autogenerate).

Add new model imports in the section below as each phase ships:
  Phase 1 — Auth:         app.api.auth.models        ✓ done
  Phase 2 — Profile:      app.api.profile.models     (add when implemented)
  Phase 2 — Providers:    app.api.providers.models   (add when implemented)
"""

import asyncio
import logging

from sqlalchemy import text

from core.config import get_settings
from database.base import Base, engine

logger = logging.getLogger(__name__)
settings = get_settings()


# ─── Model registration (import-only — do not remove) ─────────────────────────
# Each import registers the model's table metadata on Base.metadata so that
# create_all() and Alembic autogenerate can detect the full schema.

from app.api.auth import models as _auth_models  # noqa: F401, E402
from app.api.profile import models as _profile_models  # noqa: F401, E402
from app.api.providers import models as _provider_models  # noqa: F401, E402
from app.api.tasks import models as _task_models  # noqa: F401, E402
from app.api.ai import models as _ai_models  # noqa: F401, E402
from app.api.onboarding import models as _onboarding_models  # noqa: F401, E402


# ─── Initializer ──────────────────────────────────────────────────────────────

async def init_db() -> None:
    """
    Called once during application startup (lifespan).

    Development:  creates all tables that do not yet exist (idempotent).
    Production:   verifies database connectivity only.
                  Run `alembic upgrade head` before starting the server.
    """
    if settings.DEBUG:
        # ── Development: auto-create tables for convenience ────────────────
        logger.info(
            "DEBUG mode — running create_all() for convenience. "
            "Use Alembic migrations in production."
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables verified / created (development mode).")

    else:
        # ── Production: connectivity check only ───────────────────────────
        # Schema must already be up to date via: alembic upgrade head
        logger.info("Production mode — verifying database connectivity.")
        try:
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            logger.info("Database connectivity verified.")
        except Exception as exc:
            logger.critical(
                "Database connectivity check failed at startup: %s", exc,
                exc_info=True,
            )
            # Re-raise so the application refuses to start rather than
            # serving requests against an unreachable database.
            raise


# ─── CLI helper ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(init_db())
