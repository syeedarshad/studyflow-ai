"""
Phase 2.1 — Health & Readiness Tests
Tests for GET /health, GET /ready, and security headers.
"""
import pytest


# ── GET /health ───────────────────────────────────────────────────────────────

async def test_health_returns_200(async_client):
    """GET /health returns 200 OK."""
    resp = await async_client.get("/health")
    assert resp.status_code == 200


async def test_health_response_schema(async_client):
    """GET /health contains status=ok, version, and uptime."""
    resp = await async_client.get("/health")
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime" in data
    assert isinstance(data["uptime"], (int, float))
    assert data["uptime"] >= 0


async def test_health_not_exposing_secrets(async_client):
    """Health endpoint must not expose DB credentials, secrets, or env vars."""
    resp = await async_client.get("/health")
    body = resp.text.lower()
    for sensitive in ("password", "secret", "key", "token", "credential"):
        assert sensitive not in body, f"Sensitive word '{sensitive}' found in /health response"


# ── GET /ready ────────────────────────────────────────────────────────────────

async def test_ready_returns_status(async_client):
    """GET /ready returns 200 or 503 with a status field."""
    resp = await async_client.get("/ready")
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "status" in data


async def test_ready_200_includes_database_status(async_client):
    """GET /ready, when DB is connected, includes database and environment fields."""
    resp = await async_client.get("/ready")
    if resp.status_code == 200:
        data = resp.json()
        assert data["status"] == "ready"
        assert "database" in data
        assert "version" in data


# ── Security Headers ─────────────────────────────────────────────────────────

async def test_security_headers_present(async_client):
    """All required security headers are present on every response."""
    resp = await async_client.get("/health")
    headers = resp.headers
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "no-referrer"
    assert "permissions-policy" in headers
    assert headers.get("x-xss-protection") == "1; mode=block"


async def test_security_headers_on_auth_endpoint(async_client):
    """Security headers are also present on auth API endpoints."""
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "test@test.com", "password": "TestPass123!"},
    )
    headers = resp.headers
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "no-referrer"
