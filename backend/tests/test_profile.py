"""
Phase 2.2 — User Profile Tests
Tests for GET /api/v1/profile, PUT /api/v1/profile,
PATCH /api/v1/profile/preferences, PATCH /api/v1/profile/avatar,
and DELETE /api/v1/profile/avatar.
"""

import pytest
from sqlalchemy import select

from app.api.profile.models import UserProfile
from tests.conftest import auth_header, make_unique_email, register_user


# ── GET /api/v1/profile ───────────────────────────────────────────────────────

async def test_get_profile_auto_creates_default(async_client, db):
    """GET /profile for a new user automatically creates default profile with version 1."""
    user = await register_user(async_client, email=make_unique_email("prof_get"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/profile", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    profile = data["profile"]
    assert profile["user_id"] == user["user_id"]
    assert profile["display_name"] == "Test User"
    assert profile["timezone"] == "UTC"
    assert profile["language"] == "en"
    assert profile["theme"] == "system"
    assert profile["version"] == 1
    assert "study_preferences" in profile

    # Verify DB row created
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user["user_id"]))
    row = result.scalar_one_or_none()
    assert row is not None
    assert row.version == 1


async def test_get_profile_unauthorized_401(async_client):
    """GET /profile returns 401 without valid Authorization header."""
    resp = await async_client.get("/api/v1/profile")
    assert resp.status_code == 401


# ── PUT /api/v1/profile ───────────────────────────────────────────────────────

async def test_update_profile_increments_version(async_client, db):
    """PUT /profile updates fields and increments version to 2."""
    user = await register_user(async_client, email=make_unique_email("prof_put"))
    headers = auth_header(user["session_token"])

    update_payload = {
        "display_name": "Alice Wonder",
        "bio": "Passionate learner",
        "timezone": "America/New_York",
        "country": "United States",
        "language": "en-US",
        "theme": "dark",
    }

    resp = await async_client.put("/api/v1/profile", json=update_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    profile = data["profile"]
    assert profile["display_name"] == "Alice Wonder"
    assert profile["bio"] == "Passionate learner"
    assert profile["timezone"] == "America/New_York"
    assert profile["country"] == "United States"
    assert profile["theme"] == "dark"
    assert profile["version"] == 2  # Version incremented from 1 to 2

    # Verify DB state
    db.expire_all()
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user["user_id"]))
    row = result.scalar_one()
    assert row.display_name == "Alice Wonder"
    assert row.version == 2


async def test_update_profile_unauthorized_401(async_client):
    """PUT /profile returns 401 without authentication."""
    resp = await async_client.put("/api/v1/profile", json={"display_name": "Ghost"})
    assert resp.status_code == 401


# ── PATCH /api/v1/profile/preferences ────────────────────────────────────────

async def test_update_preferences_increments_version(async_client, db):
    """PATCH /profile/preferences updates study_preferences and increments version."""
    user = await register_user(async_client, email=make_unique_email("prof_pref"))
    headers = auth_header(user["session_token"])

    new_prefs = {
        "pomodoro_duration_minutes": 50,
        "short_break_minutes": 10,
        "long_break_minutes": 30,
        "daily_goal_hours": 6,
        "notifications_enabled": False,
    }

    resp = await async_client.patch(
        "/api/v1/profile/preferences",
        json={"study_preferences": new_prefs},
        headers=headers,
    )
    assert resp.status_code == 200
    profile = resp.json()["profile"]
    assert profile["study_preferences"]["pomodoro_duration_minutes"] == 50
    assert profile["study_preferences"]["daily_goal_hours"] == 6
    assert profile["version"] == 2

    # Second update increments version again to 3
    resp2 = await async_client.patch(
        "/api/v1/profile/preferences",
        json={"study_preferences": {**new_prefs, "daily_goal_hours": 8}},
        headers=headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["profile"]["version"] == 3


async def test_update_preferences_unauthorized_401(async_client):
    """PATCH /profile/preferences returns 401 without auth."""
    resp = await async_client.patch(
        "/api/v1/profile/preferences",
        json={"study_preferences": {}},
    )
    assert resp.status_code == 401


# ── PATCH / DELETE /api/v1/profile/avatar ────────────────────────────────────

async def test_update_and_delete_avatar(async_client, db):
    """PATCH and DELETE /profile/avatar update avatar_url and version."""
    user = await register_user(async_client, email=make_unique_email("prof_avatar"))
    headers = auth_header(user["session_token"])

    avatar_url = "https://example.com/avatar.png"
    resp = await async_client.patch(
        "/api/v1/profile/avatar",
        json={"avatar_url": avatar_url},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["profile"]["avatar_url"] == avatar_url
    assert resp.json()["profile"]["version"] == 2

    # Delete avatar
    del_resp = await async_client.delete("/api/v1/profile/avatar", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["profile"]["avatar_url"] is None
    assert del_resp.json()["profile"]["version"] == 3


async def test_avatar_unauthorized_401(async_client):
    """Avatar endpoints return 401 without auth."""
    r1 = await async_client.patch("/api/v1/profile/avatar", json={"avatar_url": "http://test"})
    r2 = await async_client.delete("/api/v1/profile/avatar")
    assert r1.status_code == 401
    assert r2.status_code == 401
