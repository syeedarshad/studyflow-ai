"""
Phase 2.1 — Registration Tests
Tests for POST /api/v1/auth/register

Each test creates its own user via the factory helper.
Verifies both API responses and database state.
"""
import pytest
from sqlalchemy import select

from app.api.auth.models import User, Session
from tests.conftest import make_unique_email, register_user, auth_header


# ── Happy Path ────────────────────────────────────────────────────────────────

async def test_register_success_status_and_schema(async_client):
    """201 with success=True, session_token, and user data."""
    email = make_unique_email("reg_ok")
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"full_name": "Alice Test", "email": email, "password": "StrongPass123!"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["success"] is True
    assert "session_token" in data
    assert len(data["session_token"]) > 20
    assert data["user"]["email"] == email
    assert data["user"]["is_verified"] is False
    assert data["user"]["is_active"] is True
    assert "id" in data["user"]
    assert "created_at" in data["user"]


async def test_register_creates_user_row_in_db(async_client, db):
    """After registration, a user row must exist in the DB with hashed password."""
    email = make_unique_email("reg_db_user")
    user_data = await register_user(async_client, email=email, password="StrongPass123!")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    assert user is not None
    assert user.email == email
    assert user.full_name == "Test User"
    assert user.is_active is True
    assert user.is_verified is False
    # Password must be hashed, not plain
    assert user.password_hash != "StrongPass123!"
    assert user.password_hash.startswith("$2b$") or user.password_hash.startswith("$2a$")


async def test_register_creates_session_row_in_db(async_client, db):
    """A session row must be created immediately after registration."""
    email = make_unique_email("reg_db_session")
    user_data = await register_user(async_client, email=email)
    user_id = user_data["user_id"]

    result = await db.execute(select(Session).where(Session.user_id == user_id))
    sessions = result.scalars().all()
    assert len(sessions) >= 1
    assert sessions[0].is_active is True
    assert sessions[0].token_hash is not None
    assert len(sessions[0].token_hash) == 64  # SHA-256 hex digest


async def test_register_stores_otp_in_db(async_client, db):
    """After registration, otp_code, otp_purpose='verify_email', otp_expires_at must be set."""
    email = make_unique_email("reg_db_otp")
    user_data = await register_user(async_client, email=email)
    user_id = user_data["user_id"]

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()
    assert user.otp_code is not None
    assert len(user.otp_code) == 6
    assert user.otp_code.isdigit()
    assert user.otp_purpose == "verify_email"
    assert user.otp_expires_at is not None


async def test_register_calls_send_verification_email(async_client):
    """EmailService.send_verification_email must be called exactly once with correct email."""
    email = make_unique_email("reg_email_call")
    mock = async_client._mock_send_verification_email
    call_count_before = mock.call_count

    await register_user(async_client, email=email)

    assert mock.call_count == call_count_before + 1
    # Verify the correct email was passed (check keyword or positional args)
    last_call = mock.call_args
    call_args = last_call.args if last_call.args else ()
    call_kwargs = last_call.kwargs if last_call.kwargs else {}
    passed_email = call_kwargs.get("email_to") or (call_args[0] if call_args else None)
    assert passed_email == email


# ── Duplicate & Conflict ──────────────────────────────────────────────────────

async def test_register_duplicate_email_409(async_client):
    """409 Conflict when email is already registered."""
    email = make_unique_email("reg_dup")
    await register_user(async_client, email=email)
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"full_name": "Dup User", "email": email, "password": "StrongPass123!"},
    )
    assert resp.status_code == 409


async def test_register_case_insensitive_email_conflict(async_client):
    """Email comparison is case-insensitive — UPPER@EXAMPLE.COM conflicts with lower."""
    email = make_unique_email("reg_case")
    await register_user(async_client, email=email.lower())
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"full_name": "Case Dup", "email": email.upper(), "password": "StrongPass123!"},
    )
    assert resp.status_code == 409


# ── Validation Errors (422) ───────────────────────────────────────────────────

async def test_register_invalid_email_422(async_client):
    """422 when email is not a valid address."""
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"full_name": "Bob", "email": "not-an-email", "password": "StrongPass123!"},
    )
    assert resp.status_code == 422


async def test_register_blank_name_422(async_client):
    """422 when full_name is blank (whitespace only)."""
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"full_name": "   ", "email": make_unique_email("blank"), "password": "StrongPass123!"},
    )
    assert resp.status_code == 422


async def test_register_short_password_422(async_client):
    """422 when password is fewer than 8 characters."""
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"full_name": "Bob", "email": make_unique_email("shortpw"), "password": "short"},
    )
    assert resp.status_code == 422


async def test_register_missing_fields_422(async_client):
    """422 when required fields are missing."""
    resp = await async_client.post("/api/v1/auth/register", json={})
    assert resp.status_code == 422


# ── Security: Password Never Returned ─────────────────────────────────────────

async def test_register_password_not_in_response(async_client):
    """password_hash must never appear in the registration response."""
    email = make_unique_email("reg_safe")
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"full_name": "Safe User", "email": email, "password": "StrongPass123!"},
    )
    assert resp.status_code == 201
    resp_text = resp.text
    assert "password_hash" not in resp_text
    assert "password" not in resp.json().get("user", {})
