# Deploy Wise — Cloudflare Free Tier (Workers + Pages + D1 + R2)

Zero-cost, zero-credit-card, zero-expiry deployment on Cloudflare's edge.

| Service | Platform | Free Tier |
|---------|----------|-----------|
| Backend API | Cloudflare Workers | 100k requests/day |
| Database | Cloudflare D1 | 100k writes/day, 5GB reads/day |
| File Storage | Cloudflare R2 | 10GB, 1M requests/month |
| WebSocket | Durable Objects | 400k requests/month |
| Frontend | Cloudflare Pages | Unlimited bandwidth |
| AI Parsing | Google Gemini API | Free tier (existing key) |

**Total cost: $0/month forever.**

---

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) — free, no credit card
- [Google Gemini API key](https://aistudio.google.com/apikey) — already have this
- GitHub account

---

## Step 1: Install Tools

```bash
# Wrangler CLI (Cloudflare)
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

## Step 2: Create D1 Database

```bash
cd worker

# Create the database
wrangler d1 create wise
# → Copy the database_id into wrangler.toml (replace FILL_AFTER_CREATE)

# Apply the schema
wrangler d1 execute wise --file=schema.sql
```

## Step 3: Create R2 Bucket

```bash
wrangler r2 bucket create wise-receipts
```

## Step 4: Set Secrets

```bash
# Gemini API key
wrangler secret put GEMINI_API_KEY
# Paste your key when prompted

# Allowed origins (your Pages domain)
wrangler secret put ALLOWED_ORIGINS
# Paste: https://wise.pages.dev
```

## Step 5: Deploy the Worker

```bash
cd worker
wrangler deploy
# → Your API is live at: https://wise-api.YOUR_SUBDOMAIN.workers.dev
```

## Step 6: Deploy Frontend

```bash
cd frontend

# Set your Worker API URL
export VITE_API_BASE_URL="https://wise-api.YOUR_SUBDOMAIN.workers.dev/api"
export VITE_WS_BASE_URL="wss://wise-api.YOUR_SUBDOMAIN.workers.dev/api/ws"

# Build
npm run build

# Deploy to Pages
npx wrangler pages deploy dist --project-name=wise
# → Your frontend is live at: https://wise.pages.dev
```

## Step 7: Update Worker Secrets with Frontend URL

```bash
cd worker
wrangler secret put ALLOWED_ORIGINS
# Paste: https://wise.pages.dev

wrangler secret put PUBLIC_URL
# Paste: https://wise.pages.dev

wrangler deploy  # Redeploy to pick up env changes
```

---

## Set Up GitHub Actions (Auto-Deploy)

### Secrets to Add

Go to your GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Value | Where to find it |
|--------|-------|-----------------|
| `CLOUDFLARE_API_TOKEN` | API token | Cloudflare Dashboard → My Profile → API Tokens → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID | Cloudflare Dashboard → right sidebar |
| `VITE_API_BASE_URL` | `https://wise-api.YOUR_SUBDOMAIN.workers.dev/api` | From wrangler deploy output |
| `VITE_WS_BASE_URL` | `wss://wise-api.YOUR_SUBDOMAIN.workers.dev/api/ws` | Same, with wss:// |

### Token Permissions

When creating the API token, select:
- `Cloudflare Workers:Edit`
- `Cloudflare D1:Edit`
- `Cloudflare R2:Edit`
- `Cloudflare Pages:Edit`

---

## WebSocket

WebSocket connections go through Durable Objects — Cloudflare's stateful edge compute.
No special configuration needed. The frontend auto-detects WS from the API base URL.

Route: `GET /api/ws/:split_id` → Durable Object `SplitSocket` → accepts WebSocket upgrade.

## SQLite (D1)

D1 is Cloudflare's managed SQLite. It's not ephemeral — data persists across deploys.

Free tier: 100k writes/day, 5GB reads/day. More than enough for a student project.

## Receipt Images (R2)

Receipt images are stored in R2 (Cloudflare's S3-compatible storage).
Free tier: 10GB storage, 1M requests/month.

---

## Local Development

```bash
cd worker

# Run Worker locally with D1 + R2 emulation
wrangler dev --local --port 8081

# Frontend (separate terminal)
cd frontend
npm run dev
```

`wrangler dev --local` emulates D1, R2, and Durable Objects locally using SQLite files.

---

## Troubleshooting

**"VITE_API_BASE_URL is not set"** — Set this in GitHub Actions secrets or your shell before building.

**CORS errors** — Make sure `ALLOWED_ORIGINS` secret includes your Pages domain.

**WebSocket not connecting** — Check that `VITE_WS_BASE_URL` uses `wss://` (not `ws://`).

**D1 read/write errors** — Check wrangler.toml has the correct `database_id`.

**Receipt upload fails** — Check R2 bucket exists and `RECEIPTS` binding is correct.

---

## Architecture

```
Browser → Cloudflare Pages (frontend)
       → Cloudflare Workers (API)
       → D1 (SQLite database)
       → R2 (receipt images)
       → Durable Objects (WebSocket)
       → Google Gemini API (receipt parsing)
```

Everything runs on Cloudflare's edge network. No VMs, no Docker, no cold starts.

## What Changed from Docker Setup

- `backend/` → rewritten as Cloudflare Worker (workers-rs)
- SQLite file → D1 (managed SQLite)
- File uploads → R2 (object storage)
- WebSocket broadcasts → Durable Objects
- Python AI service → eliminated (Gemini called directly from Worker)
- Docker Compose → wrangler.toml
- `setup-vps.sh` → not needed
- `deploy.sh` → `wrangler deploy`
