"""
StudyFlow AI — Shared FastAPI Dependencies
─────────────────────────────────────────────────────────────
Single import point for authentication dependencies.

All feature modules (Profile, Providers, etc.) import from here
rather than directly from app.api.auth.dependencies.  This
decouples module internals from the auth package structure and
makes future refactoring easier — only this file needs to change
if auth internals move.

Usage in feature routers:
    from app.common.dependencies import require_auth, CurrentAuth

    @router.get("/profile")
    async def get_profile(
        auth: CurrentAuth = Depends(require_auth),
        db:   AsyncSession = Depends(get_db),
    ) -> ...:
        ...

    @router.delete("/admin/resource")
    async def admin_action(
        auth: CurrentAuth = Depends(require_admin),
    ) -> ...:
        ...
"""

# Re-export every auth dependency type and guard so downstream feature
# modules never import directly from app.api.auth.
from app.api.auth.dependencies import (  # noqa: F401
    CurrentAuth,
    optional_auth,
    require_admin,
    require_auth,
)

# Re-export the database session dependency for convenience.
from database.base import get_db  # noqa: F401

__all__ = [
    # Auth guards
    "require_auth",
    "require_admin",
    "optional_auth",
    # Auth context type
    "CurrentAuth",
    # DB session
    "get_db",
]
