# StudyFlow AI

StudyFlow AI is a professional full-stack product that provides a smart productivity dashboard tailored for students. It currently includes an Electron Desktop Application and is transitioning toward a full-scale architecture featuring a FastAPI backend, PostgreSQL database, AI Agents, Realtime Chat, and more.

## Project Overview

StudyFlow AI helps you track goals, tasks, study sessions, and wellness with the power of artificial intelligence. It adapts to your study habits, generates personalized plans, and provides actionable insights.

## Architecture

The project is structured as a scalable monorepo separating frontend, backend, and shared logic:
- **Frontend**: An Electron Desktop Application running Vite (future) and Vanilla JS / React (future).
- **Backend**: A FastAPI Python application handling heavy AI orchestration, PostgreSQL database interactions, and realtime features.
- **Shared**: Common TypeScript/Python schemas, API contracts, and utilities used by both frontend and backend.

## Folder Structure

```
StudyFlow-AI/
├── frontend/       # Electron application, Vite config, renderer, UI assets
├── backend/        # FastAPI application, database models, migrations
├── shared/         # Reusable constants, types, schemas, and API contracts
├── docs/           # Project documentation
├── scripts/        # Utility scripts (launch, install)
└── assets/         # Root-level assets
```

## Setup & Installation

### Frontend Setup
1. Run `install.bat` from the root directory, or navigate to `frontend/` and run `npm install`.
2. The `package.json` inside the `frontend/` folder manages all desktop dependencies.

### Backend Setup (Upcoming)
1. Navigate to the `backend/` directory.
2. Create a virtual environment: `python -m venv .venv`
3. Activate the virtual environment and install dependencies: `pip install -r requirements.txt`.

## Running Development

### Building and Running Electron
- **Launch Development Server**: Run `launch.bat` in the root, or `npm start` from within the `frontend/` directory.
- **Build Executable**: Navigate to `frontend/` and run `npm run build` to package the application with electron-builder.

### Running FastAPI (Upcoming)
- Start the server using uvicorn: `uvicorn app.main:app --reload` from the `backend/` directory.

### Docker (Upcoming)
- Use `docker-compose up` inside the `backend/` folder to spin up the FastAPI backend and PostgreSQL database simultaneously.

## Environment Variables
- **Frontend**: Store environment variables in `frontend/.env`. Refer to `frontend/.env.example` for required keys.
- **Backend**: Store environment variables in `backend/.env`. Database credentials and API keys go here.

## Future Roadmap
- ✅ Electron Desktop Application
- 🚧 FastAPI Backend & PostgreSQL
- ⏳ AI Coach & Memory
- ⏳ AI Agents & Friends System
- ⏳ WebSocket Realtime Chat
- ⏳ Mobile App & Web Dashboard
