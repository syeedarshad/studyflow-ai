"""
Phase 2.1 — Password Reset Tests
Tests for POST /forgot-password and POST /reset-password

Full flow: forgot → reset → verify login with new password.
Verifies DB state: password hash changed, OTP removed, sessions invalidated.
Each test creates its own user.
"""
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update

from app.api.auth.models import User, Session
from tests.conftest import make_unique_email, register_user, login_user, auth_header


# ── DB Helpers ────────────────────────────────────────────────────────────────

async def _get_reset_otp(db, email: str) -> str:
    """Read the reset OTP from the DB."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    assert user.otp_purpose == "reset_password", f"Expected reset_password, got {user.otp_purpose!r}"
    return user.otp_code


async def _trigger_forgot_password(async_client, email: str):
    """Call forgot-password and return the response."""
    return await async_client.post(
        "/api/v1/auth/forgot-password", json={"email": email}
    )


# ── POST /auth/forgot-password — Happy Path ──────────────────────────────────

async def test_forgot_password_success(async_client):
    """forgot-password always returns 200 (anti-enumeration)."""
    email = make_unique_email("pw_forgot")
    await register_user(async_client, email=email)
    resp = await _trigger_forgot_password(async_client, email)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_forgot_password_unknown_email_200(async_client):
    """forgot-password returns 200 for unknown emails (never reveals if registered)."""
    resp = await _trigger_forgot_password(async_client, "nobody_pw@example.com")
    assert resp.status_code == 200


async def test_forgot_password_writes_otp_to_db(async_client, db):
    """forgot-password stores otp_code with purpose=reset_password in DB."""
    email = make_unique_email("pw_forgot_db")
    await register_user(async_client, email=email)
    await _trigger_forgot_password(async_client, email)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    assert user.otp_code is not None
    assert len(user.otp_code) == 6
    assert user.otp_code.isdigit()
    assert user.otp_purpose == "reset_password"
    assert user.otp_expires_at is not None
    assert user.otp_expires_at > datetime.now(timezone.utc)


async def test_forgot_password_calls_send_password_reset_email(async_client):
    """EmailService.send_password_reset_email must be called with the correct email."""
    email = make_unique_email("pw_forgot_email")
    await register_user(async_client, email=email)

    mock = async_client._mock_send_password_reset_email
    call_count_before = mock.call_count

    await _trigger_forgot_password(async_client, email)

    assert mock.call_count == call_count_before + 1
    last_call = mock.call_args
    call_args = last_call.args if last_call.args else ()
    call_kwargs = last_call.kwargs if last_call.kwargs else {}
    passed_email = call_kwargs.get("email_to") or (call_args[0] if call_args else None)
    assert passed_email == email


# ── POST /auth/reset-password — Happy Path ───────────────────────────────────

async def test_reset_password_success(async_client, db):
    """Full happy path: forgot → reset → success."""
    email = make_unique_email("pw_reset_ok")
    await register_user(async_client, email=email)
    await _trigger_forgot_password(async_client, email)
    otp = await _get_reset_otp(db, email)

    resp = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": "NewPassword456!"},
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_reset_password_db_state(async_client, db):
    """After reset: password hash changed, OTP cleared."""
    email = make_unique_email("pw_reset_db")
    await register_user(async_client, email=email, password="OldPassword123!")

    # Capture old hash
    r1 = await db.execute(select(User).where(User.email == email))
    old_hash = r1.scalar_one().password_hash

    await _trigger_forgot_password(async_client, email)
    otp = await _get_reset_otp(db, email)

    await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": "BrandNewPass789!"},
    )

    r2 = await db.execute(select(User).where(User.email == email))
    user = r2.scalar_one()
    assert user.password_hash != old_hash  # hash changed
    assert user.otp_code is None           # OTP cleared
    assert user.otp_purpose is None


# ── Password Reset — New Password Works ──────────────────────────────────────

async def test_reset_password_new_password_works(async_client, db):
    """After reset, the NEW password must authenticate."""
    email = make_unique_email("pw_new_works")
    await register_user(async_client, email=email, password="OldPassword123!")
    await _trigger_forgot_password(async_client, email)
    otp = await _get_reset_otp(db, email)

    new_pw = "BrandNewPass789!"
    await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": new_pw},
    )

    login_result = await login_user(async_client, email, new_pw)
    assert login_result["status_code"] == 200


# ── Password Reset — Old Password Rejected ───────────────────────────────────

async def test_reset_password_old_password_fails(async_client, db):
    """After reset, the OLD password must be rejected."""
    email = make_unique_email("pw_old_fails")
    old_pw = "OldPassword123!"
    await register_user(async_client, email=email, password=old_pw)
    await _trigger_forgot_password(async_client, email)
    otp = await _get_reset_otp(db, email)

    await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": "BrandNewPass789!"},
    )

    old_login = await login_user(async_client, email, old_pw)
    assert old_login["status_code"] == 401


# ── Password Reset — Sessions Invalidated ────────────────────────────────────

async def test_reset_password_invalidates_sessions(async_client, db):
    """After reset, all previous sessions must be invalidated."""
    email = make_unique_email("pw_sess_inv")
    user = await register_user(async_client, email=email, password="OldPassword123!")
    headers = auth_header(user["session_token"])

    await _trigger_forgot_password(async_client, email)
    otp = await _get_reset_otp(db, email)

    await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": "BrandNewPass789!"},
    )

    # Original token must now be invalid
    check = await async_client.get("/api/v1/auth/session", headers=headers)
    assert check.status_code == 401

    # DB verification: all sessions for this user should be inactive
    result = await db.execute(
        select(Session).where(Session.user_id == user["user_id"], Session.is_active == True)
    )
    active_sessions = result.scalars().all()
    assert len(active_sessions) == 0


# ── Password Reset — Wrong OTP ───────────────────────────────────────────────

async def test_reset_password_wrong_otp_400(async_client, db):
    """400 when submitting an incorrect OTP."""
    email = make_unique_email("pw_wrong_otp")
    await register_user(async_client, email=email)
    await _trigger_forgot_password(async_client, email)

    resp = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": "000000", "new_password": "NewPassword456!"},
    )
    assert resp.status_code == 400


# ── Password Reset — Expired OTP ─────────────────────────────────────────────

async def test_reset_password_expired_otp_400(async_client, db):
    """400 when the reset OTP has expired."""
    email = make_unique_email("pw_exp_otp")
    await register_user(async_client, email=email)
    await _trigger_forgot_password(async_client, email)

    # Force-expire the OTP
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    await db.execute(
        update(User).where(User.email == email).values(otp_expires_at=past)
    )
    await db.commit()

    otp = await _get_reset_otp(db, email)
    resp = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": "NewPassword456!"},
    )
    assert resp.status_code == 400


# ── Password Reset — OTP Reuse Blocked ───────────────────────────────────────

async def test_reset_password_otp_reuse_400(async_client, db):
    """After a successful reset, the same OTP must be rejected on a second attempt."""
    email = make_unique_email("pw_otp_reuse")
    await register_user(async_client, email=email)
    await _trigger_forgot_password(async_client, email)
    otp = await _get_reset_otp(db, email)

    # First reset — succeeds
    r1 = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": "Pass111!!!ab"},
    )
    assert r1.status_code == 200

    # Second reset with same OTP — must fail
    r2 = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": "Pass222!!!ab"},
    )
    assert r2.status_code == 400
