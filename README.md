<div align="center">

  <img src="web/public/images/logo/logo-128.png" alt="StudyFlow AI Logo" width="80" height="80" style="border-radius: 16px;" />

  # StudyFlow AI

  **Plan with clarity. Study with momentum. Progress every day.**

  StudyFlow AI is an intelligent, local-first productivity workspace for students and lifelong learners. It unifies semester planning, dynamic syllabus breakdown, smart timeblocking, deep Pomodoro focus sessions, and multi-semester roadmaps into a distraction-free environment powered by Jass AI.

  <p align="center">
    <a href="https://github.com/syeedarshad/studyflow-ai/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-e5a43b.svg?style=flat-square" alt="License: MIT" /></a>
    <a href="https://github.com/syeedarshad/studyflow-ai"><img src="https://img.shields.io/badge/Platform-Windows%2064--bit-336791.svg?style=flat-square" alt="Platform: Windows" /></a>
    <a href="https://github.com/syeedarshad/studyflow-ai"><img src="https://img.shields.io/badge/Desktop-Electron%2038-47848F.svg?style=flat-square" alt="Electron 38" /></a>
    <a href="https://github.com/syeedarshad/studyflow-ai"><img src="https://img.shields.io/badge/Web-React%2018%20%7C%20Vite-61DAFB.svg?style=flat-square" alt="React 18" /></a>
    <a href="https://github.com/syeedarshad/studyflow-ai"><img src="https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.11+-009688.svg?style=flat-square" alt="FastAPI" /></a>
    <a href="https://github.com/syeedarshad/studyflow-ai"><img src="https://img.shields.io/badge/Storage-Local%20SQLite%20%7C%20PostgreSQL-2b3137.svg?style=flat-square" alt="Storage" /></a>
  </p>

  <p align="center">
    <a href="#product-demonstration">Demo</a> •
    <a href="#why-studyflow-ai">Why StudyFlow AI</a> •
    <a href="#feature-story">Features</a> •
    <a href="#jass-ai-architecture">Jass AI Architecture</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#environment-configuration">Configuration</a> •
    <a href="#running-tests">Testing</a> •
    <a href="#deployment-journey--challenges">Deployment Journey</a> •
    <a href="#contributing">Contributing</a> •
    <a href="#license">License</a>
  </p>

</div>

---

## Product Demonstration

<div align="center">
  <img src="web/public/images/screenshots/app-main.png" alt="StudyFlow AI Main Dashboard" width="880" style="border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 16px 40px rgba(0,0,0,0.6);" />
  <p><em>The StudyFlow AI Dashboard — Live study streak, daily tasks, XP velocity, and active study plans.</em></p>
</div>

---

## Why StudyFlow AI?

Managing academic coursework and personal learning often means juggling calendars, note apps, timers, and scattered spreadsheets. StudyFlow AI combines these tools into one cohesive system:

- **Connected, not fragmented**: Daily tasks trace directly back to your semester goals and career roadmaps, so you always know why today's work matters.
- **Realistic, actionable planning**: Jass AI turns dense course outlines into prioritized, time-estimated study sessions designed around your availability.
- **Local-first & privacy-focused**: Core task management, scheduling, notes, and timers run entirely offline on your device with local SQLite storage.
- **Deep focus by design**: Built-in Pomodoro cycles, ambient audio soundscapes, and an always-on-top floating desktop widget keep you in flow without context switching.
- **Multi-tiered AI reliability**: Cloud-powered planning with Gemini & Groq fallback, backed by a deterministic client-side Offline Engine so you are never locked out of planning.

---

## Feature Story

### 1. Intelligent Syllabus Breakdown & Planning

Turn any course syllabus, chapter outline, or exam topic into a structured, step-by-step study plan. Jass AI estimates session lengths and orders concepts logically so you can start immediately rather than figuring out where to begin.

<div align="center">
  <img src="web/public/images/screenshots/ai-planning.png" alt="Jass AI Study Planning" width="820" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" />
</div>

---

### 2. Smart Timeblocking & Scheduling

Sessions fit around your real schedule. The weekly timeblocking view helps you organize dedicated study windows, balance workloads across subjects, and prevent last-minute cramming.

<div align="center">
  <img src="web/public/images/screenshots/scheduling.png" alt="Smart Timeblocking" width="820" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" />
</div>

---

### 3. Daily Action Connected to High-Level Goals

