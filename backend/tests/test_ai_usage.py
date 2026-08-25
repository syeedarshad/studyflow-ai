"""
StudyFlow AI — AI Usage & Proxy Tests
─────────────────────────────────────────────────────────────
Tests for:
  GET  /api/v1/usage           — per-user daily usage summary
  POST /api/v1/ai/generate     — AI proxy endpoint
  GET  /api/v1/ai/status       — provider availability
  Security: provider keys never in responses, IDOR protection

Coverage:
  1.  Authenticated user can retrieve own usage
  2.  Unauthenticated user receives 401
  3.  Usage increments after an AI request
  4.  Usage limit is enforced
  5.  Exceeding limit returns 429
  6.  Usage resets on next UTC day (simulated)
  7.  Concurrent requests cannot easily bypass quota
  8.  User A cannot access User B's usage
  9.  Provider API keys are never in responses
  10. Provider failures never expose keys
  11. Gemini → Groq fallback (mocked)
  12. Existing auth tests unaffected (no side effects here)
"""

import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from app.api.ai.models import AIUsageLog
from app.api.ai.service import AIProviderService, GEMINI_MODEL, GROQ_MODEL
from core.config import get_settings
from tests.conftest import auth_header, make_unique_email, register_user

settings = get_settings()


# ──────────────────────────────────────────────────────────────────────────────
# 1. GET /api/v1/usage — Authenticated user retrieves own usage
# ──────────────────────────────────────────────────────────────────────────────

