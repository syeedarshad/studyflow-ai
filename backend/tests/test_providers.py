"""
Phase 2.2 — AI Provider Vault Tests (Updated for Phase 4)
─────────────────────────────────────────────────────────────
As of Phase 4, provider credentials are server-side only.
Write endpoints (PUT / DELETE) now return 410 Gone.
GET endpoints return server-managed boolean status.

Tests verify:
  - GET /providers returns server-managed status (no user keys)
  - PUT /providers returns 410 (deprecated)
  - DELETE /providers/{provider} returns 410 (deprecated)
  - No plaintext API keys ever returned
  - Auth still required for all endpoints
"""

import pytest
from tests.conftest import auth_header, make_unique_email, register_user


# ── GET /api/v1/providers — Server-managed status ────────────────────────────

async def test_list_providers_returns_server_managed_status(async_client):
    """GET /providers returns server-managed availability (boolean), not user keys."""
    user = await register_user(async_client, email=make_unique_email("prov_list_v2"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/providers", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    providers = data["providers"]
    assert len(providers) >= 2  # at least gemini + groq

    provider_names = {p["provider"] for p in providers}
    assert "gemini" in provider_names
    assert "groq" in provider_names

    for p in providers:
        # No actual key material in any field
        assert "AIza" not in str(p)
        assert "gsk_" not in str(p)
        # masked_key is None — we no longer show masked user keys
        assert p.get("masked_key") is None


async def test_list_providers_unauthorized_401(async_client):
    """GET /providers returns 401 without authentication."""
    resp = await async_client.get("/api/v1/providers")
    assert resp.status_code == 401


# ── GET /api/v1/providers/{provider} — Single provider status ────────────────

async def test_get_specific_provider_status_gemini(async_client):
    """GET /providers/gemini returns server-managed status."""
    user = await register_user(async_client, email=make_unique_email("prov_get_gem"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/providers/gemini", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "gemini"
    assert isinstance(data["configured"], bool)
    assert data.get("masked_key") is None
    # No key material
    assert "AIza" not in resp.text


async def test_get_specific_provider_status_groq(async_client):
    """GET /providers/groq returns server-managed status."""
    user = await register_user(async_client, email=make_unique_email("prov_get_groq"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/providers/groq", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "groq"
    assert isinstance(data["configured"], bool)
    assert data.get("masked_key") is None


async def test_get_unknown_provider_returns_not_configured(async_client):
    """GET /providers/unknown_ai returns configured=False (not 400 anymore)."""
    user = await register_user(async_client, email=make_unique_email("prov_unknown"))
    headers = auth_header(user["session_token"])

    resp = await async_client.get("/api/v1/providers/unknown_ai", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


# ── PUT /api/v1/providers — DEPRECATED (410 Gone) ────────────────────────────

async def test_put_providers_returns_410(async_client):
    """PUT /providers returns 410 Gone — user key management deprecated."""
    user = await register_user(async_client, email=make_unique_email("prov_put_410"))
    headers = auth_header(user["session_token"])

    resp = await async_client.put(
        "/api/v1/providers",
        json={"provider": "gemini", "api_key": "AIzaFakeTestKey123456"},
        headers=headers,
    )
    assert resp.status_code == 410
    # The submitted key must NOT appear in the response
    assert "AIzaFakeTestKey123456" not in resp.text
    assert resp.json()["success"] is False


async def test_put_providers_unauthorized_401(async_client):
    """PUT /providers without auth still returns 401 (auth checked first)."""
    resp = await async_client.put(
        "/api/v1/providers",
        json={"provider": "gemini", "api_key": "AIzaSomething"},
    )
    assert resp.status_code == 401


# ── DELETE /api/v1/providers/{provider} — DEPRECATED (410 Gone) ───────────────

async def test_delete_providers_returns_410(async_client):
    """DELETE /providers/{provider} returns 410 Gone — deprecated."""
    user = await register_user(async_client, email=make_unique_email("prov_del_410"))
    headers = auth_header(user["session_token"])

    resp = await async_client.delete("/api/v1/providers/gemini", headers=headers)
    assert resp.status_code == 410
    assert resp.json()["success"] is False


async def test_delete_providers_groq_returns_410(async_client):
    """DELETE /providers/groq returns 410 Gone."""
    user = await register_user(async_client, email=make_unique_email("prov_del_groq"))
    headers = auth_header(user["session_token"])

    resp = await async_client.delete("/api/v1/providers/groq", headers=headers)
    assert resp.status_code == 410


# ── Security: no credentials in any provider response ───────────────────────

async def test_no_credentials_in_any_provider_endpoint(async_client):
    """All /providers responses must be completely clean of credential material."""
    user = await register_user(async_client, email=make_unique_email("cred_clean"))
    headers = auth_header(user["session_token"])

    endpoints = [
        ("GET", "/api/v1/providers"),
        ("GET", "/api/v1/providers/gemini"),
        ("GET", "/api/v1/providers/groq"),
    ]

    for method, url in endpoints:
        resp = await async_client.request(method, url, headers=headers)
        assert resp.status_code in (200, 410)
        assert "AIza" not in resp.text, f"Key found in {method} {url}"
        assert "gsk_" not in resp.text, f"Key found in {method} {url}"
        assert "GEMINI_API_KEY" not in resp.text
        assert "GROQ_API_KEY" not in resp.text
        assert "DEFAULT_GEMINI" not in resp.text
