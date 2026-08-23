"""
Phase 2.1 — OTP Tests
Tests for POST /verify-otp and POST /resend-otp

Covers: email verification, wrong OTP, expired OTP, wrong purpose,
OTP reuse prevention, resend, and unknown email protection.
Each test creates its own user.
"""
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update

from app.api.auth.models import User
from tests.conftest import make_unique_email, register_user, auth_header


# ── DB Helpers ────────────────────────────────────────────────────────────────

async def _get_user_otp(db, email: str) -> tuple[str, str]:
    """Read otp_code and otp_purpose from DB."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    return user.otp_code, user.otp_purpose


# ── POST /auth/verify-otp — Verify Email Success ─────────────────────────────

async def test_verify_email_otp_success(async_client, db):
    """Successful OTP verification marks is_verified=True and clears OTP."""
    email = make_unique_email("otp_verify")
    await register_user(async_client, email=email)

    otp, _ = await _get_user_otp(db, email)

    resp = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp": otp, "purpose": "verify_email"},
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Verify DB state
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    assert user.is_verified is True
    assert user.otp_code is None  # cleared after use


async def test_verify_email_otp_db_state(async_client, db):
    """After verification, is_verified=True, otp_code=None, otp_expires_at=None."""
    email = make_unique_email("otp_db")
    await register_user(async_client, email=email)
    otp, _ = await _get_user_otp(db, email)

    await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp": otp, "purpose": "verify_email"},
    )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    assert user.is_verified is True
    assert user.otp_code is None
    assert user.otp_purpose is None
    assert user.otp_expires_at is None


# ── POST /auth/verify-otp — Wrong OTP ────────────────────────────────────────

async def test_verify_email_wrong_otp_400(async_client):
    """400 when OTP code is wrong."""
    email = make_unique_email("otp_wrong")
    await register_user(async_client, email=email)

    resp = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp": "000000", "purpose": "verify_email"},
    )
    assert resp.status_code == 400


# ── POST /auth/verify-otp — Expired OTP ──────────────────────────────────────

async def test_verify_email_expired_otp_400(async_client, db):
    """400 when OTP has expired."""
    email = make_unique_email("otp_expired")
    await register_user(async_client, email=email)

    # Force-expire the OTP
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    await db.execute(
        update(User).where(User.email == email).values(otp_expires_at=past)
    )
    await db.commit()

    otp, _ = await _get_user_otp(db, email)
    resp = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp": otp, "purpose": "verify_email"},
    )
    assert resp.status_code == 400


# ── POST /auth/verify-otp — Wrong Purpose ────────────────────────────────────

async def test_verify_wrong_purpose_400(async_client, db):
    """400 when purpose doesn't match stored otp_purpose."""
    email = make_unique_email("otp_purpose")
    await register_user(async_client, email=email)
    otp, _ = await _get_user_otp(db, email)

    # OTP was issued for verify_email, but we send reset_password
    resp = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp": otp, "purpose": "reset_password"},
    )
    assert resp.status_code == 400


# ── POST /auth/verify-otp — OTP Reuse Prevention ─────────────────────────────

async def test_otp_cannot_be_reused(async_client, db):
    """After a successful OTP verification, the same OTP must be rejected."""
    email = make_unique_email("otp_reuse")
    await register_user(async_client, email=email)
    otp, _ = await _get_user_otp(db, email)

    # First verification — succeeds
    r1 = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp": otp, "purpose": "verify_email"},
    )
    assert r1.status_code == 200

    # Second use of same OTP — must fail
    r2 = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp": otp, "purpose": "verify_email"},
    )
    assert r2.status_code == 400


# ── POST /auth/verify-otp — Unknown Email ────────────────────────────────────

async def test_verify_otp_unknown_email_400(async_client):
    """400 when the email doesn't exist in the DB."""
    resp = await async_client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "ghost@example.com", "otp": "123456", "purpose": "verify_email"},
    )
    assert resp.status_code == 400


# ── POST /auth/resend-otp — Happy Path ───────────────────────────────────────

async def test_resend_otp_success(async_client, db):
    """Resend issues a new OTP that is a valid 6-digit string."""
    email = make_unique_email("otp_resend")
    await register_user(async_client, email=email)
    old_otp, _ = await _get_user_otp(db, email)

    resp = await async_client.post(
        "/api/v1/auth/resend-otp",
        json={"email": email, "purpose": "verify_email"},
    )
    assert resp.status_code == 200

    new_otp, _ = await _get_user_otp(db, email)
    assert new_otp is not None
    assert len(new_otp) == 6
    assert new_otp.isdigit()


async def test_resend_otp_calls_send_verification_email(async_client):
    """EmailService.send_verification_email must be called during resend."""
    email = make_unique_email("otp_resend_email")
    await register_user(async_client, email=email)

    mock = async_client._mock_send_verification_email
    call_count_before = mock.call_count

    await async_client.post(
        "/api/v1/auth/resend-otp",
        json={"email": email, "purpose": "verify_email"},
    )

    assert mock.call_count > call_count_before


# ── POST /auth/resend-otp — Unknown Email (Anti-Enumeration) ─────────────────

async def test_resend_otp_unknown_email_200(async_client):
    """Resend always returns 200 regardless of email existence (anti-enumeration)."""
    resp = await async_client.post(
        "/api/v1/auth/resend-otp",
        json={"email": "unknown@example.com", "purpose": "verify_email"},
    )
    assert resp.status_code == 200