Tasks aren't just isolated to-dos—they link directly to your academic goals. Organize assignments by priority, filter by subject, and check off subtasks while watching your goal progress update in real time.

<div align="center">
  <img src="web/public/images/screenshots/goals-tasks.png" alt="Goals and Tasks" width="820" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" />
</div>

---

### 4. Visual Semester & Career Roadmaps

Track multi-semester milestones and long-term skill progression. Roadmaps give you a visual timeline of where you've been and what comes next across terms and certifications.

<div align="center">
  <img src="web/public/images/screenshots/roadmaps.png" alt="Career and Semester Roadmaps" width="820" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" />
</div>

---

### 5. Deep Focus Mode & Mini Floating Widget

Lock into deep study sessions with the built-in Pomodoro timer and relaxing ambient soundscapes. Keep your momentum going with the compact, draggable mini-widget that floats above other windows.

<div align="center">
  <img src="web/public/images/screenshots/focus-mode.png" alt="Deep Focus Mode" width="820" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" />
</div>

---

### 6. Honest Study Consistency & Analytics

Stay accountable with clear metrics. Track your 14-day study streaks, XP velocity, subject distributions, and completion trends with straightforward charts.

<div align="center">
  <img src="web/public/images/screenshots/analytics.png" alt="Study Analytics" width="820" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" />
</div>

---

## Jass AI Architecture

**Jass AI** is designed as a secure, highly resilient study companion with multi-provider fallbacks and client-side offline capabilities:

```
                  ┌─────────────────────────────────────────────────────────────┐
                  │                  Desktop Client / Renderer                  │
                  │             (Prompt + Task Context / IPC Bridge)            │
                  └──────────────────────────────┬──────────────────────────────┘
                                                 │
                                                 ▼
                  ┌─────────────────────────────────────────────────────────────┐
                  │                 FastAPI AI Proxy Service                    │
                  │                 POST /api/v1/ai/generate                    │
                  │    - Validates Bearer Session Token                         │
                  │    - Enforces Daily Quota (e.g., 50 req/day limit)          │
                  │    - Enriches with User Personal RAG Document Context       │
                  └──────────────┬──────────────────────────────┬───────────────┘
                                 │ (Primary)                    │ (Fallback)
                                 ▼                              ▼
                  ┌──────────────────────────────┐ ┌───────────────────────────┐
                  │        Google Gemini         │ │           Groq            │
                  │      (gemini-3.6-flash)      │ │ (llama-3.3-70b-versatile) │
                  │     Server-Side API Key      │ │    Server-Side API Key    │
                  └──────────────┬───────────────┘ └─────────────┬─────────────┘
                                 │                               │
                                 └───────────────┬───────────────┘
                                                 │ (All Cloud Providers Fail / Offline)
                                                 ▼
                  ┌─────────────────────────────────────────────────────────────┐
                  │                Desktop Offline Engine                       │
                  │       (Deterministic Local Heuristic Rule-Based Engine)     │
                  └─────────────────────────────────────────────────────────────┘
```

### Key AI Features:
1. **Server-Managed Credentials**: Frontend clients never hold, transmit, or expose API keys. All cloud AI requests flow through authenticated backend proxy endpoints (`/api/v1/ai/generate`).
2. **Multi-Provider Fallback**:
   - **Primary**: Google Gemini (`gemini-3.6-flash` / `gemini-1.5-flash`) for rapid, nuanced JSON task decomposition and coaching.
   - **Secondary**: Groq (`llama-3.3-70b-versatile` / `openai/gpt-oss-20b`) for ultra-low latency fallback if primary encounters upstream issues.
   - **Tertiary (Local)**: Deterministic client-side `OfflineEngine` if network connectivity is unavailable or backend is offline.
3. **Usage Tracking & Quota Guard**: Server logs all AI queries to `ai_usage_logs` with concurrency-safe limits. Users can inspect their live daily quota via the Settings panel and `/api/v1/usage`.
4. **Personal RAG Context**: User study materials, profile preferences, and notes stored in vector storage enrich planning prompts securely without data leakage.

---

## Feature Overview

