"""
Phase 2.1 — Login Tests
Tests for POST /api/v1/auth/login

Each test creates its own user. Verifies API responses and database state.
"""
import pytest
from sqlalchemy import select, update

from app.api.auth.models import User, Session
from tests.conftest import make_unique_email, register_user, login_user, auth_header


# ── Happy Path ────────────────────────────────────────────────────────────────

async def test_login_success(async_client):
    """200 with token, user data, and success=True on valid credentials."""
    email = make_unique_email("login_ok")
    user = await register_user(async_client, email=email, password="MyPass123!")

    result = await login_user(async_client, email, "MyPass123!")
    assert result["status_code"] == 200
    data = result["data"]
    assert data["success"] is True
    assert "session_token" in data
    assert len(data["session_token"]) > 20
    assert data["user"]["email"] == email


async def test_login_returns_new_unique_token(async_client):
    """Each login issues a distinct session token."""
    email = make_unique_email("login_token")
    await register_user(async_client, email=email, password="MyPass123!")

    r1 = await login_user(async_client, email, "MyPass123!")
    r2 = await login_user(async_client, email, "MyPass123!")
    assert r1["status_code"] == 200
    assert r2["status_code"] == 200
    assert r1["data"]["session_token"] != r2["data"]["session_token"]


async def test_login_creates_session_in_db(async_client, db):
    """Login inserts a new session row in the DB."""
    email = make_unique_email("login_db_sess")
    user = await register_user(async_client, email=email, password="MyPass123!")
    user_id = user["user_id"]

    # One session from registration
    result = await db.execute(select(Session).where(Session.user_id == user_id, Session.is_active == True))
    initial_count = len(result.scalars().all())

    await login_user(async_client, email, "MyPass123!")

    result2 = await db.execute(select(Session).where(Session.user_id == user_id, Session.is_active == True))
    new_count = len(result2.scalars().all())
    assert new_count == initial_count + 1


async def test_login_updates_last_login(async_client, db):
    """Login must update last_login_at timestamp."""
    email = make_unique_email("login_last")
    user = await register_user(async_client, email=email, password="MyPass123!")

    # Before login, last_login_at may be None
    result = await db.execute(select(User).where(User.email == email))
    user_row = result.scalar_one()
    old_last_login = user_row.last_login_at

    await login_user(async_client, email, "MyPass123!")

    # Expire cached objects so the next query hits the DB for fresh data
    db.expire_all()
    result2 = await db.execute(select(User).where(User.email == email))
    user_row2 = result2.scalar_one()
    assert user_row2.last_login_at is not None
    if old_last_login is not None:
        assert user_row2.last_login_at >= old_last_login


async def test_login_case_insensitive_email(async_client):
    """Login succeeds regardless of email case."""
    email = make_unique_email("login_case")
    await register_user(async_client, email=email.lower(), password="MyPass123!")

    result = await login_user(async_client, email.upper(), "MyPass123!")
    assert result["status_code"] == 200


async def test_login_with_device_label(async_client):
    """device_label field is accepted without error."""
    email = make_unique_email("login_device")
    await register_user(async_client, email=email, password="MyPass123!")

    result = await login_user(async_client, email, "MyPass123!", device_label="Windows 11 / Test")
    assert result["status_code"] == 200


# ── Failure Cases ─────────────────────────────────────────────────────────────

async def test_login_wrong_password_401(async_client):
    """401 on wrong password."""
    email = make_unique_email("login_wrongpw")
    await register_user(async_client, email=email, password="MyPass123!")

    result = await login_user(async_client, email, "WrongPassword999!")
    assert result["status_code"] == 401


async def test_login_nonexistent_email_401(async_client):
    """401 on unknown email (timing-safe: still runs bcrypt compare)."""
    result = await login_user(async_client, "nobody_exists@example.com", "SomePassword123!")
    assert result["status_code"] == 401


async def test_login_inactive_user_403(async_client, db):
    """403 when the account has been deactivated."""
    email = make_unique_email("login_inactive")
    await register_user(async_client, email=email, password="MyPass123!")

    await db.execute(update(User).where(User.email == email).values(is_active=False))
    await db.commit()

    result = await login_user(async_client, email, "MyPass123!")
    assert result["status_code"] == 403


# ── Security: Password Never Returned ─────────────────────────────────────────

async def test_login_password_not_in_response(async_client):
    """password_hash must never appear in the login response."""
    email = make_unique_email("login_safe")
    await register_user(async_client, email=email, password="MyPass123!")

    result = await login_user(async_client, email, "MyPass123!")
    assert result["status_code"] == 200
    assert "password_hash" not in result["response"].text
    assert "password" not in result["data"].get("user", {})
