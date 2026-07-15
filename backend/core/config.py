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

    # ─── Email (OTP / Forgot Password) ────────────────────────────────────────
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@studyflow.ai"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_TLS: bool = True
    MAIL_SSL: bool = False

    OTP_EXPIRY_SECONDS: int = 600  # 10 minutes

    # ─── AI Providers ─────────────────────────────────────────────────────────
    # Application-level default keys (lowest priority — user keys take precedence).
    DEFAULT_GEMINI_KEY: str = ""
    DEFAULT_GROQ_KEY: str = ""
    DEFAULT_OPENAI_KEY: str = ""
    DEFAULT_ANTHROPIC_KEY: str = ""

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
        return self.ENVIRONMENT == "development"

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


@lru_cache()
def get_settings() -> Settings:
    """
    Returns the singleton Settings instance.
    Cached with lru_cache so the .env file is only parsed once.
    Use as a FastAPI dependency:  settings = Depends(get_settings)
    """
    return Settings()