async def test_get_usage_authenticated_returns_own_usage(async_client):
    """Authenticated user gets a valid usage summary for themselves."""
    user = await register_user(async_client, email=make_unique_email("usage_auth"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/usage", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Must have the required fields
    assert "used" in data
    assert "daily_limit" in data
    assert "remaining" in data
    assert "reset_at" in data

    # Fresh user starts at 0
    assert data["used"] == 0
    assert data["daily_limit"] == settings.AI_DAILY_REQUEST_LIMIT
    assert data["remaining"] == settings.AI_DAILY_REQUEST_LIMIT

    # reset_at must be a valid ISO timestamp
    assert "T" in data["reset_at"]


# ──────────────────────────────────────────────────────────────────────────────
# 2. Unauthenticated usage request returns 401
# ──────────────────────────────────────────────────────────────────────────────

async def test_get_usage_unauthenticated_returns_401(async_client):
    """GET /usage without a session token must return 401."""
    resp = await async_client.get("/api/v1/usage")
    assert resp.status_code == 401


async def test_ai_generate_unauthenticated_returns_401(async_client):
    """POST /ai/generate without a session token must return 401."""
    resp = await async_client.post(
        "/api/v1/ai/generate",
        json={"prompt": "Generate a task plan"},
    )
    assert resp.status_code == 401


# ──────────────────────────────────────────────────────────────────────────────
# 3. Usage increments after an AI request
# ──────────────────────────────────────────────────────────────────────────────

async def test_usage_increments_after_successful_ai_request(async_client, db):
    """After a successful AI generate call, usage count increases by 1."""
    user = await register_user(async_client, email=make_unique_email("usage_inc"))
    headers = auth_header(user["session_token"])

    # Verify starting at 0
    r0 = await async_client.get("/api/v1/usage", headers=headers)
    assert r0.json()["used"] == 0

    # Mock the Gemini call to succeed
    mock_result = {"text": '{"tasks":[]}', "model": GEMINI_MODEL, "tokens_used": 100}
    with patch.object(AIProviderService, "_call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.return_value = mock_result
        gen_resp = await async_client.post(
            "/api/v1/ai/generate",
            json={"prompt": "Plan my study day", "feature": "planner"},
            headers=headers,
        )
        assert gen_resp.status_code == 200
        assert gen_resp.json()["success"] is True

    # Usage should now be 1
    r1 = await async_client.get("/api/v1/usage", headers=headers)
    assert r1.json()["used"] == 1
    assert r1.json()["remaining"] == settings.AI_DAILY_REQUEST_LIMIT - 1


# ──────────────────────────────────────────────────────────────────────────────
# 4. Usage limit is enforced / 5. Exceeding returns 429
# ──────────────────────────────────────────────────────────────────────────────

async def test_quota_enforced_returns_429_when_exceeded(async_client, db):
    """When the user's daily quota is exhausted, the API returns 429."""
    user = await register_user(async_client, email=make_unique_email("usage_quota"))
    headers = auth_header(user["session_token"])

    # Directly insert usage rows to exhaust quota without real API calls
    from app.api.ai.models import AIUsageLog
    from datetime import datetime, timezone

    limit = settings.AI_DAILY_REQUEST_LIMIT
    now = datetime.now(timezone.utc)
    for _ in range(limit):
        db.add(AIUsageLog(
            user_id=user["user_id"],
            requested_at=now,
            provider="gemini",
            model=GEMINI_MODEL,
            success=True,
            tokens_used=50,
        ))
    await db.flush()
    await db.commit()

    # Check usage is at limit
    usage_resp = await async_client.get("/api/v1/usage", headers=headers)
    assert usage_resp.json()["used"] == limit
    assert usage_resp.json()["remaining"] == 0

    # Next generate call must return 429
    gen_resp = await async_client.post(
        "/api/v1/ai/generate",
        json={"prompt": "One more plan"},
        headers=headers,
    )
    assert gen_resp.status_code == 429
    body = gen_resp.json()
    assert "limit" in body.get("detail", "").lower() or "limit" in str(body).lower()

    # Confirm no provider key in the 429 response
    resp_text = gen_resp.text
    assert "AIza" not in resp_text
    assert "gsk_" not in resp_text


# ──────────────────────────────────────────────────────────────────────────────
# 6. Usage resets on next UTC day
# ──────────────────────────────────────────────────────────────────────────────

async def test_usage_from_yesterday_does_not_count_today(async_client, db):
    """Rows from a previous UTC day do not count toward today's quota."""
    user = await register_user(async_client, email=make_unique_email("usage_reset"))

    # Insert a log from yesterday
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    db.add(AIUsageLog(
        user_id=user["user_id"],
        requested_at=yesterday,
        provider="gemini",
        model=GEMINI_MODEL,
        success=True,
        tokens_used=100,
    ))
    await db.flush()
    await db.commit()

    headers = auth_header(user["session_token"])
    resp = await async_client.get("/api/v1/usage", headers=headers)
    assert resp.status_code == 200
    # Yesterday's rows must not count
    assert resp.json()["used"] == 0


# ──────────────────────────────────────────────────────────────────────────────
# 7. Concurrent requests cannot bypass quota
# ──────────────────────────────────────────────────────────────────────────────

async def test_concurrent_requests_cannot_bypass_quota(async_client, db):
    """Rapidly concurrent requests near the limit should not exceed the quota."""
    user = await register_user(async_client, email=make_unique_email("usage_conc"))
    headers = auth_header(user["session_token"])

    # Set the limit to 3 for this test by pre-filling 2 success rows
    limit = settings.AI_DAILY_REQUEST_LIMIT
    pre_fill = limit - 1  # leave exactly 1 slot
    now = datetime.now(timezone.utc)
    for _ in range(pre_fill):
        db.add(AIUsageLog(
            user_id=user["user_id"],
            requested_at=now,
            provider="gemini",
            success=True,
        ))
    await db.flush()
    await db.commit()

    # Now fire 5 simultaneous requests — only 1 should succeed, rest get 429
    mock_result = {"text": "ok", "model": GEMINI_MODEL, "tokens_used": 10}

    async def fire_request():
        with patch.object(AIProviderService, "_call_gemini", new_callable=AsyncMock) as m:
            m.return_value = mock_result
            return await async_client.post(
                "/api/v1/ai/generate",
                json={"prompt": "test"},
                headers=headers,
            )

    responses = await asyncio.gather(*[fire_request() for _ in range(5)])
    statuses = [r.status_code for r in responses]

    success_count = statuses.count(200)
    too_many_count = statuses.count(429)

    # At most 1 request should succeed (the 1 remaining slot)
    assert success_count <= 1
    assert too_many_count >= 4


# ──────────────────────────────────────────────────────────────────────────────
# 8. User A cannot access User B's usage (IDOR protection)
# ──────────────────────────────────────────────────────────────────────────────

async def test_user_a_cannot_see_user_b_usage(async_client, db):
    """Usage is strictly user-scoped — User A's token only returns User A's data."""
    user_a = await register_user(async_client, email=make_unique_email("idor_a"))
    user_b = await register_user(async_client, email=make_unique_email("idor_b"))

    # Give User B some usage
    now = datetime.now(timezone.utc)
    for _ in range(5):
        db.add(AIUsageLog(
            user_id=user_b["user_id"],
            requested_at=now,
            provider="gemini",
            success=True,
        ))
    await db.flush()
    await db.commit()

    # User A queries their own usage — must see 0, not User B's 5
    headers_a = auth_header(user_a["session_token"])
    resp_a = await async_client.get("/api/v1/usage", headers=headers_a)
    assert resp_a.status_code == 200
    assert resp_a.json()["used"] == 0  # not User B's 5

    # User B sees their own 5
    headers_b = auth_header(user_b["session_token"])
    resp_b = await async_client.get("/api/v1/usage", headers=headers_b)
    assert resp_b.status_code == 200
    assert resp_b.json()["used"] == 5


# ──────────────────────────────────────────────────────────────────────────────
# 9. Provider API keys never appear in responses
# ──────────────────────────────────────────────────────────────────────────────

async def test_provider_keys_never_in_usage_response(async_client):
    """The usage response must never contain any provider key material."""
    user = await register_user(async_client, email=make_unique_email("key_leak_u"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/usage", headers=headers)
    text = resp.text

    # Common key prefixes that should never appear
    assert "AIza" not in text       # Gemini key prefix
    assert "gsk_" not in text       # Groq key prefix
    assert "GEMINI_API_KEY" not in text
    assert "GROQ_API_KEY" not in text
    assert "DEFAULT_GEMINI" not in text
    assert "DEFAULT_GROQ" not in text


async def test_provider_keys_never_in_generate_response(async_client):
    """The generate response must never contain provider key material."""
    user = await register_user(async_client, email=make_unique_email("key_leak_g"))
    headers = auth_header(user["session_token"])

    mock_result = {"text": "test response", "model": GEMINI_MODEL, "tokens_used": 10}
    with patch.object(AIProviderService, "_call_gemini", new_callable=AsyncMock) as m:
        m.return_value = mock_result
        resp = await async_client.post(
            "/api/v1/ai/generate",
            json={"prompt": "Give me a schedule"},
            headers=headers,
        )

    text = resp.text
    assert "AIza" not in text
    assert "gsk_" not in text
    assert "GEMINI_API_KEY" not in text
    assert "GROQ_API_KEY" not in text


async def test_provider_keys_never_in_status_response(async_client):
    """GET /ai/status returns only boolean availability, never key material."""
    user = await register_user(async_client, email=make_unique_email("key_leak_s"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/ai/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Must only have boolean fields
    assert "gemini_available" in data
    assert "groq_available" in data
    assert isinstance(data["gemini_available"], bool)
    assert isinstance(data["groq_available"], bool)

    # Absolutely no key material
    text = resp.text
    assert "AIza" not in text
    assert "gsk_" not in text


# ──────────────────────────────────────────────────────────────────────────────
# 10. Provider failures do not expose API keys & returns offline metadata
# ──────────────────────────────────────────────────────────────────────────────

async def test_provider_failure_does_not_expose_keys_and_returns_offline(async_client):
    """When Gemini and Groq both fail, response is safe and marked offline=True."""
    user = await register_user(async_client, email=make_unique_email("fail_nokey"))
    headers = auth_header(user["session_token"])

    with patch.object(AIProviderService, "_call_gemini", side_effect=RuntimeError("AIzaFakeKey123: quota exceeded")), \
         patch.object(AIProviderService, "_call_groq", side_effect=RuntimeError("gsk_fakeGroqKey: bad request")):
        resp = await async_client.post(
            "/api/v1/ai/generate",
            json={"prompt": "Fail gracefully"},
            headers=headers,
        )

    # Request succeeds at HTTP level (200), with offline metadata
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert data["provider"] == "offline"
    assert data["offline"] is True
    assert data["fallback_used"] is True

    # No key material in response
    text = resp.text
    assert "AIzaFakeKey" not in text
    assert "gsk_fakeGroqKey" not in text
    assert "AIza" not in text


# ──────────────────────────────────────────────────────────────────────────────
# 11. Gemini → Groq fallback works & returns explicit fallback metadata
# ──────────────────────────────────────────────────────────────────────────────

async def test_gemini_to_groq_fallback_on_gemini_failure(async_client):
    """When Gemini fails, Groq is tried and returns fallback_used=True, offline=False."""
    user = await register_user(async_client, email=make_unique_email("fallback"))
    headers = auth_header(user["session_token"])

    groq_result = {"text": '{"tasks":[{"title":"Study math"}]}', "model": GROQ_MODEL, "tokens_used": 50}

    with patch.object(AIProviderService, "_call_gemini", side_effect=RuntimeError("Gemini timeout")), \
         patch.object(AIProviderService, "_call_groq", new_callable=AsyncMock) as mock_groq:
        mock_groq.return_value = groq_result
        resp = await async_client.post(
            "/api/v1/ai/generate",
            json={"prompt": "Generate tasks"},
            headers=headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["provider"] == "groq"
    assert data["offline"] is False
    assert data["fallback_used"] is True
    assert "Study math" in data["text"] or data["text"]

    # Verify daily usage is incremented by exactly 1 (no double counting)
    usage_resp = await async_client.get("/api/v1/usage", headers=headers)
    assert usage_resp.status_code == 200
    assert usage_resp.json()["used"] == 1


async def test_gemini_success_returns_correct_metadata(async_client):
    """When Gemini succeeds, returns provider=gemini, offline=False, fallback_used=False."""
    user = await register_user(async_client, email=make_unique_email("gemini_ok"))
    headers = auth_header(user["session_token"])

    gemini_result = {"text": '{"tasks":[{"title":"Review Physics"}]}', "model": GEMINI_MODEL, "tokens_used": 42}

    with patch.object(AIProviderService, "_call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.return_value = gemini_result
        resp = await async_client.post(
            "/api/v1/ai/generate",
            json={"prompt": "Generate physics tasks"},
            headers=headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["provider"] == "gemini"
    assert data["offline"] is False
    assert data["fallback_used"] is False
    assert "Review Physics" in data["text"]


# ──────────────────────────────────────────────────────────────────────────────
# Providers router — deprecated endpoints return 410
# ──────────────────────────────────────────────────────────────────────────────

async def test_put_providers_returns_410_gone(async_client):
    """PUT /api/v1/providers is permanently deprecated — returns 410."""
    user = await register_user(async_client, email=make_unique_email("dep_put"))
    headers = auth_header(user["session_token"])

    resp = await async_client.put(
        "/api/v1/providers",
        json={"provider": "gemini", "api_key": "AIzaFakeKey"},
        headers=headers,
    )
    assert resp.status_code == 410
    # Deprecation message must not echo the submitted key
    assert "AIzaFakeKey" not in resp.text


async def test_delete_providers_returns_410_gone(async_client):
    """DELETE /api/v1/providers/{provider} is permanently deprecated — returns 410."""
    user = await register_user(async_client, email=make_unique_email("dep_del"))
    headers = auth_header(user["session_token"])

    resp = await async_client.delete("/api/v1/providers/gemini", headers=headers)
    assert resp.status_code == 410


async def test_get_providers_returns_server_managed_status(async_client):
    """GET /api/v1/providers now returns server-managed (boolean) status only."""
    user = await register_user(async_client, email=make_unique_email("prov_get_srv"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/providers", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Must have providers list
    assert "providers" in data
    for provider in data["providers"]:
        assert "provider" in provider
        assert "configured" in provider
        # masked_key must be None (no user keys, no key material)
        assert provider.get("masked_key") is None
        # No actual key substrings
        assert "AIza" not in str(provider)
        assert "gsk_" not in str(provider)


# ──────────────────────────────────────────────────────────────────────────────
# Unauthenticated access to provider status
# ──────────────────────────────────────────────────────────────────────────────

async def test_get_providers_unauthenticated_returns_401(async_client):
    """GET /providers without auth must return 401."""
    resp = await async_client.get("/api/v1/providers")
    assert resp.status_code == 401


async def test_get_ai_status_unauthenticated_returns_401(async_client):
    """GET /ai/status without auth must return 401."""
    resp = await async_client.get("/api/v1/ai/status")
    assert resp.status_code == 401


# ──────────────────────────────────────────────────────────────────────────────
# 12. Existing auth still works (smoke test — detailed tests in test_auth_*)
# ──────────────────────────────────────────────────────────────────────────────

async def test_existing_auth_register_unaffected(async_client):
    """Registration still works after AI migration."""
    user = await register_user(async_client, email=make_unique_email("auth_smoke"))
    assert user["session_token"]
    assert user["user_id"]


async def test_existing_auth_login_unaffected(async_client):
    """Login still works after AI migration."""
    email = make_unique_email("login_smoke")
    password = "TestPassword123!"
    await register_user(async_client, email=email, password=password)

    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
    assert "session_token" in resp.json()