| Capability | What It Does | Offline Support |
| :--- | :--- | :---: |
| **Dashboard** | Daily focus summary, active streak, energy patterns, and quick actions | Yes |
| **Task Management** | Prioritized to-do list with subject tags, subtasks, and deadline filters | Yes |
| **Smart Timeblocking** | Visual weekly schedule grid for assigning dedicated focus blocks | Yes |
| **Goal Tracking** | Hierarchical goal tracking linked directly to daily task completion | Yes |
| **Roadmaps** | Visual multi-semester timelines for academic and career milestones | Yes |
| **Focus Mode** | Pomodoro timer with ambient sounds (Rain, Cafe, White Noise) | Yes |
| **Mini-Widget** | Draggable desktop overlay with active task tracker and streak indicator | Yes |
| **Study Analytics** | 14-day XP consistency trend, subject breakdown, and study stats | Yes |
| **Exam Prep** | Exam countdown timer, syllabus confidence heatmaps, and revision sprints | Yes |
| **Wellness Alerts** | Hydration, posture, and 20-20-20 eye strain break reminders | Yes |
| **Jass AI Planning** | Intelligent syllabus breakdown and interactive study coaching | Cloud / Local |

---

## Architecture

StudyFlow AI uses a local-first desktop foundation with an optional cloud synchronization and AI layer:

```mermaid
graph TD
    User([User]) --> DesktopClient[Desktop Client / Electron]
    User --> WebLanding[Marketing Web / React 18 + Vite]

    subgraph Desktop Architecture
        DesktopClient --> RendererUI[Renderer UI & Views]
        RendererUI --> PreloadBridge[Preload Secure Bridge]
        PreloadBridge --> MainProcess[Electron Main Process]
        MainProcess --> LocalDB[(Local SQLite DB)]
        MainProcess --> SyncQueue[Offline Sync Queue]
        MainProcess --> OfflineEngine[Offline Heuristic Engine]
    end

    subgraph Cloud Backend
        SyncQueue -.->|REST / WebSocket| BackendAPI[FastAPI Backend API]
        BackendAPI --> CloudDB[(PostgreSQL)]
        BackendAPI --> RAGService[RAG Vector Storage]
        BackendAPI --> GeminiProvider[Gemini AI Provider]
        BackendAPI --> GroqProvider[Groq AI Provider]
    end

    LocalDB -->|Encrypted Storage| DesktopClient
```

---

## Tech Stack

| Layer | Technologies | Role |
| :--- | :--- | :--- |
| **Desktop Client** | Electron 38, JavaScript (ES2022), HTML5, Vanilla CSS3 | Native desktop application with dark glassmorphism interface |
| **Local Storage** | SQLite (`better-sqlite3`, `node:sqlite`), AES-GCM Encryption | Encrypted local database with user-isolated data and offline sync queue |
| **Visualizations** | Chart.js 4.4 | Real-time analytics, streak tracking, and subject distribution charts |
| **Marketing Website** | React 18, TypeScript, Vite, Framer Motion, Lucide Icons | Responsive product showcase and official installer downloads hosted on Vercel |
| **Backend API** | FastAPI, Python 3.11+, Pydantic v2, Uvicorn | Asynchronous REST endpoints, WebSocket sessions, and AI orchestration on AWS EC2 |
| **Cloud Database** | PostgreSQL, SQLAlchemy 2.0 (asyncpg / psycopg2), Alembic | Relational database schema with automated migration pipelines |
| **AI & LLM Services** | Google Gemini, Groq, Personal RAG Vector Storage | Cloud intelligence pipeline with server-side credentials and local fallback |
| **Packaging & CI** | Electron Builder, Pytest, Node Test Runner, GitHub Actions | Automated cross-suite CI verification and Windows installer packaging (.exe) |

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0+ (v20.x or v22.x LTS recommended)
- **npm**: v9.0.0 or higher
- **Python** *(for backend development)*: Python 3.11+
- **Docker & Docker Compose** *(optional, for containerized backend)*: Docker 24.0+

---

### 1. Clone the Repository

```bash
git clone https://github.com/syeedarshad/studyflow-ai.git
cd studyflow-ai
```

---

### 2. Desktop Application (Electron)

The desktop client runs independently with its built-in local SQLite engine:

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the desktop application (Local mode)
npm start

# Or start in development mode targeting a remote backend:
# On PowerShell:
$env:STUDYFLOW_BACKEND_URL="http://127.0.0.1:8000"; npm run dev
# On Bash:
STUDYFLOW_BACKEND_URL="http://127.0.0.1:8000" npm run dev

# Package Windows desktop installer (.exe)
npm run build
```

*On Windows, you can also run `install.bat` from the repository root for automated setup.*

---

### 3. Marketing Website (React + Vite)

The web showcase in `web/` provides product information and download links:

```bash
# Navigate to the web directory
cd web

