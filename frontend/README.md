# Wise Frontend

React + TypeScript frontend for the Wise bill-splitting app.

## Quick Start

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Backend must be running on `http://127.0.0.1:8081`.

## Stack

- **React 19** + **TypeScript** (strict mode)
- **Vite 7** dev server with HMR
- **Zod** for runtime API schema validation
- **Capacitor 8.4** for Android build
- **Playwright** for E2E tests

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm run build:android` | Build + `npx cap sync android` |
| `npm run typecheck` | TypeScript check only |
| `npx playwright test` | Run E2E tests |
| `cargo build --release` (from `../backend`) | Build Rust backend |

## Project Structure

```
src/
  App.tsx              — Root: auth, routing, WebSocket, offline, toast, modals
  main.tsx             — React entry point
  config.ts            — API_BASE URL, LAN IP detection, share link builder
  schemas.ts           — Zod schemas for all API types (Item, SplitDetail, etc.)
  index.css            — Complete design system (~1550 lines, CSS custom properties)
  upi.ts               — UPI deeplink opener (Capacitor-aware)
  offline/
    cache.ts           — IndexedDB split cache with TTL
    pendingOps.ts      — Pending operations queue (add person, upload, assign, etc.)
    useOffline.ts      — Offline detection hook + auto-replay on reconnect
  hooks/
    useApi.ts          — All API methods (fetch wrapper with auth headers)
    useWebSocket.ts    — Realtime split updates via WebSocket
    useTokenRecovery.ts — Token recovery via name matching
  components/
    HomeScreen.tsx     — Split list, create/join, name editing
    CreateSplit.tsx     — Split setup: name, friends, items, assign, tax/tip, upload
    ReceiptUpload.tsx   — AI receipt scanning (camera or file)
    ReceiptView.tsx     — View extracted receipt items
    ItemAssignment.tsx  — Assign items to people, add/edit/delete items
    SplitSummary.tsx    — Final split view: balances, payments, QR code, share
    GuestView.tsx       — Guest payment screen (UPI, cash, mark paid)
    HistoryScreen.tsx   — Past splits list
    GuestWrapper.tsx    — Guest route wrapper with offline caching
  components/
    Toast.tsx           — Toast notification system
    Modal.tsx           — Modal dialog (used for QR code, etc.)
    Confetti.tsx        — Confetti animation overlay
    NavBar.tsx          — Bottom navigation bar (unused currently)
```

## Design System

All styles use CSS custom properties defined in `:root` in `index.css`.

**Colors:** `--color-bg`, `--color-surface`, `--color-primary`, `--color-accent`, `--color-text`
**Typography:** `--text-xs` through `--text-5xl`, `--weight-normal/medium/semibold/bold`
**Spacing:** `--space-1` (4px) through `--space-16` (64px)
**Radius:** `--radius-sm` (8px) through `--radius-2xl` (24px)

### Adding new styles

Use existing CSS classes instead of inline styles:

```tsx
// Bad
<div style={{ padding: '16px', background: 'var(--color-surface)' }}>

// Good
<div className="card">
```

Key CSS classes: `card`, `btn`, `btn-primary`, `btn-secondary`, `btn-green`, `form-group`, `form-input`, `form-row`, `header-row`, `back-btn`, `pill`, `payment-item`, `recovery-bar`, `offline-banner`, `loading-screen`, `token-reveal-sheet`.

## Mobile/Responsive

- **Mobile** (≤440px): Full-screen, no phone frame. `--content-padding` for safe areas.
- **Desktop** (>440px): Centered phone mockup (390×844px) with status bar, island, rounded corners.
- All touch targets ≥ 44px (`--touch-min`).

## Android (Capacitor)

```bash
npm run build:android
# Opens Android Studio, or:
cd android && ./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

Features: deep link intent filters (`app.wise.split://`, `upi://`), Capacitor Browser plugin for UPI.

## Offline Mode

IndexedDB cache stores last-known split data. When offline:
- Cached splits display with "📡 Offline — showing cached data" banner
- Add person/item/assign operations queue as pending ops
- On reconnect, pending ops auto-replay in order

## E2E Tests

Tests run against a live backend + Vite dev server.

```bash
npx playwright test                    # all tests
npx playwright test tests/e2e.spec.ts  # core flows only
```

Tests: create split, upload receipt, token persistence, direct URL access, guest link, hash fragment, back navigation.
