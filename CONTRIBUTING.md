# Contributing to StudyFlow AI

Thank you for your interest in contributing to StudyFlow AI!

## Code Organization

This is a monorepo containing multiple pieces of the StudyFlow AI ecosystem:

- `frontend/`: The Electron application and UI code.
- `backend/`: The FastAPI Python backend (in progress).
- `shared/`: Shared schemas and types (in progress).

## Submitting Pull Requests

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes.
4. Push to the branch and submit a pull request.

## Coding Guidelines
- Ensure that the frontend code does not directly reference backend directories (use `shared/`).
- Do not introduce breaking changes to the database schemas without an Alembic migration.
- Add tests for new features.
