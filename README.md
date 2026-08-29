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
| **Marketing Website** | React 18, TypeScript, Vite, Framer Motion, Lucide Icons | Responsive product showcase and official installer downloads |
| **Backend API** | FastAPI, Python 3.11+, Pydantic v2, Uvicorn | Asynchronous REST endpoints, WebSocket sessions, and AI orchestration |
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
> Never commit `.env` files, API keys, JWT secrets, database credentials, or private certificates to source control. All `.env` files are excluded in `.gitignore`.

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
