"""
StudyFlow AI — Auth SQLAlchemy Models
─────────────────────────────────────────────────────────────
Two tables:
  users    — one row per registered account
  sessions — one row per active desktop login

Session Design
──────────────
We store the SHA-256 HASH of the session token, never the plaintext.
The Electron client receives the plaintext token exactly once (on
login) and stores it via safeStorage.  On subsequent app launches it
sends the token in the Authorization header; the backend hashes it
and looks it up here.
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
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(
        String(254), nullable=False, unique=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Account state
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # OTP for email verification / password reset
    otp_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    otp_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    otp_purpose: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )  # 'verify_email' | 'reset_password'

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # Relationships
    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class Session(Base):
    """
    One row per active desktop session.
    token_hash is SHA-256(plaintext_token).
    The plaintext token lives only in the Electron client's safeStorage.
    """

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # The SHA-256 hex digest of the session token.  Unique per row so a
    # collision (astronomically unlikely) is caught at the DB level.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    # Human-readable device label (e.g. "Windows 11 / StudyFlow AI 2.0")
    device_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # IP at session creation — for the "Sessions" management UI
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)

    # last_seen is updated on every authenticated request so an admin
    # (or the user themselves) can see whether a session is still in use.
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    # For admin revocation: is_active=False immediately invalidates the session
    # without deleting the row (preserves the audit trail).
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="sessions")

    # Index for the hot path: validate token_hash → look up session
    __table_args__ = (
        Index("ix_sessions_token_hash", "token_hash"),
        Index("ix_sessions_user_id_active", "user_id", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<Session id={self.id} user_id={self.user_id} active={self.is_active}>"
