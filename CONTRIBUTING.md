# Contributing to StudyFlow AI

Thank you for your interest in contributing to StudyFlow AI! We welcome contributions from the community to help make study planning, task management, and focus tools better for students and learners worldwide.

---

## Code of Conduct

Please maintain a respectful, welcoming, and inclusive tone in all interactions, issues, and pull requests.

---

## Repository Structure

StudyFlow AI is organized into modular packages:

- `frontend/`: Electron desktop client and browser-based renderer UI.
- `backend/`: FastAPI Python server (PostgreSQL, Alembic migrations, Jass AI cloud integration).
- `web/`: Modern marketing landing page & product showcase built with React, TypeScript, and Vite.
- `shared/`: Shared data models and contract definitions.

---

## Development Workflow

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/studyflow-ai.git
cd studyflow-ai
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make and Test Your Changes

- **Frontend tests:**
  ```bash
  cd frontend
  npm test
  ```

- **Backend tests:**
  ```bash
  cd backend
  pytest
  ```

- **Web build:**
  ```bash
  cd web
  npm run build
  ```

### 4. Commit and Push

Use clear, descriptive commit messages:

```bash
git add .
git commit -m "feat(planner): add smart session reordering"
git push origin feature/your-feature-name
```

### 5. Open a Pull Request

- Provide a clear summary of changes.
- Ensure all automated tests pass before submitting.
- Avoid committing secrets, credentials, or personal database files (`.env`, `*.db`).

---

## Questions & Suggestions

Feel free to open an issue on GitHub for bug reports, feature suggestions, or questions!
