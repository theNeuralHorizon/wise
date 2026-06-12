# Release Checklist — Wise v1.1.0

Complete this checklist before going live.

---

## Pre-Deploy Verification

- [x] `cargo build --release` — builds successfully
- [x] `npm run build` — frontend builds (110KB gzipped)
- [x] `cargo clippy -- -D warnings` — zero warnings
- [x] `npx tsc --noEmit` — zero type errors
- [x] `npm run test:unit` — 81/81 pass
- [x] `cargo test` — 5/5 pass
- [x] `npx playwright test` — 7/7 pass
- [x] `GET /api/health` returns `{"status":"ok","db":"healthy"}`
- [x] Signed Android release APK (2.0MB) installs and launches
- [x] Privacy policy at `/privacy.html`

---

## Step 1: Deploy Backend to Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh
fly auth signup  # or fly auth login

# Create app
cd backend
fly launch --name wise-api --region iad --no-deploy

# Create persistent volume for SQLite
fly volume create wise_data:1 --region iad

# Set secrets
fly secrets set GEMINI_API_KEY=your_gemini_key_here
fly secrets set ALLOWED_ORIGINS=https://wise-api.fly.dev,https://wise-app.fly.dev
fly secrets set RUST_LOG=wise_server=info,tower_http=info,sqlx=warn

# Add volume mount to fly.toml (under [mounts]):
# [mounts]
#   source = "wise_data"
#   destination = "/home/wise"

# Deploy
fly deploy

# Verify
curl https://wise-api.fly.dev/api/health
```

## Step 2: Deploy Frontend to Fly.io

```bash
cd frontend

# Create app
fly launch --name wise-app --region iad --no-deploy

# Set secrets
fly secrets set VITE_API_BASE_URL=https://wise-api.fly.dev/api
fly secrets set VITE_WS_BASE_URL=wss://wise-api.fly.dev
fly secrets set VITE_FRONTEND_URL=https://wise-app.fly.dev
fly secrets set VITE_SENTRY_DSN=your_sentry_dsn_here

# Deploy
fly deploy

# Verify
curl -I https://wise-app.fly.dev/
```

## Step 3: Custom Domain (Optional)

```bash
# Add your domain
fly certs add yourdomain.com
fly certs add www.yourdomain.com

# Update CORS
fly secrets set ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com --app wise-api

# Update frontend URL
fly secrets set VITE_FRONTEND_URL=https://yourdomain.com --app wise-app
```

## Step 4: Set Up Error Tracking

1. Go to [sentry.io](https://sentry.io) → Create project (React)
2. Copy the DSN
3. Set it as `VITE_SENTRY_DSN` in Fly.io frontend secrets
4. Redeploy frontend: `fly deploy`

## Step 5: Set Up Monitoring

1. Sign up for [UptimeRobot](https://uptimerobot.com) (free)
2. Add monitor: `https://wise-api.fly.dev/api/health`
3. Set check interval: 5 minutes
4. Add email/Slack alerts

## Step 6: Android Play Store Release

### Prerequisites
- Google Play Developer account ($25 one-time at [play.google.com/console](https://play.google.com/console))
- Keystore file: `frontend/android/app/wise-release.keystore` (password: `wise123`)

### Generate Play Store Build (AAB)
```bash
cd frontend
npm run build:android
npx cap sync android
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Store Listing Requirements
1. **App name**: Wise — Split Bills Easily
2. **Short description**: Split restaurant bills with friends. AI receipt scanning, UPI payments, offline support.
3. **Full description**: (see `PLAYSTORE_DESCRIPTION.md` below)
4. **Screenshots**: 2-8 screenshots (phone + tablet optional)
   - Home screen
   - Receipt scan flow
   - Item assignment
   - Summary with UPI payment
   - Guest view
5. **Feature graphic**: 1024x500px
6. **App icon**: 512x512px (use existing icon)
7. **Privacy policy URL**: `https://yourdomain.com/privacy.html`

### Submit for Review
1. Go to [play.google.com/console](https://play.google.com/console)
2. Create app → Store listing → Upload screenshots
3. Upload AAB to Internal testing track
4. Add testers (email list)
5. Promote to Closed beta → Production

---

## Post-Deploy Checklist

- [ ] Backend health check returns 200
- [ ] Frontend loads without console errors
- [ ] Receipt upload works end-to-end
- [ ] WebSocket real-time sync works (open 2 tabs)
- [ ] Guest link loads correctly
- [ ] UPI deeplinks open correctly on Android
- [ ] Offline mode caches and replays
- [ ] Dark/light mode toggle works
- [ ] Sentry receives test error (optional)
- [ ] UptimeRobot monitor shows green

---

## Rollback

If something breaks:

```bash
# Rollback backend
fly releases list --app wise-api
fly releases rollback <release-id> --app wise-api

# Rollback frontend
fly releases list --app wise-app
fly releases rollback <release-id> --app wise-app
```

---

## Environment Variables Reference

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `GEMINI_API_KEY` | Backend | No | Gemini Vision API key |
| `SENTRY_DSN` | Backend | No | Sentry error tracking |
| `ALLOWED_ORIGINS` | Backend | Yes | CORS origins (comma-separated) |
| `RUST_LOG` | Backend | No | Log level filter |
| `DATABASE_URL` | Backend | Yes | SQLite connection string |
| `HOST` | Backend | Yes | Bind address (0.0.0.0) |
| `PORT` | Backend | Yes | Listen port (8081) |
| `VITE_API_BASE_URL` | Frontend | Yes | Backend API URL |
| `VITE_WS_BASE_URL` | Frontend | Yes | Backend WebSocket URL |
| `VITE_FRONTEND_URL` | Frontend | Yes | Frontend public URL |
| `VITE_SENTRY_DSN` | Frontend | No | Sentry DSN |

---

## Play Store Description

**Wise — Split Bills Easily**

Tired of awkward math at dinner? Wise splits restaurant bills automatically using AI receipt scanning.

**How it works:**
1. Scan your receipt with the camera
2. AI reads every item and calculates shares
3. Share a link with your friends
4. Everyone sees their amount and pays via UPI

**Features:**
- AI Receipt Scanning — Snap a photo, items appear in 2 seconds
- Smart Splitting — Items assigned to who ordered what
- UPI Payments — One-tap payment links
- Offline Mode — Works without internet, syncs when back online
- Real-time Sync — See changes instantly across all devices
- Guest Access — No app install needed, just open a link
- Dark Mode — Easy on the eyes for late-night dinners
- Settlement Optimization — Minimum transactions to settle all debts

**Privacy first:**
- No accounts required
- No payment data stored
- Open source
- Receipt images deleted after parsing

Built with Rust, React, and AI. Open source at github.com/theNeuralHorizon/wise
