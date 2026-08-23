"""
StudyFlow AI — Onboarding & User Profile Context SQLAlchemy Model
─────────────────────────────────────────────────────────────
Stores canonical user onboarding information, profile context,
and metadata for document uploads (timetable, resume, study plan, notes).

PostgreSQL is the single source of truth. Vector store embeddings are derived
from this canonical data and strictly isolated per user.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserProfileContext(Base):
    __tablename__ = "user_profile_context"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Source type: 'onboarding_message', 'timetable', 'study_plan', 'resume', 'notes'
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Original text or extracted text content from document/message
    original_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Structured or extracted summary if available
    extracted_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Metadata (e.g. filename, file_size_bytes, mime_type, chunk_count, vector_ids)
    context_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # Content hash for duplicate / idempotency detection per user
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    # Processing lifecycle status: 'pending', 'processing', 'completed', 'failed'
    status: Mapped[str] = mapped_column(String(30), default="completed", nullable=False)

    # Meaningful error details if indexing or processing fails
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # Relationship back to User
    user: Mapped["User"] = relationship("User", back_populates="profile_contexts")

    __table_args__ = (
        Index("ix_user_profile_context_user_source", "user_id", "source_type"),
        Index("ix_user_profile_context_user_created", "user_id", "created_at"),
        Index("ix_user_profile_context_user_hash", "user_id", "content_hash"),
    )

    def __repr__(self) -> str:
        return (
            f"<UserProfileContext id={self.id} user_id={self.user_id} "
            f"source_type={self.source_type!r} status={self.status!r}>"
        )
