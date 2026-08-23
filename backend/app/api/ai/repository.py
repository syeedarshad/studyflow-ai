"""
StudyFlow AI — AI Usage Repository
─────────────────────────────────────────────────────────────
Database queries for the ai_usage_logs table.
All queries are user-scoped — never return another user's data.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ai.models import AIUsageLog


def _today_utc_bounds() -> tuple[datetime, datetime]:
    """Returns (start_of_day_utc, now_utc) for today's quota window."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


class AIUsageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def count_today(self, user_id: int) -> int:
        """
        Returns the number of SUCCESSFUL AI requests made today (UTC)
        by the given user.  Only successful requests count toward quota.
        """
        start, _ = _today_utc_bounds()
        result = await self.db.execute(
            select(func.count(AIUsageLog.id)).where(
                AIUsageLog.user_id == user_id,
                AIUsageLog.requested_at >= start,
                AIUsageLog.success.is_(True),
            )
        )
        return result.scalar_one() or 0

    async def log_request(
        self,
        user_id: int,
        *,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        success: bool = False,
        tokens_used: Optional[int] = None,
        error_code: Optional[str] = None,
    ) -> AIUsageLog:
        """Insert a usage log row and flush (without committing — caller owns tx)."""
        row = AIUsageLog(
            user_id=user_id,
            requested_at=datetime.now(timezone.utc),
            provider=provider,
            model=model,
            success=success,
            tokens_used=tokens_used,
            error_code=error_code,
        )
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def get_today_summary(self, user_id: int, daily_limit: int) -> dict:
        """
        Returns a safe dict with usage stats for today (UTC).
        Used by GET /api/v1/usage.
        """
        start, now = _today_utc_bounds()
        used = await self.count_today(user_id)
        remaining = max(0, daily_limit - used)

        # Next reset is midnight UTC tomorrow
        from datetime import timedelta
        tomorrow = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        return {
            "used": used,
            "daily_limit": daily_limit,
            "remaining": remaining,
            "reset_at": tomorrow.isoformat().replace("+00:00", "Z"),
        }