# Install dependencies
npm install

# Start the Vite development server
npm run dev

# Build the production web bundle (outputs to web/dist)
npm run build

# Preview the production build locally
npm run preview
```

---

### 4. FastAPI Backend & PostgreSQL

```bash
# Navigate to the backend directory
cd backend

# Create and activate a Python virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Running with Docker Compose:

```bash
# Start PostgreSQL database and FastAPI backend
docker compose up -d

# Run database migrations in container
docker compose run --rm backend alembic upgrade head

# Inspect container logs
docker compose logs -f backend
```

---

## Environment Configuration

> **IMPORTANT SECURITY NOTE:**  
> Never commit `.env` files, API keys, JWT secrets, database credentials, or private certificates to source control. All `.env` files are excluded in `.gitignore`. Production AI provider credentials are stored strictly in the server-side environment on AWS EC2.

### Backend Configuration (`backend/.env`)

| Variable | Description | Example / Placeholder |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Application mode (`development` / `staging` / `production`) | `production` |
| `DEBUG` | Enable debug logging & interactive docs | `false` |
| `DATABASE_URL` | Async PostgreSQL connection string (asyncpg) | `postgresql+asyncpg://user:password@localhost:5432/studyflow_ai` |
| `DATABASE_SYNC_URL` | Sync PostgreSQL connection string (psycopg2 for Alembic) | `postgresql+psycopg2://user:password@localhost:5432/studyflow_ai` |
| `ENCRYPTION_KEY` | 32-byte Fernet key for symmetric DB field encryption | `<generated-fernet-key>` |
| `SESSION_SECRET` | Secret key for desktop session signing (≥32 chars) | `<secure-random-string>` |
| `JWT_SECRET` | Secret key for JWT auth tokens (≥32 chars) | `<secure-random-string>` |
| `GEMINI_API_KEY` | Google Gemini API key for primary AI planning | `your_gemini_api_key` |
| `GROQ_API_KEY` | Groq API key for high-throughput AI fallback | `your_groq_api_key` |
| `AI_DAILY_REQUEST_LIMIT` | Per-user daily AI quota cap | `50` |
| `CORS_ORIGINS` | Permitted origins for web & desktop access | `http://localhost:3000,http://127.0.0.1:3000` |
| `ALLOWED_HOSTS` | Trusted host headers | `127.0.0.1,localhost,api.yourdomain.com` |

### Web Application Configuration (`web/.env`)

| Variable | Description | Default / Placeholder |
| :--- | :--- | :--- |
| `VITE_DOWNLOAD_WIN_INSTALLER` | Direct URL for Windows Desktop installer | `https://github.com/syeedarshad/studyflow-ai/releases/latest/download/...` |
| `VITE_RELEASE_NOTES_URL` | GitHub releases or changelog URL | `https://github.com/syeedarshad/studyflow-ai/releases` |
| `VITE_GITHUB_URL` | Repository URL | `https://github.com/syeedarshad/studyflow-ai` |
| `VITE_APP_VERSION` | Current release version badge | `1.0.0` |

---

## Running Tests

Automated tests run on every pull request via GitHub Actions:

### 1. Frontend Test Suite
Runs unit, database migration, authentication, theme persistence, multi-account isolation, and sync queue tests:

```bash
cd frontend
npm test
```

### 2. Backend Test Suite
Runs Pytest suite covering FastAPI routes, authentication, AI provider fallback, and PostgreSQL models:

```bash
cd backend
pytest
```

### 3. Web Showcase Verification
Verifies TypeScript compilation and production Vite bundling:

```bash
cd web
npm run build
```

---

## Deployment Journey & Challenges

This section documents the actual end-to-end release process, real-world engineering challenges encountered, and operational verification steps followed for the StudyFlow AI production release.

---

### 1. Development → Feature Branch Workflow

To maintain code quality and production stability, code is **never pushed directly to the `main` branch**. All features, bug fixes, and release preparations follow an isolated branch and pull request cycle:

