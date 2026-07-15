"""
StudyFlow AI — Database Setup
─────────────────────────────────────────────────────────────
Async SQLAlchemy engine + session factory wired to the
PostgreSQL DATABASE_URL from settings.

Usage
─────
# In FastAPI route / dependency:
async with get_db() as session:
    result = await session.execute(...)
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from core.config import get_settings

settings = get_settings()

# ─── Async Engine ─────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,           # log SQL only in DEBUG mode
    pool_pre_ping=True,            # reconnect if the connection was dropped
    pool_size=10,
    max_overflow=20,
)

# ─── Session Factory ──────────────────────────────────────────────────────────
AsyncSessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,        # keep attributes accessible after commit
    autoflush=False,
    autocommit=False,
)

# ─── Base Model ───────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """All SQLAlchemy models inherit from this."""
    pass


# ─── Dependency ───────────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a database session per request.

        async def my_endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─── Convenience context manager (for startup / scripts) ─────────────────────
@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Use outside of FastAPI request context (e.g. in init_db scripts)."""
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
