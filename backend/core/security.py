"""
StudyFlow AI — Security Utilities
─────────────────────────────────────────────────────────────
Implements the persistent desktop-session auth model.

Session Token Design
────────────────────
We deliberately do NOT use JWT, refresh tokens, or short-lived
access tokens.  StudyFlow AI is a desktop application; the session
model should feel like Discord, Steam, or VS Code — you log in once
and you're in until you explicitly sign out or an admin revokes your
access.

How it works:
  1. On login, the backend generates a cryptographically secure
     random 64-byte token (via secrets.token_urlsafe).
  2. Only the SHA-256 HASH of that token is stored in PostgreSQL.
     The plaintext token is returned to Electron exactly once and
     stored there using safeStorage (OS-level encryption: DPAPI on
     Windows, Keychain on macOS).
  3. On every app launch Electron sends the stored token in the
     Authorization header.  The backend hashes it, looks it up in
     the sessions table, and returns the user.
  4. Sessions have no built-in expiry (SESSION_TOKEN_LIFETIME_SECONDS=0).
     They are invalidated only by:
       • Explicit logout (single session or all sessions)
       • Password reset (invalidates all sessions)
       • Admin revocation
       • A non-zero SESSION_TOKEN_LIFETIME_SECONDS setting
"""

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional

from cryptography.fernet import Fernet
from passlib.context import CryptContext

# ─── Password Hashing ─────────────────────────────────────────────────────────
# bcrypt via passlib.  SALT_ROUNDS=12 matches the existing frontend bcryptjs.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain: str) -> str:
    """Returns a bcrypt hash of the plaintext password."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Returns True if plain matches the stored hash.
    Always does a full bcrypt compare even if the email doesn't exist
    (timing-safe: caller passes a dummy hash for unknown emails).
    """
    return _pwd_context.verify(plain, hashed)


# ─── Session Token ────────────────────────────────────────────────────────────
def generate_session_token() -> str:
    """
    Returns a cryptographically secure random token (86 URL-safe base64 chars).
    This is the value returned to the Electron client on login and stored
    via safeStorage — it must NEVER be written to the database.
    """
    return secrets.token_urlsafe(64)


def hash_session_token(token: str) -> str:
    """
    Returns the SHA-256 hex digest of the session token.
    This is what gets stored in the `sessions` table.
    Choosing SHA-256 (vs bcrypt) here is intentional:
      - Session tokens are 64 random bytes (512 bits of entropy) so
        dictionary / brute-force attacks against the hash are infeasible.
      - SHA-256 is O(n) — fast enough to be called on every API request
        without adding measurable latency.
      - bcrypt would add 100-200ms per request, turning a fast desktop
        app into a sluggish one for no security benefit.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def verify_session_token(token: str, stored_hash: str) -> bool:
    """Constant-time comparison of the token hash against the stored hash."""
    return secrets.compare_digest(
        hash_session_token(token),
        stored_hash,
    )


# ─── OTP Generation ───────────────────────────────────────────────────────────
def generate_otp(length: int = 6) -> str:
    """Returns a zero-padded numeric OTP (e.g. '048291')."""
    return str(secrets.randbelow(10**length)).zfill(length)


# ─── API Key Encryption (Fernet / AES-128-CBC) ────────────────────────────────
# API keys entered by users are encrypted with a server-side Fernet key
# before being written to the database, so even a raw DB dump never
# reveals any provider secrets.

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    """Lazily initialises the Fernet cipher from settings."""
    global _fernet
    if _fernet is None:
        from core.config import get_settings
        key = get_settings().ENCRYPTION_KEY
        if not key:
            # Development fallback: generate a temporary key.
            # In production ENCRYPTION_KEY must be set in the environment.
            import warnings
            warnings.warn(
                "ENCRYPTION_KEY is not set — using an ephemeral key. "
                "All encrypted values will be unreadable after restart.",
                RuntimeWarning,
                stacklevel=2,
            )
            key = Fernet.generate_key().decode()
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_api_key(plaintext: str) -> str:
    """
    Encrypts an API key with the server-side Fernet key.
    Returns a URL-safe base64 ciphertext string safe to store in the DB.
    """
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """
    Decrypts an API key.  Returns '' on any failure so callers can
    treat it as 'key not configured' rather than crash.
    """
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except Exception:
        return ""
