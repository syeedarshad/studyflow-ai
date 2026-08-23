"""
StudyFlow AI — FastAPI Application Entry Point
─────────────────────────────────────────────────────────────
This is the central FastAPI app. Every route module is registered here.

Startup sequence:
  1. Startup configuration validation (fails fast if production settings missing)
  2. Database connectivity check & table init
  3. Security middleware & CORS applied
  4. Rate limiting & domain exception handlers registered
  5. API routes & health/readiness endpoints registered
"""

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.common.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    DomainValidationError,
    NotFoundError,
    StudyFlowError,
)
from core.config import get_settings, validate_production_settings
from core.limiter import limiter

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("studyflow")

start_time = time.time()


# ─── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────
    logger.info("StudyFlow AI Backend v%s starting...", settings.APP_VERSION)

    # 1. Startup validation (validate production configuration settings)
    validate_production_settings(settings)

    # 2. Create / verify all database tables
    from database.init_db import init_db
    await init_db()

    # 3. Ensure upload directory exists
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
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
)

# Attach SlowAPI limiter to app state
app.state.limiter = limiter


# ─── Trusted Host Middleware ──────────────────────────────────────────────────
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts_list,
)


# ─── Security Headers Middleware ──────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-XSS-Protection"] = "1; mode=block"

    if not settings.is_development:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


# ─── CORS ─────────────────────────────────────────────────────────────────────
# Development allows flexible regex matching for local desktop dev;
# Production locks down allowed origins to explicitly configured CORS_ORIGINS list.
if settings.is_development:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_origin_regex=r".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )


# ─── Rate Limit Exceeded Handler ──────────────────────────────────────────────
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    logger.warning("Rate limit exceeded for IP %s on %s", request.client.host if request.client else "unknown", request.url)
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "success": False,
            "message": "Rate limit exceeded. Please try again later.",
            "detail": f"Rate limit exceeded: {exc.detail}",
            "data": None,
            "errors": [f"Rate limit exceeded: {exc.detail}"],
        },
    )



# ─── Domain Exception Handlers ────────────────────────────────────────────────

@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    logger.info("Not found: %s %s — %s", request.method, request.url, exc.message)
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "errors": [exc.message],
        },
    )


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
    logger.info("Conflict: %s %s — %s", request.method, request.url, exc.message)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "errors": [exc.message],
        },
    )


@app.exception_handler(AuthenticationError)
async def authentication_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
    logger.info("Authentication error: %s %s — %s", request.method, request.url, exc.message)
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "errors": [exc.message],
        },
    )


@app.exception_handler(AuthorizationError)
async def authorization_handler(request: Request, exc: AuthorizationError) -> JSONResponse:
    logger.info("Authorization error: %s %s — %s", request.method, request.url, exc.message)
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "errors": [exc.message],
        },
    )


@app.exception_handler(DomainValidationError)
async def domain_validation_handler(request: Request, exc: DomainValidationError) -> JSONResponse:
    errors = [f"{exc.field}: {exc.message}"] if exc.field else [exc.message]
    logger.info("Domain validation: %s %s — %s", request.method, request.url, exc.message)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "errors": errors,
        },
    )


@app.exception_handler(StudyFlowError)
async def studyflow_error_handler(request: Request, exc: StudyFlowError) -> JSONResponse:
    """Catch-all for any StudyFlowError subclass not handled above."""
    logger.warning("StudyFlow domain error: %s %s — %s", request.method, request.url, exc.message)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "errors": [exc.message],
        },
    )


# ─── Global Exception Handler (last resort) ────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception: %s %s — %s", request.method, request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "An internal server error occurred."},
    )


# ─── Health & Readiness Endpoints ─────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health() -> dict:
    """Lightweight deployment health endpoint."""
    uptime = time.time() - start_time
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "uptime": round(uptime, 2),
    }


@app.get("/ready", tags=["System"])
async def ready() -> JSONResponse:
    """Deployment readiness endpoint verifying database connectivity & config."""
    from database.base import engine
    from sqlalchemy import text

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "ready",
                "database": "connected",
                "version": settings.APP_VERSION,
                "environment": settings.ENVIRONMENT,
            },
        )
    except Exception as exc:
        logger.error("Readiness check failed: %s", str(exc))
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "database": "disconnected",
                "errors": ["Database connection check failed."],
            },
        )


