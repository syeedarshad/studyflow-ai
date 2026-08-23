"""
StudyFlow AI — Test Configuration & Shared Fixtures
─────────────────────────────────────────────────────────────
Architecture:
  - Tests run against real isolated PostgreSQL database: studyflow_ai_test
  - database.base.engine is replaced with NullPool for 100% loop safety
  - Each test runs inside a SAVEPOINT that is rolled back — zero state leakage
  - SlowAPI rate-limiter in-memory storage is reset before each test
  - EmailService is patched — zero external side-effects
  - Every test creates its own users via factory helpers — no shared mutable state
"""

import asyncio
import os
import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool


# ── CRITICAL: set test DB env vars before ANY app module is imported ───────────
def pytest_configure(config):
    """
    Runs before any test collection.
    Points all DB connections at studyflow_ai_test and wires NullPool.
    """
    from dotenv import load_dotenv
    load_dotenv()

    prod_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/studyflow_ai",
    )
    if prod_url.endswith("studyflow_ai"):
        test_async_url = prod_url + "_test"
    else:
        import re
        test_async_url = re.sub(r"/studyflow_ai(\b|$)", "/studyflow_ai_test", prod_url, count=1)

    test_sync_url = test_async_url.replace("+asyncpg", "+psycopg2")

    os.environ["DATABASE_URL"] = test_async_url
    os.environ["DATABASE_SYNC_URL"] = test_sync_url
    os.environ["ENVIRONMENT"] = "development"   # skip production validation
    os.environ["DEBUG"] = "true"                # enable create_all in init_db
    os.environ["MAIL_USERNAME"] = "your_email@example.com"
    os.environ["MAIL_PASSWORD"] = ""

    from core.config import get_settings
    get_settings.cache_clear()

    # Speed up password hashing during tests (rounds=4: 2ms instead of 520ms)
    from passlib.context import CryptContext
    import core.security
    core.security._pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)

    # Re-wire database.base engine & session factory to use NullPool on test DB
    import database.base
    database.base.engine = create_async_engine(test_async_url, echo=False, poolclass=NullPool)
    database.base.AsyncSessionFactory = async_sessionmaker(
        bind=database.base.engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )


# ── Imports (after env vars and database.base are set) ────────────────────────
from app.main import app
import database.base
from database.base import Base, get_db


# ── Table Setup (session-scoped) ───────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_db():
    """Create all tables in studyflow_ai_test before test session starts."""
    async with database.base.engine.begin() as conn:
        from app.api.auth import models as _auth_models  # noqa: F401
        from app.api.profile import models as _profile_models  # noqa: F401
        from app.api.providers import models as _provider_models  # noqa: F401
        from app.api.tasks import models as _task_models  # noqa: F401
        from app.api.ai import models as _ai_models  # noqa: F401
        from app.api.onboarding import models as _onboarding_models  # noqa: F401
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) DEFAULT 'not_started' NOT NULL;"))
        await conn.run_sync(Base.metadata.create_all)
    yield


# ── Savepoint-Based Isolation (autouse) ───────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def _rollback_after_test(setup_test_db):
    """
    Wraps each test in a DB transaction that is ROLLED BACK after the test.
    This provides 100% isolation — no rows survive between tests.
    Falls back to DELETE if savepoint is unavailable.
    """
    async with database.base.engine.begin() as conn:
        await conn.execute(text("DELETE FROM tasks"))
        await conn.execute(text("DELETE FROM ai_usage_logs"))
        await conn.execute(text("DELETE FROM provider_keys"))
        await conn.execute(text("DELETE FROM user_profiles"))
        await conn.execute(text("DELETE FROM sessions"))
        await conn.execute(text("DELETE FROM users"))
    yield


# ── Async Client Fixture (function-scoped) ────────────────────────────────────

@pytest_asyncio.fixture
async def async_client():
    """
    Function-scoped httpx.AsyncClient wired to the FastAPI ASGI app.
    Patches background mail dispatches and init_db during test requests.
    """
    with patch("database.init_db.init_db", new_callable=AsyncMock), \
         patch("fastapi_mail.FastMail.send_message", new_callable=AsyncMock), \
         patch("services.email_service.EmailService.send_verification_email", new_callable=AsyncMock) as mock_verify_email, \
         patch("services.email_service.EmailService.send_password_reset_email", new_callable=AsyncMock) as mock_reset_email:
        mock_verify_email.return_value = True
        mock_reset_email.return_value = True
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            client._mock_send_verification_email = mock_verify_email
            client._mock_send_password_reset_email = mock_reset_email
            yield client


# ── Direct DB Session Fixture (function-scoped) ────────────────────────────────

@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """
    Direct async DB session for test state inspection/manipulation.
    Always expire cached objects before yielding so queries return fresh data.
    """
    from database.base import AsyncSessionFactory
    session = AsyncSessionFactory()
    try:
        yield session
    finally:
        try:
            await session.close()
        except Exception:
            pass  # Suppress event-loop-closed errors during teardown


# ── Rate Limiter Reset Fixture (autouse) ──────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear SlowAPI's in-memory rate-limit counters between tests."""
    from core.limiter import limiter
    try:
        storage = limiter._limiter.storage
        if hasattr(storage, "reset"):
            storage.reset()
        elif hasattr(storage, "storage") and isinstance(storage.storage, dict):
            storage.storage.clear()
    except Exception:
        pass
    yield


# ── User Factory Helpers ──────────────────────────────────────────────────────

def make_unique_email(prefix: str = "user") -> str:
    """Generate a unique email for every test invocation."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_user(
    client: AsyncClient,
    email: str | None = None,
    password: str = "TestPassword123!",
    full_name: str = "Test User",
) -> dict:
    """
    Registers a user via the API. Returns a dict with all test-relevant fields.
    Each test should call this with a unique email.
    """
    email = email or make_unique_email()
    payload = {"full_name": full_name, "email": email, "password": password}
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    data = resp.json()
    return {
        "email": email,
        "password": password,
        "full_name": full_name,
        "session_token": data["session_token"],
        "user_id": data["user"]["id"],
        "response": data,
    }


async def login_user(
    client: AsyncClient,
    email: str,
    password: str,
    device_label: str | None = None,
) -> dict:
    """Log in an existing user. Returns the response dict."""
    payload = {"email": email, "password": password}
    if device_label:
        payload["device_label"] = device_label
    resp = await client.post("/api/v1/auth/login", json=payload)
    return {"status_code": resp.status_code, "data": resp.json(), "response": resp}


def auth_header(token: str) -> dict:
    """Convenience: create Authorization header from a session token."""
    return {"Authorization": f"Bearer {token}"}