```
main (stable production baseline)
  │
  ├──► Create feature/fix branch (e.g. fix/desktop-ai-and-coach)
  │      │
  │      ├── Local development & debugging
  │      ├── Comprehensive local test execution (unit, database, integration)
  │      ├── Git commit with descriptive messages
  │      └── Push feature branch to origin
  │
  ├──► Open GitHub Pull Request into main (e.g. PR #5)
  │      │
  │      ├── Automated GitHub Actions CI pipeline execution
  │      │     ├─ Backend (FastAPI & Pytest)
  │      │     ├─ Desktop App (Electron & Unit Tests)
  │      │     └─ Marketing Website (React & Vite Build)
  │      ├── Code review & verification
  │      └── Merge PR into main
  │
main updated & tagged for release
```

- The desktop AI and Coach Chat fixes were prepared on the dedicated branch `fix/desktop-ai-and-coach`.
- All automated checks passed before Pull Request **#5** was merged into `main`.

---

### 2. Desktop AI & Backend Challenge

During desktop integration, the application appeared to operate in an offline/local-AI mode, and daily AI request usage metrics were incrementing unexpectedly. 

#### Investigation & Diagnosis:
1. **Inspected AI Provider Pipeline**: Traced the IPC call sequence from `generateTaskPlanPreview()` in `app.js` $\rightarrow$ `ProviderManager.generateTasks()` $\rightarrow$ `POST /api/v1/ai/generate`.
2. **Verified Gemini & Groq Backend Execution**: Verified that server-side provider credentials were properly configured in the backend environment.
3. **Database Usage Audit**: Inspected the PostgreSQL `ai_usage_logs` table directly on the AWS backend, confirming that requests were successfully reaching the server:
   - Queries were executing via `gemini-3.6-flash`.
   - Rows recorded `provider: 'gemini'`, `model: 'gemini-3.6-flash'`, `success: true`, and token counts.
   - Verified that earlier failures recorded `provider: 'offline'`, explaining the fallback badge.
4. **Resolved Labeling Logic**: Clarified that `"Generated by Jass AI"` is the unified attribution label for cloud providers (Gemini & Groq), whereas `"Generated by Jass AI • Local mode"` indicates the local `OfflineEngine`.

#### Final Resilient AI Architecture:

```
Jass AI (Unified Interface)
  │
  ├──► 1. Google Gemini (gemini-3.6-flash) — Primary Cloud LLM
  │
  ├──► 2. Groq (llama-3.3-70b-versatile) — High-Throughput Fallback
  │
  └──► 3. OfflineEngine — Deterministic Local Rule-Based Engine (when offline/unreachable)
```

Daily quota usage tracking is enforced server-side via `ai_usage_logs` and queryable through `/api/v1/usage`.

---

### 3. GitHub Pull Request & CI Validation

Before merging PR #5 and subsequent releases, the entire test suite was executed locally and verified through GitHub Actions.

#### Frontend Test Suite (95/95 Tests Passing):
- **Database & Multi-Account Isolation**: 27 passed (verifying table migrations, user isolation, idempotent quest counters).
- **User Authentication & Session**: 19 passed (verifying bcrypt hashing, AES secure storage, non-expiring sessions).
- **Theme & Settings Persistence**: 17 passed (verifying settings persistence without duplicate rows).
- **Settings & AI Services**: 5 passed (verifying credential privacy and settings UI).
- **SyncManager Multi-Account Isolation**: 7 passed (verifying user-scoped offline queue management and race-condition guards).
- **AI Provider Pipeline & Formatting**: 20 passed (verifying schedule normalization, provider attribution formatting, and review notices).

#### GitHub Actions CI Matrix:
- **Backend**: Python 3.11, PostgreSQL service container, Pytest suite.
- **Desktop App**: Node.js 22, Electron test runner.
- **Marketing Website**: Node.js 22, TypeScript compiler (`tsc -b`) and Vite production bundler.

PR **#5** (Desktop AI and Coach fixes) was merged first, followed by PR **#6** (Web release and documentation).

---

### 4. AWS EC2 Backend Deployment

The production FastAPI backend and PostgreSQL database run containerized on AWS EC2. The verified deployment procedure:

1. **SSH Connection**: Connect securely to the EC2 instance using SSH key pairs.
2. **Repository Verification**: Verify the working directory (`/home/ubuntu/studyflow-ai`) and active branch (`main`).
3. **Pull Latest Release**: Fetch and pull the latest changes from `origin/main`.
4. **Preserve Server Environment**: Ensure the production `.env` file remains intact on the host with all server-side secrets.
5. **Container Rebuild**: Rebuild and restart the container services cleanly:
   ```bash
   docker compose up -d --build
   ```
