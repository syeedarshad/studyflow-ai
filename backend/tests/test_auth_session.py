"""
Phase 2.1 — Session Tests
Tests for GET /session, GET /me, GET /sessions, DELETE /sessions/{id}

Includes negative security tests: malformed headers, empty tokens,
revoked tokens, cross-user revocation attempts.
"""
import pytest
from sqlalchemy import select

from app.api.auth.models import Session
from tests.conftest import make_unique_email, register_user, login_user, auth_header


# ── GET /auth/session — Valid ─────────────────────────────────────────────────

async def test_validate_session_success(async_client):
    """GET /session returns 200 with user data for a valid token."""
    user = await register_user(async_client, email=make_unique_email("sess_ok"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/auth/session", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["user"]["email"] == user["email"]
    assert data["user"]["id"] == user["user_id"]


# ── GET /auth/session — Missing Token ─────────────────────────────────────────

async def test_validate_session_no_token_401(async_client):
    """GET /session returns 401 when no Authorization header is sent."""
    resp = await async_client.get("/api/v1/auth/session")
    assert resp.status_code == 401


# ── GET /auth/session — Invalid Token ─────────────────────────────────────────

async def test_validate_session_invalid_token_401(async_client):
    """GET /session returns 401 for a garbage token."""
    resp = await async_client.get(
        "/api/v1/auth/session",
        headers={"Authorization": "Bearer completelyfaketoken12345678"},
    )
    assert resp.status_code == 401


# ── Negative Security: Malformed Authorization Header ─────────────────────────

async def test_validate_session_malformed_auth_header_401(async_client):
    """401 when Authorization header does not start with 'Bearer '."""
    resp = await async_client.get(
        "/api/v1/auth/session",
        headers={"Authorization": "Token some_random_token"},
    )
    assert resp.status_code == 401


async def test_validate_session_empty_bearer_401(async_client):
    """401 when Authorization header is 'Bearer ' with nothing after it."""
    resp = await async_client.get(
        "/api/v1/auth/session",
        headers={"Authorization": "Bearer "},
    )
    assert resp.status_code == 401


async def test_validate_session_bearer_only_401(async_client):
    """401 when Authorization header is just 'Bearer' with no space/token."""
    resp = await async_client.get(
        "/api/v1/auth/session",
        headers={"Authorization": "Bearer"},
    )
    assert resp.status_code == 401


# ── GET /auth/session — Revoked Token ─────────────────────────────────────────

async def test_validate_session_after_logout_401(async_client):
    """GET /session returns 401 after the token has been logged out."""
    user = await register_user(async_client, email=make_unique_email("sess_revoked"))
    headers = auth_header(user["session_token"])

    await async_client.post("/api/v1/auth/logout", headers=headers)
    resp = await async_client.get("/api/v1/auth/session", headers=headers)
    assert resp.status_code == 401


# ── GET /auth/me ──────────────────────────────────────────────────────────────

async def test_get_me_success(async_client):
    """GET /me returns current user profile with all expected fields."""
    user = await register_user(async_client, email=make_unique_email("me_ok"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == user["email"]
    assert data["full_name"] == user["full_name"]
    assert "id" in data
    assert "is_active" in data
    assert "is_verified" in data
    assert "password_hash" not in resp.text


async def test_get_me_no_auth_401(async_client):
    """GET /me requires authentication."""
    resp = await async_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ── GET /auth/sessions ────────────────────────────────────────────────────────

async def test_list_sessions_success(async_client):
    """GET /sessions returns a list containing at least the current session."""
    user = await register_user(async_client, email=make_unique_email("sess_list"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/auth/sessions", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert isinstance(data["sessions"], list)
    assert len(data["sessions"]) >= 1
    # Verify session schema has required fields
    session = data["sessions"][0]
    assert "id" in session
    assert "is_active" in session
    assert "created_at" in session


async def test_list_sessions_no_auth_401(async_client):
    """GET /sessions requires authentication."""
    resp = await async_client.get("/api/v1/auth/sessions")
    assert resp.status_code == 401


# ── DELETE /auth/sessions/{id} — Revoke Own Session ───────────────────────────

async def test_revoke_own_session(async_client):
    """DELETE /sessions/{id} successfully revokes a session belonging to the user."""
    user = await register_user(async_client, email=make_unique_email("sess_revoke"))
    headers1 = auth_header(user["session_token"])

    # Log in a second time to get another session
    login = await login_user(async_client, user["email"], user["password"])
    assert login["status_code"] == 200
    token2 = login["data"]["session_token"]
    headers2 = auth_header(token2)

    # List sessions using second token and find the first session's ID
    list_resp = await async_client.get("/api/v1/auth/sessions", headers=headers2)
    sessions = list_resp.json()["sessions"]
    # Find the session that is NOT the new login session
    first_session_id = sessions[0]["id"]

    # Revoke it
    del_resp = await async_client.delete(
        f"/api/v1/auth/sessions/{first_session_id}",
        headers=headers2,
    )
    assert del_resp.status_code == 200

    # Verify the revoked session's token is no longer usable
    check_resp = await async_client.get("/api/v1/auth/session", headers=headers1)
    assert check_resp.status_code == 401


# ── DELETE /auth/sessions/{id} — Cannot Revoke Another User's Session ────────

async def test_revoke_other_users_session_404(async_client):
    """Attempting to revoke another user's session returns 404."""
    user_a = await register_user(async_client, email=make_unique_email("sess_a"))
    user_b = await register_user(async_client, email=make_unique_email("sess_b"))

    # Get user A's session ID
    headers_a = auth_header(user_a["session_token"])
    list_a = await async_client.get("/api/v1/auth/sessions", headers=headers_a)
    session_a_id = list_a.json()["sessions"][0]["id"]

    # User B tries to revoke user A's session
    headers_b = auth_header(user_b["session_token"])
    resp = await async_client.delete(
        f"/api/v1/auth/sessions/{session_a_id}",
        headers=headers_b,
    )
    assert resp.status_code == 404


async def test_revoke_nonexistent_session_404(async_client):
    """DELETE /sessions/{id} returns 404 for a non-existent session ID."""
    user = await register_user(async_client, email=make_unique_email("sess_noexist"))
    headers = auth_header(user["session_token"])

    resp = await async_client.delete("/api/v1/auth/sessions/999999", headers=headers)
    assert resp.status_code == 404


# ── Session Expiry (SERVICE_TOKEN_LIFETIME_SECONDS > 0) ───────────────────────

async def test_expired_session_returns_401(async_client, db):
    """When SESSION_TOKEN_LIFETIME_SECONDS > 0 and session is older, returns 401."""
    from unittest.mock import patch
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update as sa_update
    from app.api.auth.models import Session as SessionModel

    user = await register_user(async_client, email=make_unique_email("sess_exp"))
    headers = auth_header(user["session_token"])

    # Force the session's created_at to be far in the past
    past = datetime.now(timezone.utc) - timedelta(days=365)
    await db.execute(
        sa_update(SessionModel)
        .where(SessionModel.user_id == user["user_id"])
        .values(created_at=past)
    )
    await db.commit()

    # Patch settings to enable session expiry (1 second lifetime)
    with patch("app.api.auth.service.settings") as mock_settings:
        mock_settings.SESSION_TOKEN_LIFETIME_SECONDS = 1
        resp = await async_client.get("/api/v1/auth/session", headers=headers)

    assert resp.status_code == 401


# ── User Deactivated While Session Valid ──────────────────────────────────────

async def test_deactivated_user_session_returns_401(async_client, db):
    """When a user is deactivated, their existing session returns 401."""
    from sqlalchemy import update as sa_update
    from app.api.auth.models import User as UserModel

    user = await register_user(async_client, email=make_unique_email("sess_deact"))
    headers = auth_header(user["session_token"])

    # Verify the session works first
    resp1 = await async_client.get("/api/v1/auth/session", headers=headers)
    assert resp1.status_code == 200

    # Deactivate the user directly in DB
    await db.execute(
        sa_update(UserModel)
        .where(UserModel.id == user["user_id"])
        .values(is_active=False)
    )
    await db.commit()

    # Session should now be rejected
    resp2 = await async_client.get("/api/v1/auth/session", headers=headers)
    assert resp2.status_code == 401


# ── require_admin Dependency ──────────────────────────────────────────────────

async def test_require_admin_non_admin_403(async_client, db):
    """Non-admin user accessing an admin-protected dependency gets 403."""
    from app.api.auth.dependencies import require_admin, CurrentAuth
    from app.api.auth.models import User as UserModel
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException

    user = await register_user(async_client, email=make_unique_email("admin_no"))

    # Fetch the user from DB
    result = await db.execute(select(UserModel).where(UserModel.id == user["user_id"]))
    user_obj = result.scalar_one()
    assert user_obj.is_admin is False

    # Create a mock CurrentAuth with a non-admin user
    mock_session = MagicMock()
    auth = CurrentAuth(user=user_obj, session=mock_session)

    # require_admin should raise 403
    with pytest.raises(HTTPException) as exc_info:
        await require_admin(auth=auth)
    assert exc_info.value.status_code == 403


async def test_require_admin_admin_passes(async_client, db):
    """Admin user passes the require_admin dependency check."""
    from app.api.auth.dependencies import require_admin, CurrentAuth
    from app.api.auth.models import User as UserModel
    from sqlalchemy import update as sa_update
    from unittest.mock import MagicMock

    user = await register_user(async_client, email=make_unique_email("admin_yes"))

    # Make the user an admin
    await db.execute(
        sa_update(UserModel)
        .where(UserModel.id == user["user_id"])
        .values(is_admin=True)
    )
    await db.commit()

    result = await db.execute(select(UserModel).where(UserModel.id == user["user_id"]))
    user_obj = result.scalar_one()
    assert user_obj.is_admin is True

    mock_session = MagicMock()
    auth = CurrentAuth(user=user_obj, session=mock_session)

    # Should pass without exception and return CurrentAuth
    returned = await require_admin(auth=auth)
    assert returned.user.id == user["user_id"]


# ── optional_auth Dependency ─────────────────────────────────────────────────

async def test_optional_auth_returns_none_no_token(async_client, db):
    """optional_auth returns None when no token is provided."""
    from app.api.auth.dependencies import optional_auth
    from unittest.mock import MagicMock
    from database.base import AsyncSessionFactory

    # Create a mock request with no Authorization header
    mock_request = MagicMock()
    mock_request.headers = {}

    session = AsyncSessionFactory()
    try:
        result = await optional_auth(request=mock_request, db=session)
        assert result is None
    finally:
        try:
            await session.close()
        except Exception:
            pass


async def test_optional_auth_returns_none_invalid_token(async_client, db):
    """optional_auth returns None for an invalid token (no exception raised)."""
    from app.api.auth.dependencies import optional_auth
    from unittest.mock import MagicMock
    from database.base import AsyncSessionFactory

    mock_request = MagicMock()
    mock_request.headers = {"Authorization": "Bearer invalid_token_here"}

    session = AsyncSessionFactory()
    try:
        result = await optional_auth(request=mock_request, db=session)
        assert result is None
    finally:
        try:
            await session.close()
        except Exception:
            pass


async def test_optional_auth_returns_auth_valid_token(async_client, db):
    """optional_auth returns CurrentAuth for a valid token."""
    from app.api.auth.dependencies import optional_auth
    from unittest.mock import MagicMock
    from database.base import AsyncSessionFactory

    user = await register_user(async_client, email=make_unique_email("opt_auth"))

    mock_request = MagicMock()
    mock_request.headers = {"Authorization": f"Bearer {user['session_token']}"}

    session = AsyncSessionFactory()
    try:
        result = await optional_auth(request=mock_request, db=session)
        assert result is not None
        assert result.user.email == user["email"]
    finally:
        try:
            await session.close()
        except Exception:
            pass

