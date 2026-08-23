"""
StudyFlow AI — Provider Key SQLAlchemy Models
─────────────────────────────────────────────────────────────
Stores Fernet-encrypted AI provider API keys per user with optimistic versioning.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProviderKey(Base):
    __tablename__ = "provider_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    encrypted_key: Mapped[str] = mapped_column(Text, nullable=False)

    # Optimistic versioning for offline sync conflict resolution
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_provider"),
        Index("ix_provider_keys_user_provider", "user_id", "provider"),
    )

    def __repr__(self) -> str:
        return f"<ProviderKey user_id={self.user_id} provider={self.provider!r} version={self.version}>"
