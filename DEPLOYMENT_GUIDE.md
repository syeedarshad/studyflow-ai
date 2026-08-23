# StudyFlow AI — Production & Staging Deployment Guide

This guide describes the complete, verified deployment procedure for the **StudyFlow AI** backend platform, PostgreSQL database, RAG vector storage, and Electron desktop application.

---

## 1. Prerequisites

### Server / Infrastructure
- **Operating System:** Ubuntu 22.04 / 24.04 LTS, Debian 12, or any modern Linux distribution
- **Hardware Minimum (Staging/Beta):** 2 vCPUs, 4 GB RAM, 25 GB SSD storage (e.g., Hetzner CX21 / DigitalOcean Droplet / AWS EC2 t4g.small)
- **Container Runtime:** Docker 24.0+ and Docker Compose v2 (plugin `docker compose` or standalone `docker-compose`)
- **Reverse Proxy / SSL:** Caddy (recommended for automated Let's Encrypt SSL) or NGINX
- **Domain Name:** Fully qualified domain name (FQDN), e.g., `api.yourdomain.com`, pointing to your server's public IP (A/AAAA DNS records)

### Local Development / Packaging
- **Node.js:** v20.x or v22.x LTS
- **Python:** 3.12+
- **Electron Builder:** For packaging Windows (`.exe` / `.msi`), macOS, or Linux builds

---

## 2. Required Environment Variables

All secrets and configuration parameters must be supplied via environment variables. **Never commit `.env` to source control.**

Create a `.env` file in the `backend/` directory or pass these to your container orchestration system:

```ini
# ─── Application Mode ────────────────────────────────────────────────────────
ENVIRONMENT=production                   # 'production' enforces strict fail-fast secret checks
DEBUG=false                              # Must be false in production

# ─── Server Binding ──────────────────────────────────────────────────────────
HOST=0.0.0.0                             # Bind to all container interfaces
PORT=8000

# ─── Database (PostgreSQL) ───────────────────────────────────────────────────
# Async URL for FastAPI (asyncpg)
DATABASE_URL=postgresql+asyncpg://studyflow_user:YOUR_STRONG_PASSWORD@db:5432/studyflow_prod
# Sync URL for Alembic Migrations (psycopg2)
DATABASE_SYNC_URL=postgresql+psycopg2://studyflow_user:YOUR_STRONG_PASSWORD@db:5432/studyflow_prod

# ─── Security Secrets ────────────────────────────────────────────────────────
# 32-byte Fernet key for encrypting user provider keys at rest in PostgreSQL
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=YOUR_GENERATED_FERNET_KEY

# Random session signing secret (≥32 characters)
SESSION_SECRET=YOUR_SECURE_RANDOM_SESSION_SECRET_32_CHARS_MIN

# Random JWT signing secret (≥32 characters)
JWT_SECRET=YOUR_SECURE_RANDOM_JWT_SECRET_32_CHARS_MIN
JWT_ALGORITHM=HS256
SESSION_TOKEN_LIFETIME_SECONDS=0         # 0 = permanent desktop session (Discord/VS Code style)

# ─── Host & Origin Restrictions ──────────────────────────────────────────────
ALLOWED_HOSTS=api.yourdomain.com,127.0.0.1,localhost
CORS_ORIGINS=null,file://                # Electron desktop client origins

# ─── File & Vector Storage ───────────────────────────────────────────────────
# Persistent container directory for user documents and isolated RAG vector indexes
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_SIZE_MB=50

# ─── AI Providers (Server-Managed) ───────────────────────────────────────────
# At least one provider key is required for AI Coach, Roadmap, and RAG features
GEMINI_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...
AI_DAILY_REQUEST_LIMIT=50

# ─── Email Configuration (OTP & Password Reset) ──────────────────────────────
MAIL_USERNAME=notifications@yourdomain.com
MAIL_PASSWORD=your_smtp_application_password
MAIL_FROM=noreply@yourdomain.com
MAIL_PORT=587
MAIL_SERVER=smtp.gmail.com
MAIL_TLS=true
MAIL_SSL=false
OTP_EXPIRY_SECONDS=600

# ─── Rate Limiting & Logs ────────────────────────────────────────────────────
RATE_LIMIT_PER_MINUTE=60
AUTH_RATE_LIMIT_PER_MINUTE=10
LOG_LEVEL=INFO
```

---

## 3. Local Docker Staging Deployment

To spin up a complete staging environment locally with Docker Compose:

```bash
# 1. Clone repository
git clone <repository_url> studyflow-ai
cd studyflow-ai

# 2. Copy and configure staging environment
cp backend/.env.example backend/.env
# Edit backend/.env with your staging secrets and configuration

# 3. Build images and start database service
docker compose up -d db

# 4. Wait for database healthcheck to report healthy
docker compose ps

# 5. Apply Alembic database migrations
docker compose run --rm backend alembic upgrade head

# 6. Start the FastAPI backend
docker compose up -d backend

# 7. Check container logs
docker compose logs -f backend
```

---

## 4. PostgreSQL Setup

### Managed Database (e.g., Supabase, Neon, AWS RDS)
If using a managed PostgreSQL service:
1. Ensure the PostgreSQL instance version is 15 or 16.
2. Update `DATABASE_URL` with the `asyncpg` prefix: `postgresql+asyncpg://...`
3. Update `DATABASE_SYNC_URL` with the `psycopg2` prefix: `postgresql+psycopg2://...`
4. The containerized `db` service in `docker-compose.yml` can be omitted.

### Self-Hosted Container Database
The included `docker-compose.yml` configures an isolated PostgreSQL 16 container:
- Named persistent volume: `postgres_data`
- Health check via `pg_isready`
- Port `5432` is kept internal to the Docker network (do not expose port 5432 to the public internet)

---

## 5. Alembic Migration Procedure

Schema migrations are owned exclusively by Alembic. In production (`DEBUG=false`), the backend only executes a database connectivity check on startup and **never** calls `create_all()`.

### Running Migrations
```bash
# Run latest migrations
docker compose run --rm backend alembic upgrade head

# Check current revision status
docker compose run --rm backend alembic current

# View migration history
docker compose run --rm backend alembic history
```

### Verified Linear Revision Chain
1. `0b1d5b54fdb3` → Initial Phase 1: `users`, `sessions`, `otps`, `otp_verifications`
2. `a2b3c4d5e6f7` → Phase 2.2: `user_profiles`, `provider_keys`
3. `c3d4e5f6a7b8` → Phase 3: `tasks`
4. `b3c4d5e6f7a8` → Phase 4: `ai_usage_logs`
5. `d4e5f6a7b8c9` → Phase 5 (HEAD): `user_profile_context`, `users.onboarding_status`

---

## 6. Backend Startup

The production Docker container runs `uvicorn` with 2 worker processes and proxy headers enabled:

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
```

### Lifecycle Guarantees:
1. **Startup Validation:** `validate_production_settings()` runs first. If `ENVIRONMENT=production` and any required secrets or default credentials are detected, the container immediately exits with a non-zero code.
2. **Database Verification:** Checks PostgreSQL connection.
3. **Upload Directory:** Ensures `/app/uploads` exists.
4. **Shutdown Cleanup:** Disposes database connection pool gracefully on `SIGTERM`.

---

## 7. Persistent Volume Configuration

StudyFlow AI uses strict physical filesystem isolation per authenticated user for documents and RAG vector indexes:
- **Documents:** `/app/uploads/documents/user_{user_id}/`
- **Vector Indexes:** `/app/uploads/vector_store/user_{user_id}/vectors.json`

### Docker Compose Volume Configuration
```yaml
services:
  backend:
    volumes:
      - uploads_data:/app/uploads

volumes:
  postgres_data:
    driver: local
  uploads_data:
    driver: local
```

> ⚠️ **CRITICAL:** Do NOT omit the `uploads_data` volume. Container restarts without this volume will destroy uploaded study materials and user RAG embeddings.

---

## 8. Health Check & Monitoring

The backend exposes standard health and readiness probes:

### 1. Liveness Probe: `GET /health`
- **Purpose:** Verifies web server is responding. Used by Docker `HEALTHCHECK`.
- **Response:**
  ```json
  {
    "status": "ok",
    "version": "2.0.0",
    "uptime": 123.45
  }
  ```

### 2. Readiness Probe: `GET /ready`
- **Purpose:** Verifies live PostgreSQL database connectivity.
- **Response (Healthy - 200 OK):**
  ```json
  {
    "status": "ready",
    "database": "connected"
  }
  ```

---

## 9. Electron Backend Configuration

The Electron desktop application connects dynamically to your deployed backend using `STUDYFLOW_BACKEND_URL`.

### Building / Packaging for Production
Set the environment variable when running Electron or building the installer:

#### Windows (PowerShell):
```powershell
$env:STUDYFLOW_BACKEND_URL="https://api.yourdomain.com"
cd frontend
npm run build
```

#### Linux / macOS (Bash):
```bash
STUDYFLOW_BACKEND_URL="https://api.yourdomain.com" npm run build --prefix frontend
```

### Security & CSP Verification:
- Electron's main process automatically injects a tightly-scoped Content Security Policy:
  `connect-src 'self' https://api.yourdomain.com wss://api.yourdomain.com`
- No wildcard (`connect-src *`) is permitted.
- `contextIsolation: true` and `nodeIntegration: false` remain enforced.
- Session tokens are encrypted in the local OS keystore via Electron `safeStorage`.

---

## 10. Production Deployment Checklist

Before routing live users to the system:

- [ ] DNS A record configured for `api.yourdomain.com` pointing to server IP
- [ ] Reverse proxy (Caddy/NGINX) configured with automatic HTTPS/TLS certificates
- [ ] `ENVIRONMENT=production` and `DEBUG=false` in backend environment
- [ ] `ENCRYPTION_KEY` is a valid 32-byte Fernet key generated securely
- [ ] `SESSION_SECRET` and `JWT_SECRET` are high-entropy strings (≥32 chars)
- [ ] `DATABASE_URL` points to production PostgreSQL with strong password
- [ ] Named volumes `postgres_data` and `uploads_data` verified in Docker Compose
- [ ] `alembic upgrade head` executed successfully against production database
- [ ] `curl -f https://api.yourdomain.com/health` returns `200 OK`
- [ ] `curl -f https://api.yourdomain.com/ready` returns `200 OK`
- [ ] Electron client packaged with `STUDYFLOW_BACKEND_URL=https://api.yourdomain.com`

---

## 11. Rollback Procedure

If an issue occurs post-deployment:

### 1. Application Code Rollback
```bash
# Pull previous stable Docker image or tag
git checkout <previous_stable_tag>
docker compose up -d --build backend
```

### 2. Database Migration Rollback
```bash
# Downgrade one migration revision
docker compose run --rm backend alembic downgrade -1

# Downgrade to a specific revision
docker compose run --rm backend alembic downgrade <revision_id>
```

---

## 12. Backup and Restore Procedure

### PostgreSQL Database Backup
```bash
# Execute pg_dump inside container to create compressed backup
docker exec -t studyflow_db pg_dump -U studyflow_user -d studyflow_prod -F c -b -v -f /var/lib/postgresql/data/backup_$(date +%Y%m%d_%H%M%S).dump

# Copy backup file to host / offsite backup storage
docker cp studyflow_db:/var/lib/postgresql/data/backup_<timestamp>.dump ./backups/
```

### PostgreSQL Database Restore
```bash
# Restore from custom-format backup
docker exec -i studyflow_db pg_restore -U studyflow_user -d studyflow_prod -v --clean --no-owner /var/lib/postgresql/data/backup_<timestamp>.dump
```

### Uploads & RAG Vector Storage Backup
```bash
# Archive persistent uploads volume directory
docker run --rm -v studyflow_ai_uploads_data:/volume -v $(pwd)/backups:/backup alpine tar czf /backup/uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /volume .
```

### Uploads & RAG Vector Storage Restore
```bash
# Restore archive to persistent uploads volume
docker run --rm -v studyflow_ai_uploads_data:/volume -v $(pwd)/backups:/backup alpine sh -c "rm -rf /volume/* && tar xzf /backup/uploads_backup_<timestamp>.tar.gz -C /volume"
```
