# Wise (local dev)

This workspace contains three services:
- `backend/` — Rust Axum server (SQLite, WebSockets, AI integration)
- `ai_service/` — Python microservice that calls Gemini (or returns mock data)
- `frontend/` — Vite + React mobile web UI

Quick start (dev):

1. Start Python AI microservice (uses GEMINI_API_KEY env or returns mock data):

```powershell
python -u ai_service/main.py
```

2. Start Rust backend (builds and serves API):

```powershell
cargo run --manifest-path backend/Cargo.toml
```

3. Start frontend dev server:

```powershell
cd frontend
npm install
npm run dev
```

Smoke tests performed by me:
- Created a split via `POST /api/splits`.
- Uploaded a dummy receipt to `POST /api/splits/{id}/receipt`.
- Backend used mock AI parse (no `GEMINI_API_KEY`) and returned parsed items and totals.

Notes & fixes I applied:
- Upgraded `axum` to 0.8 and aligned server runtime (`hyper` / `axum-server`).
- Fixed WebSocket `Message::Text` type usage for axum 0.8.
- Converted route parameter syntax to `{param}` style for axum 0.8.
- Removed unused imports and cleaned temporary test files.

Next suggestions:
- Add end-to-end UI tests (Playwright) to exercise upload flow.
- Add CI pipeline that runs `cargo build`, `python -m pytest` (if tests added), and `npm ci`.
- Add environment guidance for `GEMINI_API_KEY` and production CORS tightening.

If you want, I can now:
- Wire the frontend to a created split in the browser (simulate user action),
- Add a Playwright e2e test for the upload flow, or
- Create a lightweight Rust integration test for the `upload_receipt` route.

Tell me which and I'll implement it next.
