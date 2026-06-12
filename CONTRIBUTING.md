# Contributing to Wise

Thank you for your interest in contributing to Wise! This guide will help you get started.

## Code of Conduct

Be respectful, inclusive, and constructive. We're here to build something great together.

## Prerequisites

- **Rust** (stable, 1.75+)
- **Node.js** (20+)
- **Docker** (optional, for containerized development)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/theNeuralHorizon/wise.git
cd wise
```

### 2. Backend setup

```bash
cd backend
cargo build --release
```

The backend uses SQLite with WAL mode. The database file is created automatically.

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `http://localhost:5173`.

### 4. Running with Docker (alternative)

```bash
docker-compose up --build
```

This starts both backend (port 8081) and frontend (port 5173).

## Development Workflow

### Backend

- Framework: Axum (Rust)
- Database: SQLite with sqlx (compile-time checked SQL)
- Entry point: `backend/src/main.rs`
- Routes: `backend/src/routes/`
- Start dev: `cargo run` (from `backend/` directory)

### Frontend

- Framework: React 19 + Vite + TypeScript
- Styling: CSS custom properties design system (no Tailwind)
- State: React hooks + localStorage
- Start dev: `npm run dev` (from `frontend/` directory)

## Code Style

### Rust

- Format: `cargo fmt`
- Lint: `cargo clippy -- -D warnings`
- Follow Rust API Guidelines

### TypeScript

- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`
- Follow existing code patterns

## Testing

### Unit tests

```bash
# Backend
cd backend && cargo test

# Frontend
cd frontend && npm run test:unit
```

### E2E tests

```bash
cd frontend && npm run test:e2e
```

Requires backend running on port 8081 and frontend on port 5173.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add offline mode support
fix: resolve payment confirmation race condition
docs: update ARCHITECTURE.md with deployment diagram
test: add unit tests for UPI sanitization
refactor: extract rate limiting middleware
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run all tests (`cargo test`, `npm run test:unit`, `npm run test:e2e`)
4. Ensure `cargo clippy` and `npm run lint` pass
5. Submit PR with clear description of changes

## Reporting Bugs

Open an issue on GitHub with:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, browser, Rust version)

## Questions?

Open a GitHub Discussion or reach out on the repo.
