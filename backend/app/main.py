"""
StudyFlow AI — FastAPI Application Entry Point
─────────────────────────────────────────────────────────────
This is the central FastAPI app.  Every route module is registered here.

Startup sequence:
  1. FastAPI app is created
  2. Routers are included
  3. CORS middleware is added
  4. On startup: database tables are created / verified
  5. Uvicorn serves requests

The Electron frontend connects to this server at http://127.0.0.1:8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import get_settings

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("studyflow")


# ─── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────
    logger.info("StudyFlow AI Backend v%s starting...", settings.APP_VERSION)

    # Create / verify all database tables
    from database.init_db import init_db
    await init_db()

    # Ensure upload directory exists
    import os
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    logger.info("Backend ready — listening on %s:%s", settings.HOST, settings.PORT)
    yield

    # ── Shutdown ───────────────────────────────────────────────────────────
    from database.base import engine
    await engine.dispose()
    logger.info("Backend shut down cleanly.")


# ─── FastAPI Application ───────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "StudyFlow AI Platform API — the backend brain powering the "
        "StudyFlow AI desktop application."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# ─── CORS ─────────────────────────────────────────────────────────────────────
# Electron apps send requests from the file:// origin (or null).
# We explicitly allow those origins so the desktop app can talk to the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r".*",  # Electron uses file:// which doesn't match a string list
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# ─── Global Exception Handler ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception: %s %s — %s", request.method, request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "An internal server error occurred."},
    )


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"], include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "version": settings.APP_VERSION}


# ─── API Routers ──────────────────────────────────────────────────────────────
# Phase 1 — Auth
from app.api.auth.router import router as auth_router
app.include_router(auth_router, prefix="/api/v1")

# Phase 2 — AI, Memory, Profile (added when implemented)
# from app.api.ai.router import router as ai_router
# from app.api.memory.router import router as memory_router
# from app.api.profile.router import router as profile_router
# app.include_router(ai_router, prefix="/api/v1")
# app.include_router(memory_router, prefix="/api/v1")
# app.include_router(profile_router, prefix="/api/v1")

# Phase 3 — Planner, Analytics, Settings (added when implemented)
# Phase 4 — Friends, Notifications, WebSockets (added when implemented)
# Phase 5 — Uploads, Sync (added when implemented)
