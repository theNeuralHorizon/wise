# Deploy Wise — Free Hosting (Railway + Cloudflare Pages)

Zero-cost production deployment. No credit card required.

| Service | Platform | Cost | Notes |
|---------|----------|------|-------|
| Backend (Rust) | Railway | Free ($5/mo credit) | Never spins down |
| AI Service (Python) | Railway | Free (same project) | Internal only, no public URL |
| Frontend (static) | Cloudflare Pages | Free forever | Unlimited bandwidth, CDN |

**Total cost: $0/month** (Railway free tier covers ~500 hours, more than enough)

---

## Prerequisites

- GitHub account (you already have this)
- [Railway account](https://railway.app) — sign up with GitHub
- [Cloudflare account](https://dash.cloudflare.com/sign-up) — free, no credit card

---

## Step 1: Install CLI Tools

```bash
# Railway CLI
npm install -g @railway/cli

# Cloudflare Wrangler CLI
npm install -g wrangler
```

## Step 2: Create Railway Project

```bash
# Login to Railway
railway login

# Initialize a new Railway project (in the repo root)
railway init

# Link to your project
railway link
```

### Add Backend Service

```bash
# Create a service for the backend
railway service create backend

# Set the Dockerfile path
railway variables set RAILWAY_DOCKERFILE_PATH=backend/Dockerfile.prod --service backend

# Set environment variables
railway variables set HOST=0.0.0.0 --service backend
railway variables set PORT=8081 --service backend
railway variables set DATABASE_URL="sqlite:/app/data/wise.db?mode=rwc" --service backend
railway variables set AI_SERVICE_URL="http://ai_service.railway.internal:5000/parse" --service backend
railway variables set ALLOWED_ORIGINS="*" --service backend

# Deploy
railway up --service backend
```

### Add AI Service

```bash
# Create a service for the AI microservice
railway service create ai_service

# Set the Dockerfile path
railway variables set RAILWAY_DOCKERFILE_PATH=Dockerfile --service ai_service

# Set environment variables
railway variables set PORT=5000 --service ai_service
railway variables set GEMINI_API_KEY="your_gemini_api_key" --service ai_service

# Deploy
railway up --service ai_service
```

### Get Your Backend URL

```bash
# Generate a public domain for the backend
railway domain --service backend

# This gives you something like: wise-backend-production.up.railway.app
# Copy this URL — you'll need it for the frontend.
```

### Set Backend PUBLIC_URL

```bash
# Set the public URL so guest links point to the frontend
railway variables set PUBLIC_URL="https://wise.pages.dev" --service backend
railway variables set BASE_URL="https://wise-backend-production.up.railway.app" --service backend

# Redeploy to pick up new env vars
railway up --service backend
```

### Persist SQLite Data (Optional)

Railway's filesystem is ephemeral — data resets on redeploy. To fix this:

1. Go to Railway dashboard → your backend service → Settings
2. Add a volume: mount path = `/app/data`
3. Set `DATABASE_URL=sqlite:/app/data/wise.db?mode=rwc`

This is fine for a student project with low traffic.

## Step 3: Deploy Frontend to Cloudflare Pages

```bash
cd frontend

# Login to Cloudflare
npx wrangler login

# Set your backend API URL (replace with your actual Railway URL)
export VITE_API_BASE_URL="https://your-backend.up.railway.app/api"

# Build
npm run build

# Deploy
npx wrangler pages deploy dist --project-name=wise
```

This gives you: `https://wise.pages.dev`

### Set Custom Domain (Optional)

1. Go to Cloudflare Dashboard → Pages → wise → Custom domains
2. Add your domain (e.g., `wise.yourdomain.com`)
3. Cloudflare handles SSL automatically — free, zero config

## Step 4: Update Backend CORS

```bash
# Update CORS to allow your Cloudflare Pages domain
railway variables set ALLOWED_ORIGINS="https://wise.pages.dev,http://localhost:5173" --service backend

# Redeploy
railway up --service backend
```

## Step 5: Set Up GitHub Actions (Auto-Deploy)

### Railway Token

1. Go to Railway dashboard → Account Settings → Tokens
2. Create a new token, copy it
3. Go to your GitHub repo → Settings → Secrets and variables → Actions
4. Add secret: `RAILWAY_TOKEN` = your token

### Cloudflare Tokens

1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create token with `Cloudflare Pages:Edit` permissions
3. Copy the token
4. Go to your Cloudflare Dashboard → right sidebar → Account ID
5. Copy the Account ID
6. Add to GitHub secrets:
   - `CLOUDFLARE_API_TOKEN` = your API token
   - `CLOUDFLARE_ACCOUNT_ID` = your account ID
   - `VITE_API_BASE_URL` = `https://your-backend.up.railway.app/api`

### Done

Push to `main` now auto-deploys:
- `backend/` or `ai_service/` changes → Railway
- `frontend/` changes → Cloudflare Pages

---

## WebSocket

Railway supports WebSocket on the same port as HTTP. No special config needed.
The frontend auto-detects WS from the API base URL (https→wss, http→ws).

## Troubleshooting

**"VITE_API_BASE_URL is not set"** — Set this in GitHub Actions secrets or Cloudflare Pages build env.

**Guest link doesn't work** — Make sure `PUBLIC_URL` is set on the backend to your frontend URL.

**CORS errors** — Make sure `ALLOWED_ORIGINS` on the backend includes your Cloudflare Pages URL.

**AI service not responding** — Check that `AI_SERVICE_URL=http://ai_service.railway.internal:5000/parse` is set on the backend service.

**Data lost after redeploy** — Railway filesystem is ephemeral. Add a volume for SQLite persistence (see Step 2).

---

## Comparison: Free Hosting Options

| Platform | Free Tier | Spin Down | Best For |
|----------|-----------|-----------|----------|
| **Railway** | $5/mo credit, ~500 hrs | No | This app ✓ |
| Render | Free tier | 15 min inactivity | Static sites only |
| Fly.io | 3 shared VMs | No | Needs credit card |
| Vercel | Free, 100GB bandwidth | Serverless (cold starts) | Frontend only |
| Cloudflare Pages | Free, unlimited | N/A (static) | Frontend ✓ |

**Railway wins** for this stack: Rust binary, no spin down, internal networking, $0 cost.
