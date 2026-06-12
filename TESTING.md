# Testing & E2E

This document explains how to run the integrated API-level E2E tests locally and what runs in CI.

Prerequisites
- Node 20+, npm
- Python 3.11+ (for `ai_service`)
- Rust toolchain (stable)

Start services locally (3 terminals recommended)

1) Backend
```bash
cd backend
cargo run --manifest-path Cargo.toml
```

2) AI microservice
```bash
python -u ai_service/main.py
```

3) Frontend (optional when running UI tests)
```bash
cd frontend
npm install
npm run dev
```

Run API-level Playwright E2E (recommended)
```bash
cd frontend
npm install
npx playwright install chromium
npx playwright test --project=chromium tests/e2e.spec.ts
```

Notes
- The CI workflow runs the API-level Playwright test (`tests/e2e.spec.ts`) and is defined in `.github/workflows/e2e.yml`.
- There is a UI-driven Playwright test at `frontend/tests/ui.spec.ts`. It is currently marked as skipped because it was flaky locally; to enable it remove `test.skip` and run the full Playwright suite:

```bash
# run all tests (including UI)
npx playwright test
```

- If you want the UI test stable, prefer to run the API upload first (the tests already use direct API upload) or increase timeouts / polling in the UI spec.

Troubleshooting
- If Playwright fails to find browsers, run `npx playwright install`.
- If backend fails, check `backend.log` or run `cargo build` to see compiler output.

Contact
- If you want me to stabilize the UI test end-to-end (browser file input flow), I can continue and add robust retries or change the test to drive the host flow instead.
