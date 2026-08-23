"""
StudyFlow AI — Application Configuration
─────────────────────────────────────────────────────────────
Loads all settings from environment variables / .env file.
Pydantic BaseSettings validates and type-casts every value at
startup so the rest of the application never touches raw strings.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic import AnyHttpUrl, EmailStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Application ─────────────────────────────────────────────────────────
    APP_NAME: str = "StudyFlow AI"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"  # development | staging | production

    # ─── Server ───────────────────────────────────────────────────────────────
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # ─── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://studyflow:password@localhost:5432/studyflow_ai"
    DATABASE_SYNC_URL: str = "postgresql+psycopg2://studyflow:password@localhost:5432/studyflow_ai"

    # ─── Security ────────────────────────────────────────────────────────────
    # Fernet key for encrypting AI API keys at rest.
    ENCRYPTION_KEY: str = ""

    # Session / JWT security secrets
    SESSION_SECRET: str = ""
    JWT_SECRET: str = ""

    # Allowed hosts for TrustedHostMiddleware
    ALLOWED_HOSTS: str = "127.0.0.1,localhost,testserver"

    # Desktop session behaviour:  0 = permanent (Discord / Steam style).
    # Non-zero values are checked as a simple last_seen window so an
    # abandoned device can be force-expired by an admin if needed.
    SESSION_TOKEN_LIFETIME_SECONDS: int = 0  # 0 = no expiry

    # ─── CORS ────────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS into a list, plus always allow local Electron origins."""
        base = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        # Electron apps use null origin or file:// — add both to avoid 401 on desktop
        extra = ["null", "file://"]
        return list(set(base + extra))

    @property
    def allowed_hosts_list(self) -> List[str]:
        """Parse ALLOWED_HOSTS into a clean list."""
        if not self.ALLOWED_HOSTS or self.ALLOWED_HOSTS == "*":
            return ["*"]
        return [h.strip() for h in self.ALLOWED_HOSTS.split(",") if h.strip()]

    # ─── Email (OTP / Forgot Password) ────────────────────────────────────────
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@studyflow.ai"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_TLS: bool = True
    MAIL_SSL: bool = False

    OTP_EXPIRY_SECONDS: int = 600  # 10 minutes

    # ─── AI Providers ─────────────────────────────────────────────────────
    # Server-side provider credentials.  NEVER returned to frontend.
    # These are the canonical names; DEFAULT_* aliases below are for
    # backward-compat with existing .env files during transition.
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # Deprecated aliases — kept so existing .env files still work.
    # Prefer GEMINI_API_KEY / GROQ_API_KEY going forward.
    DEFAULT_GEMINI_KEY: str = ""
    DEFAULT_GROQ_KEY: str = ""
    DEFAULT_OPENAI_KEY: str = ""
    DEFAULT_ANTHROPIC_KEY: str = ""

    # ─── AI Usage Quota ───────────────────────────────────────────────────
    AI_DAILY_REQUEST_LIMIT: int = 50

    # ─── File Storage ─────────────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # ─── Rate Limiting ────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60
    AUTH_RATE_LIMIT_PER_MINUTE: int = 10

    # ─── Logging ─────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.lower() == "development"

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def effective_gemini_key(self) -> str:
        """Returns GEMINI_API_KEY, falling back to DEFAULT_GEMINI_KEY for transition."""
        return self.GEMINI_API_KEY or self.DEFAULT_GEMINI_KEY

    @property
    def effective_groq_key(self) -> str:
        """Returns GROQ_API_KEY, falling back to DEFAULT_GROQ_KEY for transition."""
        return self.GROQ_API_KEY or self.DEFAULT_GROQ_KEY


# ─── Known development database URL markers ──────────────────────────────────
# These substrings appear in the pydantic-settings default values for
# DATABASE_URL and DATABASE_SYNC_URL.  If a production deployment ships without
# setting those env vars, pydantic will supply these defaults silently — the
# application would then try to connect to a local PostgreSQL instance that
# almost certainly does not exist in a Docker/cloud environment.
#
# validate_production_settings() rejects any DATABASE_URL that still contains
# these markers when ENVIRONMENT=production, forcing the operator to supply a
# real URL explicitly.
_DEV_DB_MARKERS = (
    "studyflow:password@localhost",   # exact credentials in both default URLs
    "@localhost:5432/studyflow_ai",   # host+port+dbname pattern from defaults
)


def _is_dev_db_url(url: str) -> bool:
    """Return True if the URL looks like the known development default."""
    return any(marker in url for marker in _DEV_DB_MARKERS)


@lru_cache()
def get_settings() -> Settings:
    """
    Returns the singleton Settings instance.
    Cached with lru_cache so the .env file is only parsed once.
    Use as a FastAPI dependency:  settings = Depends(get_settings)
    """
    return Settings()


def validate_production_settings(settings: Optional[Settings] = None) -> None:
    """
    Validates required production environment settings during app startup.

    Raises RuntimeError if ENVIRONMENT=production and:
      - Any required environment variable is missing or blank, OR
      - DATABASE_URL / DATABASE_SYNC_URL still contains the known
        development default credentials (meaning the operator forgot to
        set the real URL in the deployment environment).

    Development mode (ENVIRONMENT != 'production') is not affected.
    """
    if settings is None:
        settings = get_settings()

    if settings.ENVIRONMENT.lower() != "production":
        return

    import logging
    logger = logging.getLogger("studyflow.startup")

    missing: List[str] = []
    invalid: List[str] = []

    # ── Required: must be explicitly supplied ──────────────────────────────────
    if not settings.DATABASE_URL:
        missing.append("DATABASE_URL")
    if not settings.SESSION_SECRET:
        missing.append("SESSION_SECRET")
    if not settings.ENCRYPTION_KEY:
        missing.append("ENCRYPTION_KEY")
    if not settings.MAIL_USERNAME:
        missing.append("MAIL_USERNAME")
    if not settings.MAIL_PASSWORD:
        missing.append("MAIL_PASSWORD")
    if not settings.MAIL_SERVER:
        missing.append("MAIL_SERVER")
    if not settings.MAIL_PORT:
        missing.append("MAIL_PORT")
    if not settings.JWT_SECRET:
        missing.append("JWT_SECRET")

    # ── Fail-fast: reject known development default database URLs ─────────────
    # If DATABASE_URL was never set in the environment, pydantic-settings
    # supplies the development default, which is non-empty and would pass the
    # "not empty" check above while still pointing at a local dev database.
    if settings.DATABASE_URL and _is_dev_db_url(settings.DATABASE_URL):
        invalid.append(
            "DATABASE_URL contains development default credentials "
            "(studyflow:password@localhost). Set a real production DATABASE_URL."
        )
    if settings.DATABASE_SYNC_URL and _is_dev_db_url(settings.DATABASE_SYNC_URL):
        invalid.append(
            "DATABASE_SYNC_URL contains development default credentials "
            "(studyflow:password@localhost). Set a real production DATABASE_SYNC_URL."
        )

    # ── Warn (not fail) if no AI keys: app works but AI features are degraded ──
    if not settings.effective_gemini_key and not settings.effective_groq_key:
        logger.warning(
            "PRODUCTION WARNING: Neither GEMINI_API_KEY nor GROQ_API_KEY is set. "
            "AI features will be unavailable."
        )

    errors = missing + invalid
    if errors:
        error_msg = (
            "PRODUCTION STARTUP FAILURE: The following required environment "
            f"variables are missing or misconfigured: {'; '.join(errors)}"
        )
        logger.critical(error_msg)
        raise RuntimeError(error_msg)

    logger.info("Production configuration validation passed successfully.")
