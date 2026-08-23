"""
Phase 2.1 — Rate Limiting Tests
Verifies that SlowAPI correctly enforces request-rate limits on auth endpoints.

Strategy: exceed the configured AUTH_RATE_LIMIT_PER_MINUTE by sending rapid
bursts, then assert a 429 is eventually returned with the correct error schema.
"""
import pytest


# ── Rate Limit on Login ───────────────────────────────────────────────────────

async def test_rate_limit_login_triggers_429(async_client):
    """Sending >10 rapid login requests must produce at least one 429."""
    limit = 10
    responses = []
    for _ in range(limit + 5):
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": "ratelimit@test.com", "password": "wrongpass123!"},
        )
        responses.append(resp)

    status_codes = [r.status_code for r in responses]
    assert 429 in status_codes, (
        f"Expected at least one 429 after {limit+5} requests, got: {set(status_codes)}"
    )


# ── Rate Limit on Register ───────────────────────────────────────────────────

async def test_rate_limit_register_triggers_429(async_client):
    """Sending >10 rapid register requests must produce at least one 429."""
    responses = []
    for i in range(15):
        resp = await async_client.post(
            "/api/v1/auth/register",
            json={
                "full_name": f"User{i}",
                "email": f"ratelimitreg{i}@test.com",
                "password": "StrongPass123!",
            },
        )
        responses.append(resp)

    status_codes = [r.status_code for r in responses]
    assert 429 in status_codes, (
        f"Expected at least one 429 after 15 requests, got: {set(status_codes)}"
    )


# ── Rate Limit Response Schema ───────────────────────────────────────────────

async def test_rate_limit_response_schema(async_client):
    """429 responses follow the standard error envelope."""
    responses = []
    for _ in range(15):
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": "schema@test.com", "password": "wrongpass123!"},
        )
        responses.append(resp)

    rate_limited = [r for r in responses if r.status_code == 429]
    assert rate_limited, "No 429 responses found — rate limiter may not be active"

    payload = rate_limited[0].json()
    assert payload["success"] is False
    assert "message" in payload
    assert "rate limit" in payload["message"].lower()
    assert isinstance(payload.get("errors"), list)
    assert len(payload["errors"]) > 0


# ── Rate Limit: HTTP 429 Status Code ─────────────────────────────────────────

async def test_rate_limit_returns_http_429(async_client):
    """The rate-limited response must use HTTP status 429 Too Many Requests."""
    responses = []
    for _ in range(15):
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={"email": "http429@test.com", "password": "wrongpass123!"},
        )
        responses.append(resp)

    rate_limited = [r for r in responses if r.status_code == 429]
    assert len(rate_limited) > 0, "Rate limiter did not trigger HTTP 429"
    # Verify the actual status code is 429 (not some custom code)
    assert rate_limited[0].status_code == 429
