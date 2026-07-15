"""
StudyFlow AI — Auth Dependencies
─────────────────────────────────────────────────────────────
FastAPI dependency functions for authentication.

Usage in routes:
    @router.get("/me")
    async def get_me(
        auth: CurrentAuth = Depends(require_auth),
    ):
        return auth.user

    @router.get("/admin-only")
    async def admin_endpoint(
        auth: CurrentAuth = Depends(require_admin),
    ):
        ...
"""

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import Session, User
from app.api.auth.service import AuthService
from database.base import get_db


@dataclass
class CurrentAuth:
    """Container returned by the require_auth dependency."""
    user: User
    session: Session


def _extract_token(request: Request) -> Optional[str]:
    """
    Extracts the session token from the Authorization header.

    Electron sends:   Authorization: Bearer <token>
    Also supports:    X-Session-Token: <token>  (fallback for non-standard clients)
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip() or None

    # Fallback header (useful in desktop IPC bridge scenarios)
    token = request.headers.get("X-Session-Token", "").strip()
    return token or None


async def require_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CurrentAuth:
    """
    Validates the session token and returns (user, session).
    Raises HTTP 401 if the token is missing, invalid, or revoked.
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )

    service = AuthService(db)
    user, session = await service.validate_session_token(token)
    return CurrentAuth(user=user, session=session)


async def require_admin(
    auth: CurrentAuth = Depends(require_auth),
) -> CurrentAuth:
    """Additional guard for admin-only endpoints."""
    if not auth.user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required.",
        )
    return auth


async def optional_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[CurrentAuth]:
    """
    Like require_auth but returns None instead of raising 401 if not authenticated.
    Useful for endpoints that work both authenticated and unauthenticated.
    """
    token = _extract_token(request)
    if not token:
        return None
    try:
        service = AuthService(db)
        user, session = await service.validate_session_token(token)
        return CurrentAuth(user=user, session=session)
    except HTTPException:
        return None
