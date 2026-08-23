"""
StudyFlow AI — SlowAPI Rate Limiter Instance
────────────────────────────────────────────
Provides a single shared Limiter instance across the backend application.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