# ─── API Routers ──────────────────────────────────────────────────────────────
# Phase 1 — Auth
from app.api.auth.router import router as auth_router
app.include_router(auth_router, prefix="/api/v1")

# Phase 2.2 — User Profile & AI Provider Vault
from app.api.profile.router import router as profile_router
from app.api.providers.router import router as provider_router
app.include_router(profile_router, prefix="/api/v1")
app.include_router(provider_router, prefix="/api/v1")

# Phase 3 — Tasks Architecture
from app.api.tasks.router import router as tasks_router
app.include_router(tasks_router, prefix="/api/v1")

# Phase 4 — Server-Managed AI Provider & Usage
from app.api.ai.router import ai_router, usage_router
app.include_router(ai_router, prefix="/api/v1")
app.include_router(usage_router, prefix="/api/v1")

# Onboarding & Personal RAG Context
from app.api.onboarding.router import router as onboarding_router
app.include_router(onboarding_router, prefix="/api/v1")


# ─── OpenAPI / Swagger Documentation Enhancement ──────────────────────────────
# Injects an HTTP Bearer security scheme so the Swagger UI "Authorize" button
# appears and protected endpoints display the lock icon.
#
# ▸ This block is DOCUMENTATION ONLY — it has zero runtime effect.
# ▸ No auth logic, session validation, token generation, or database schema
#   is modified.  The actual authentication is performed by `require_auth`
#   in app/api/auth/dependencies.py, which is entirely unchanged.
# ▸ Electron clients are unaffected: they send `Authorization: Bearer <token>`
#   regardless of what the OpenAPI schema says about security.
# ▸ The override only runs when /openapi.json is fetched (i.e. when Swagger UI
#   loads), never on any real API request.

if settings.is_development:
    from fastapi.openapi.utils import get_openapi

    # Paths that require a valid Bearer session token.
    # Public endpoints (login, register, verify-otp, forgot-password, etc.)
    # are deliberately omitted — they must remain open in Swagger UI.
    _BEARER_PROTECTED_PREFIXES: tuple[str, ...] = (
        "/api/v1/auth/session",        # GET  — validate session on app launch
        "/api/v1/auth/me",             # GET  — current user
        "/api/v1/auth/sessions",       # GET  — list sessions; DELETE — revoke
        "/api/v1/auth/logout",         # POST — sign out current session
        "/api/v1/auth/logout-all",     # POST — sign out all devices
        "/api/v1/profile",             # GET / PUT / PATCH / DELETE — all protected
        "/api/v1/providers",           # GET / PUT / DELETE — all protected
        "/api/v1/tasks",               # GET / POST / PATCH / DELETE — all protected
        "/api/v1/ai",                  # POST /generate, GET /status — all protected
        "/api/v1/usage",               # GET — per-user usage summary
        "/api/v1/onboarding",          # POST /message, /upload, /skip, /complete, GET /status — all protected
    )

    def _custom_openapi() -> dict:
        """
        Builds the OpenAPI schema once, caches it on `app.openapi_schema`,
        then returns the cached copy on every subsequent call.

        Changes made versus the default FastAPI schema:
          1. Adds `components.securitySchemes.BearerAuth` (HTTP Bearer).
          2. Sets `security: [{BearerAuth: []}]` on every protected operation.
        """
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )

        # 1. Register the security scheme so Swagger UI renders the
        #    "Authorize" button and the padlock on protected operations.
        schema.setdefault("components", {})["securitySchemes"] = {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "StudyFlowSessionToken",
                "description": (
                    "Paste the `session_token` returned by "
                    "**POST /api/v1/auth/login** or **POST /api/v1/auth/register**. "
                    "Format: `Bearer <token>` (the 'Bearer ' prefix is added automatically by Swagger UI)."
                ),
            }
        }

        # 2. Mark every protected operation with the BearerAuth requirement.
        #    This is purely declarative — it tells Swagger UI which endpoints
        #    need a token, but does not enforce anything server-side.
        for path, path_item in schema.get("paths", {}).items():
            if path.startswith(_BEARER_PROTECTED_PREFIXES):
                for method_data in path_item.values():
                    if isinstance(method_data, dict):
                        method_data["security"] = [{"BearerAuth": []}]

        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = _custom_openapi  # type: ignore[method-assign]