6. **Container Status Check**: Confirm containers (`studyflow_backend` and `studyflow_db`) report healthy.
7. **Backend Health Check**:
   ```bash
   curl http://<EC2_PUBLIC_IP>:8000/health
   ```
   **Output:**
   ```json
   {"status":"ok","version":"2.0.0","uptime":79.22}
   ```
8. **Safe Environment Audit**: Verify that `GEMINI_API_KEY` and `GROQ_API_KEY` are non-empty and accessible *inside* the container without printing secrets:
   ```bash
   docker compose exec backend python -c "import os; print('GEMINI:', 'SET' if os.getenv('GEMINI_API_KEY') else 'EMPTY'); print('GROQ:', 'SET' if os.getenv('GROQ_API_KEY') else 'EMPTY')"
   ```
   **Output:**
   ```text
   GEMINI: SET
   GROQ: SET
   ```
9. **Live Endpoint Test**: Test authenticated requests to `/api/v1/ai/generate`.
10. **Database Usage Audit**: Query `ai_usage_logs` in PostgreSQL to confirm server-side logging of tokens, model version, and timestamps.

---

### 5. AWS Git & Docker Compose Conflict Resolution

During deployment, a divergence occurred on the EC2 host:
- `docker-compose.yml` on the server contained local modifications tailored to the staging environment.
- Several accidental empty untracked files with comma-suffixed names existed in the workspace.

#### Resolution Procedure:
1. Ran `git status` and `git diff` to inspect untracked files and local changes.
2. Removed extraneous untracked files safely.
3. Stashed the local `docker-compose.yml` modifications (`git stash`).
4. Pulled latest `origin/main`.
5. Restored necessary host-specific compose directives (`env_file: - .env`) and verified YAML integrity.
6. Re-verified that `/home/ubuntu/studyflow-ai/.env` was untouched with `600` permissions.
7. Recreated containers with `docker compose up -d --force-recreate backend`.

> **Why the AWS `.env` Must Remain Outside Git:**  
> The `.env` file contains sensitive live production credentials (`DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`). Committing this file to Git exposes credentials in repository history and creates deployment conflicts across environments.

---

### 6. API Key Security & Privacy Standards

StudyFlow AI adheres to strict zero-trust credential isolation:

- **Server-Side Only**: Cloud AI provider keys (Gemini & Groq) are stored **only** in the AWS EC2 `.env` file and read by the FastAPI backend service.
- **Client Blindness**: The desktop Electron client and the marketing web application **never** receive, store, or prompt users for AI API keys.
- **Sanitized Responses**: Backend error handlers sanitize upstream messages to ensure no API key fragments or tokens leak in response payloads or logs.

#### Strict Security Rules:
- ❌ **NEVER** commit `.env` files to Git.
- ❌ **NEVER** include API keys or secrets in `README.md` or documentation.
- ❌ **NEVER** hardcode provider credentials in frontend, Electron, or web source code.
- ❌ **NEVER** print secret values in terminal output, CI logs, or application logs.
- ❌ **NEVER** expose backend signing keys or database passwords to client bundles.

---

### 7. Production Vercel Web Deployment

The official StudyFlow AI web showcase is hosted on **Vercel**:

- **Location**: `web/` directory.
- **Stack**: React 18, TypeScript, Vite, Framer Motion, Lucide Icons.
- **Build Command**: `npm run build` (`tsc -b && vite build`).
- **Output Directory**: `web/dist`.
- **Deployment Trigger**: Vercel Git Integration monitors the `main` branch.
- **Deployment Execution**: When PR #6 was merged into `main`, Vercel automatically compiled and deployed commit `dc25cae`.
- **Status**: `Ready` (Production environment, live).

> **Note on CI vs. Deployment:**  
> GitHub Actions validates that the code builds and passes tests on every pull request. Vercel performs the actual production hosting and worldwide CDN distribution of the web application.

---

### 8. Web Deployment Architecture

The separation of concerns between testing, web hosting, and API infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Repository                        │
│                     (Branch: main)                          │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼ (CI Check on PR/Push)        ▼ (Auto-Deploy on Merge)
┌──────────────────────────────┐ ┌───────────────────────────┐
│        GitHub Actions        │ │          Vercel           │
│  - FastAPI Pytest (Python)   │ │  - React 18 / Vite Build  │
│  - Electron Unit Tests       │ │  - Global Edge CDN Host   │
│  - TypeScript & Vite Build   │ │  - Marketing & Downloads  │
└──────────────────────────────┘ └───────────────────────────┘
                                              ▲
                                              │
               ┌──────────────────────────────┴───────────────┐
               │                                              │
               ▼ (App Downloads)                              ▼ (API Requests)
