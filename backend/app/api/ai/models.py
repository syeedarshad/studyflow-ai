"""
StudyFlow AI — AI Usage Log SQLAlchemy Model
─────────────────────────────────────────────────────────────
Records every AI request made through the backend proxy.
Used for per-user daily quota enforcement and usage display.

Design decisions:
  - prompt/response content is NOT stored (user privacy).
  - tokens_used is stored when reliably available from the provider.
  - error_code stores a short code (e.g. 'provider_error', 'quota_exceeded')
    on failure — never the raw exception message with credentials.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AIUsageLog(Base):
    __tablename__ = "ai_usage_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    # Provider used: 'gemini', 'groq', or 'none' on hard failure
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Model name as reported by the provider (e.g. 'gemini-2.5-flash')
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Whether the AI call ultimately succeeded (even via fallback)
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Token usage if reliably reported by the provider; None if unavailable
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Short error code on failure — NEVER contains raw exception text with keys
    # e.g. 'provider_error', 'quota_exceeded', 'timeout', 'no_key_configured'
    error_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    __table_args__ = (
        # Hot path: count today's requests for a given user
        Index("ix_ai_usage_logs_user_date", "user_id", "requested_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AIUsageLog id={self.id} user_id={self.user_id} "
            f"provider={self.provider!r} success={self.success}>"
        )
