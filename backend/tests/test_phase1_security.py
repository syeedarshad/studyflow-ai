"""
StudyFlow AI — Phase 1 Security & Deployment Hardening Tests
─────────────────────────────────────────────────────────────
Verifies:
  1. Health & Readiness endpoints (/health, /ready)
  2. Security Headers
  3. SlowAPI Rate Limiting & HTTP 429 Error Envelope
  4. Startup Validation (Development vs Production)
  5. Operational & Log Privacy Safeguards
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from database.base import get_db
from core.config import Settings, validate_production_settings


async def mock_get_db():
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_result.scalars.return_value.first.return_value = None
    session.execute.return_value = mock_result
    yield session


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = mock_get_db
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


def test_health_endpoint(client):
    """Verify GET /health returns status ok, version, and uptime."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime" in data


def test_ready_endpoint(client):
    """Verify GET /ready returns deployment readiness details."""
    response = client.get("/ready")
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data


def test_security_headers(client):
    """Verify production security headers are set on responses."""
    response = client.get("/health")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("Referrer-Policy") == "no-referrer"
    assert "Permissions-Policy" in response.headers


def test_rate_limiting_trigger(client):
    """Verify rate limiting triggers HTTP 429 after exceeding limit."""
    # AUTH_RATE_LIMIT_PER_MINUTE is set to 10.
    # Send 15 requests in rapid succession to trigger HTTP 429.
    responses = []
    for _ in range(15):
        res = client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent@studyflow.ai", "password": "wrongpassword123"},
        )
        responses.append(res)

    has_429 = any(r.status_code == 429 for r in responses)
    assert has_429, "Rate limiter did not trigger HTTP 429 on exceeding rate limit."

    # Check error response payload structure of the 429 response
    rate_limited_res = next(r for r in responses if r.status_code == 429)
    payload = rate_limited_res.json()
    assert payload["success"] is False
    assert "Rate limit exceeded" in payload["message"]
    assert len(payload["errors"]) > 0


def test_development_startup_validation():
    """Verify startup validation allows running with defaults in development mode."""
    dev_settings = Settings(ENVIRONMENT="development")
    # Should not raise any exception
    validate_production_settings(dev_settings)


def test_production_startup_validation_missing():
    """Verify production startup validation fails fast when required vars are missing."""
    prod_settings_missing = Settings(
        ENVIRONMENT="production",
        DATABASE_URL="",
        SESSION_SECRET="",
        ENCRYPTION_KEY="",
        MAIL_USERNAME="",
        MAIL_PASSWORD="",
        MAIL_SERVER="",
        MAIL_PORT=0,
        JWT_SECRET="",
    )
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_settings(prod_settings_missing)

    assert "PRODUCTION STARTUP FAILURE" in str(exc_info.value)
    assert "DATABASE_URL" in str(exc_info.value)
    assert "SESSION_SECRET" in str(exc_info.value)


def test_production_startup_validation_valid():
    """Verify production startup validation passes when all required vars are provided."""
    prod_settings_valid = Settings(
        ENVIRONMENT="production",
        # Use a non-default URL — must not contain the dev-default markers
        DATABASE_URL="postgresql+asyncpg://produser:prodpass@db.example.com:5432/studyflow_prod",
        DATABASE_SYNC_URL="postgresql+psycopg2://produser:prodpass@db.example.com:5432/studyflow_prod",
        SESSION_SECRET="super_secret_session_key_123456",
        ENCRYPTION_KEY="dGhpcy1pcy1hLXRlc3QtZmVybmV0LWtleTExMTExMTExMTE=",
        MAIL_USERNAME="smtp_user",
        MAIL_PASSWORD="smtp_password",
        MAIL_SERVER="smtp.gmail.com",
        MAIL_PORT=587,
        JWT_SECRET="super_secret_jwt_key_123456",
    )
    # Should not raise any exception
    validate_production_settings(prod_settings_valid)


def test_production_rejects_dev_default_database_url():
    """Verify production startup rejects the known development default DATABASE_URL.

    This is the key hardening test: if an operator starts the production server
    without setting DATABASE_URL, pydantic-settings supplies the dev default
    (studyflow:password@localhost). The validator must catch and reject it.
    """
    from core.config import Settings as _Settings
    prod_with_dev_db = _Settings(
        ENVIRONMENT="production",
        # Simulate what happens when DATABASE_URL is never set in the environment:
        # pydantic-settings uses the class-level default.
        DATABASE_URL="postgresql+asyncpg://studyflow:password@localhost:5432/studyflow_ai",
        DATABASE_SYNC_URL="postgresql+psycopg2://studyflow:password@localhost:5432/studyflow_ai",
        SESSION_SECRET="a-valid-session-secret-for-this-test",
        ENCRYPTION_KEY="dGhpcy1pcy1hLXRlc3QtZmVybmV0LWtleTExMTExMTExMTE=",
        MAIL_USERNAME="smtp@example.com",
        MAIL_PASSWORD="smtp_password",
        MAIL_SERVER="smtp.gmail.com",
        MAIL_PORT=587,
        JWT_SECRET="a-valid-jwt-secret-for-this-test-1234",
    )
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_settings(prod_with_dev_db)

    err = str(exc_info.value)
    assert "PRODUCTION STARTUP FAILURE" in err
    assert "development default credentials" in err
    assert "DATABASE_URL" in err


def test_production_accepts_real_localhost_url():
    """Verify production startup accepts a real localhost URL that is NOT the dev default.

    Some legitimate production setups run PostgreSQL on localhost (e.g. bare-metal
    server or a sidecar container). A URL with real credentials on localhost must
    not be rejected by the dev-default check.
    """
    prod_real_localhost = Settings(
        ENVIRONMENT="production",
        # Real credentials, different user/password/dbname — not the dev default
        DATABASE_URL="postgresql+asyncpg://realuser:realpassword@localhost:5432/production_db",
        DATABASE_SYNC_URL="postgresql+psycopg2://realuser:realpassword@localhost:5432/production_db",
        SESSION_SECRET="a-valid-session-secret-for-this-test",
        ENCRYPTION_KEY="dGhpcy1pcy1hLXRlc3QtZmVybmV0LWtleTExMTExMTExMTE=",
        MAIL_USERNAME="smtp@example.com",
        MAIL_PASSWORD="smtp_password",
        MAIL_SERVER="smtp.gmail.com",
        MAIL_PORT=587,
        JWT_SECRET="a-valid-jwt-secret-for-this-test-1234",
    )
    # Should not raise — real credentials on localhost are fine
    validate_production_settings(prod_real_localhost)