┌──────────────────────────────┐ ┌───────────────────────────┐
│     Windows Desktop App      │ │      AWS EC2 Server       │
│  - Local SQLite Database     │ │  - FastAPI Backend (8000) │
│  - Offline Heuristic Engine  │─┼─►- PostgreSQL Database    │
│  - Pomodoro & Timeblocking   │ │  - Gemini / Groq Proxy    │
└──────────────────────────────┘ └───────────────────────────┘
```

---

### 9. End-to-End Production Verification

The following end-to-end production verification flow was performed successfully during deployment:

```
1. User visits Vercel Production Website
   │
2. Downloads latest StudyFlow AI Desktop Installer (.exe)
   │
3. Runs Electron Desktop Application
   │
4. Logs in / authenticates with AWS EC2 FastAPI Backend
   │
5. Triggers "Generate Tasks" / "AI Coach Chat"
   │
6. Backend verifies quota & dispatches to Google Gemini
   │
7. Receives structured plan response in desktop UI
   │
8. Query PostgreSQL `ai_usage_logs` on EC2:
   ┌──────────┬──────────────────┬─────────┬─────────────┬───────────────────────────────┐
   │ provider │ model            │ success │ tokens_used │ requested_at                  │
   ├──────────┼──────────────────┼─────────┼─────────────┼───────────────────────────────┤
   │ gemini   │ gemini-3.6-flash │ true    │ 1969        │ 2026-08-28 19:42:31.987250+00 │
   │ gemini   │ gemini-3.6-flash │ true    │ 1071        │ 2026-08-28 19:41:34.572818+00 │
   │ gemini   │ gemini-3.6-flash │ true    │ 779         │ 2026-08-28 19:41:13.671144+00 │
   │ gemini   │ gemini-3.6-flash │ true    │ 1266        │ 2026-08-28 19:40:23.703865+00 │
   └──────────┴──────────────────┴─────────┴─────────────┴───────────────────────────────┘
```

---

### 10. Lessons Learned

1. **Protect Main Branch**: Never push unreviewed code directly to `main`. Always utilize feature branches and pull requests.
2. **Pre-Push Validation**: Run local unit and database test suites before opening PRs to catch regressions early.
3. **Respect Host Configurations**: AWS production environments often have server-specific Docker Compose configs that must be reconciled carefully during git pulls.
4. **Never Commit `.env`**: Store secrets strictly in host environment files with restricted permissions (`chmod 600`).
5. **Verify Without Exposing**: Check variable presence using boolean checks (`SET`/`EMPTY` or length) rather than printing plaintext values.
6. **Container Health Isolation**: Check `/health` endpoint status before testing higher-level authenticated features.
7. **Verify AI via Database Logs**: Do not rely solely on frontend badges; verify actual backend execution and token logs in PostgreSQL.
8. **CI Validation $\neq$ Deployment**: A passing GitHub Actions run confirms code integrity, but production deployments (Vercel/EC2) must be independently monitored.
9. **Test Real Production Artifacts**: Always download and test the packaged Windows installer from GitHub Releases rather than relying solely on local development mode.

---

### 11. Current Production Architecture

```
                                  User
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         │                                                   │
         ▼                                                   ▼
┌──────────────────┐                               ┌──────────────────┐
│      Vercel      │                               │ Windows Desktop  │
│  (React 18/Vite) │                               │  (Electron 38)   │
│  Marketing Web   │                               │  Local SQLite    │
└──────────────────┘                               └────────┬─────────┘
                                                            │
                                                            ▼ (HTTP / WebSocket)
                                                   ┌──────────────────┐
                                                   │   AWS EC2 Host   │
                                                   │ ┌──────────────┐ │
                                                   │ │FastAPI (8000)│ │
                                                   │ └──────┬───────┘ │
                                                   │        │         │
                                                   │ ┌──────▼───────┐ │
                                                   │ │  PostgreSQL  │ │
                                                   │ └──────────────┘ │
                                                   │        │         │
                                                   │ ┌──────▼───────┐ │
                                                   │ │ Gemini / Groq│ │
                                                   │ └──────────────┘ │
                                                   └──────────────────┘
