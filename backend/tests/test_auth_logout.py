"""
Phase 2.1 — Logout Tests
Tests for POST /logout and POST /logout-all

Includes negative security tests: unauthorized logout, duplicate logout,
logout after logout-all.
"""
import pytest

from tests.conftest import make_unique_email, register_user, login_user, auth_header


# ── POST /auth/logout — Happy Path ────────────────────────────────────────────

async def test_logout_success(async_client):
    """POST /logout returns 200 and success=True."""
    user = await register_user(async_client, email=make_unique_email("logout_ok"))
    headers = auth_header(user["session_token"])

    resp = await async_client.post("/api/v1/auth/logout", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_logout_invalidates_token(async_client):
    """After logout, the same token must not authenticate."""
    user = await register_user(async_client, email=make_unique_email("logout_inv"))
    headers = auth_header(user["session_token"])

    await async_client.post("/api/v1/auth/logout", headers=headers)
    resp = await async_client.get("/api/v1/auth/session", headers=headers)
    assert resp.status_code == 401


# ── POST /auth/logout — Unauthorized ──────────────────────────────────────────

async def test_logout_no_auth_401(async_client):
    """POST /logout without a token returns 401."""
    resp = await async_client.post("/api/v1/auth/logout")
    assert resp.status_code == 401


# ── Negative Security: Duplicate Logout ───────────────────────────────────────

async def test_logout_duplicate_attempt_401(async_client):
    """Second logout with the same token returns 401 (token already invalidated)."""
    user = await register_user(async_client, email=make_unique_email("logout_dup"))
    headers = auth_header(user["session_token"])

    r1 = await async_client.post("/api/v1/auth/logout", headers=headers)
    assert r1.status_code == 200

    r2 = await async_client.post("/api/v1/auth/logout", headers=headers)
    assert r2.status_code == 401


# ── POST /auth/logout-all — Happy Path ────────────────────────────────────────

async def test_logout_all_success(async_client):
    """POST /logout-all returns 200 with count of invalidated sessions."""
    user = await register_user(async_client, email=make_unique_email("logall_ok"))
    headers = auth_header(user["session_token"])

    resp = await async_client.post("/api/v1/auth/logout-all", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "session" in data["message"].lower()


async def test_logout_all_invalidates_all_sessions(async_client):
    """After logout-all, every session token for that user is invalid."""
    user = await register_user(async_client, email=make_unique_email("logall_inv"))

    # Create a second session via login
    login_result = await login_user(async_client, user["email"], user["password"])
    assert login_result["status_code"] == 200
    token2 = login_result["data"]["session_token"]
    headers1 = auth_header(user["session_token"])
    headers2 = auth_header(token2)

    # logout-all using the original token
    await async_client.post("/api/v1/auth/logout-all", headers=headers1)

    # Both tokens must now be invalid
    r1 = await async_client.get("/api/v1/auth/session", headers=headers1)
    r2 = await async_client.get("/api/v1/auth/session", headers=headers2)
    assert r1.status_code == 401
    assert r2.status_code == 401


# ── POST /auth/logout-all — Unauthorized ──────────────────────────────────────

async def test_logout_all_no_auth_401(async_client):
    """POST /logout-all without a token returns 401."""
    resp = await async_client.post("/api/v1/auth/logout-all")
    assert resp.status_code == 401


# ── Negative Security: Logout After Logout-All ───────────────────────────────

async def test_logout_after_logout_all_401(async_client):
    """After logout-all, a single-session logout with the same token returns 401."""
    user = await register_user(async_client, email=make_unique_email("logall_then"))
    headers = auth_header(user["session_token"])

    await async_client.post("/api/v1/auth/logout-all", headers=headers)

    resp = await async_client.post("/api/v1/auth/logout", headers=headers)
    assert resp.status_code == 401
