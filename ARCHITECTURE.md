# Architecture

## Overview

Wise is a bill-splitting application with a Rust backend, React frontend, and optional AI-powered receipt parsing.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  SQLite DB   │
│  (React/Vite)│     │   (Axum)     │     │  (WAL mode)  │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  AI Service  │
                    │   (Python)   │
                    └──────────────┘
```

## Components

### Frontend (`frontend/`)

- **React 19** with Vite 8 and TypeScript 6
- **CSS Custom Properties** design system (no UI framework)
- **Dark/Light mode** via `body.light-mode` class
- **Phone-shell mockup** pattern (430px mobile, 390x844px frame on desktop)
- **IndexedDB** for offline cache via `idb-keyval`
- **Capacitor 8** for Android builds

### Backend (`backend/`)

- **Axum** web framework on Tokio async runtime
- **SQLite** with WAL mode via sqlx (compile-time verified SQL)
- **WebSocket** broadcast for real-time sync
- **Gemini Vision API** for receipt OCR (graceful fallback to mock data)
- **Per-IP rate limiting** (100 req/min)

### Database Schema

5 tables in SQLite:

| Table | Purpose |
|-------|---------|
| `splits` | Bill metadata, tokens, amounts |
| `participants` | People in the split |
| `items` | Line items from receipt |
| `item_assignments` | Which person owns which item |
| `payments` | Payment records and confirmations |

## Data Flow

### Receipt Upload

```
1. Frontend uploads image → Backend
2. Backend sends to Python AI microservice (localhost:5000)
3. If AI service down → Backend falls back to Gemini Vision API
4. If no API key → Backend returns mock receipt data
5. Parsed items stored in DB
6. Items broadcast to all connected clients via WebSocket
7. Frontend receives items and navigates to assignment page
```

### Offline Mode

```
1. Frontend detects network loss
2. Shows offline banner with pending operations count
3. User continues making changes (assign/edit/add items)
4. Changes stored in IndexedDB pending-ops queue
5. On reconnect, pending ops replay to backend in order
6. Failed ops remain in queue for retry
7. IndexedDB cache provides read access to last known state
```

### Authentication

- **Owner token**: Bearer token in Authorization header, expires after 7 days
- **Guest token**: URL-based (`/guest/:token`), no header needed
- **Public read**: Split details accessible without auth (for sharing)

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/splits` | None | Create new split |
| GET | `/api/splits/:id` | None | Get split details |
| PUT | `/api/splits/:id/update` | Owner | Update split metadata |
| POST | `/api/splits/:id/receipt` | Owner | Upload receipt image |
| POST | `/api/splits/:id/items` | Owner | Add item |
| PUT | `/api/splits/:id/items/:itemId` | Owner | Edit item |
| DELETE | `/api/splits/:id/items/:itemId` | Owner | Delete item |
| PUT | `/api/splits/:id/items/:itemId/assign` | Owner | Assign item to participants |
| GET | `/api/splits/:id/summary` | None | Get bill summary |
| GET | `/api/splits/:id/settle` | None | Get settlement transactions |
| GET | `/api/splits/:id/payments` | None | Get payment records |
| POST | `/api/splits/:id/payments/:paymentId/confirm` | Guest | Confirm payment |
| GET | `/api/guest/:token` | None | Get guest view |
| POST | `/api/guest/:token/pay` | None | Record guest payment |
| GET | `/api/health` | None | Health check |
| WS | `/ws/:splitId` | None | WebSocket for real-time sync |

## WebSocket Events

Server → Client:
- `receipt_parsed` — AI finished parsing receipt
- `item_assigned` — Item assignment updated
- `item_added` — New item added
- `item_edited` — Item details changed
- `item_deleted` — Item removed
- `split_updated` — Split metadata changed
- `guest_paying` — Guest initiated payment
- `payment_confirmed` — Payment confirmed

## Deployment

### Docker

```bash
docker-compose up --build
```

- Backend: port 8081
- Frontend: port 5173 (nginx reverse proxy)

### Bare Metal

```bash
# Backend
cd backend
cargo build --release
./target/release/wise-server

# Frontend
cd frontend
npm run build
npx serve dist
```

### Android

```bash
cd frontend
npm run build:android
npx cap sync android
npx cap open android
```

## Key Design Decisions

1. **No UI library**: Custom CSS design system for full control over the phone-shell aesthetic
2. **SQLite over PostgreSQL**: Single-file database, zero config, perfect for a mobile-first app
3. **WebSocket broadcast**: Simple pub/sub pattern for real-time sync without complex state management
4. **Graceful AI degradation**: App works fully without API keys (mock data), with Gemini (cloud), or with local Python service
5. **Offline-first**: IndexedDB cache + pending ops queue ensures the app works without connectivity