```

- **Vercel**: Hosts the static marketing web application and product showcase.
- **AWS EC2**: Hosts the containerized FastAPI backend and PostgreSQL database.
- **PostgreSQL**: Stores relational user accounts, tasks, schedules, roadmaps, and `ai_usage_logs`.
- **Gemini / Groq**: Server-managed LLM providers invoked securely via backend proxy.
- **OfflineEngine**: Embedded client-side rule engine providing offline resilience when disconnected.

---

### 12. Production Release Checklist

Use this reusable checklist for all future releases:

- [ ] Create and checkout a feature branch (`git checkout -b feature/<name>` or `fix/<name>`)
- [ ] Implement changes and maintain backward compatibility
- [ ] Run frontend test suite (`cd frontend && npm test` $\rightarrow$ 95/95 passing)
- [ ] Run backend test suite (`cd backend && pytest`)
- [ ] Verify web build (`cd web && npm run build`)
- [ ] Commit changes with clear, descriptive commit messages
- [ ] Push feature branch to origin (`git push -u origin <branch>`)
- [ ] Open Pull Request into `main`
- [ ] Confirm all GitHub Actions CI checks pass
- [ ] Review and merge Pull Request into `main`
- [ ] SSH into AWS EC2 production instance
- [ ] Verify repository state and pull latest `main`
- [ ] Confirm production `.env` is preserved with valid secrets
- [ ] Rebuild and restart containers (`docker compose up -d --build`)
- [ ] Verify container health (`GET /health`)
- [ ] Verify AI provider keys are `SET` inside the backend container
- [ ] Test authenticated AI endpoint (`/api/v1/ai/generate`)
- [ ] Query PostgreSQL `ai_usage_logs` to confirm request tracking
- [ ] Verify Vercel deployment status (`Ready` on latest commit)
- [ ] Download latest Windows desktop release build and verify end-to-end functionality

---

## Project Structure

```
studyflow-ai/
├── frontend/                  # Electron desktop application
│   ├── assets/                # App icons (.ico, .png, tray) and soundscapes
│   ├── src/
│   │   ├── main/              # Main process, SQLite database, secure store, IPC
│   │   │   ├── ai/            # ProviderManager & OfflineEngine
│   │   │   └── repositories/  # Isolated user data access layer
│   │   └── renderer/          # UI views, styles, Chart.js analytics, controllers
│   ├── test/                  # Automated frontend & database test suites
│   └── package.json
├── backend/                   # FastAPI Python backend service
│   ├── app/                   # API routers (auth, ai, tasks, profile, onboarding)
│   │   ├── api/ai/            # AI service, Gemini/Groq drivers, usage tracking
│   │   └── services/          # RAG document vector processing
│   ├── core/                  # Security, Fernet crypto, settings, rate limiters
│   ├── database/              # SQLAlchemy models, sessions, connection pooling
│   ├── migrations/            # Alembic database migration versions
│   ├── tests/                 # Backend pytest test suite
│   ├── Dockerfile             # Containerized backend build
│   └── requirements.txt
├── web/                       # Marketing landing page (React 18 + Vite + TypeScript)
│   ├── public/                # Static assets, logos, and screenshots
│   ├── src/                   # Components, animations, hooks, and download configs
│   ├── package.json
│   └── vite.config.ts
├── shared/                    # Shared schemas, contracts, and constants
├── docs/                      # Technical documentation and media guidelines
├── .github/workflows/         # CI verification workflows (Backend, Desktop, Web)
├── docker-compose.yml         # Container orchestration (FastAPI + PostgreSQL)
├── DEPLOYMENT_GUIDE.md        # Comprehensive server & staging deployment guide
├── CONTRIBUTING.md            # Contribution and branch workflow standards
├── SECURITY.md                # Vulnerability disclosure policy
├── LICENSE                    # MIT Open Source License
└── README.md                  # Main project documentation
```

---

## Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for branch workflows, coding standards, and pull request guidelines.

1. Fork the Project
2. Create your Feature / Release Branch (`git checkout -b feature/AmazingFeature` or `git checkout -b release/web-update`)
3. Commit your Changes (`git commit -m 'feat: add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request into `main`

---

## Security

Please report security issues responsibly. See [SECURITY.md](SECURITY.md) for vulnerability reporting guidelines.

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

---

<div align="center">
  <sub>Built with care by <a href="https://github.com/syeedarshad">Syeed Arshad</a> and the open-source community.</sub>
</div>
