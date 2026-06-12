# Wise Deployment Guide

## Option A: Fly.io (Recommended — easiest)

### Prerequisites
1. Install flyctl: `curl -L https://fly.io/install.sh | sh`
2. Sign up: `fly auth signup`
3. Have a domain ready (optional but recommended)

### Step 1: Deploy Backend
```bash
cd backend
fly launch --no-deploy
fly secrets set GEMINI_API_KEY=your_key_here
fly secrets set ALLOWED_ORIGINS=https://your-domain.com,https://wise-app.fly.dev
fly deploy
```

### Step 2: Deploy Frontend
```bash
cd frontend
# Update fly.toml env with your backend URL
fly launch --no-deploy
fly secrets set VITE_API_BASE_URL=https://your-backend.fly.dev/api
fly secrets set VITE_WS_BASE_URL=wss://your-backend.fly.dev
fly secrets set VITE_FRONTEND_URL=https://your-domain.com
fly deploy
```

### Step 3: Custom Domain (optional)
```bash
fly certs add your-domain.com
fly certs add www.your-domain.com
```

### Step 4: Set Up SQLite Volume
```bash
fly volume create wise_data:1 --region iad
```

Update `fly.toml`:
```toml
[mounts]
  source = "wise_data"
  destination = "/data"
```

## Option B: Docker Compose (VPS)

### On your VPS (Ubuntu/Debian)
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone repo
git clone https://github.com/theNeuralHorizon/wise.git
cd wise

# Configure
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

# Start
docker-compose up -d

# Set up nginx reverse proxy + SSL
apt install nginx certbot python3-certbot-nginx
```

### Nginx config (`/etc/nginx/sites-available/wise`)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/wise /etc/nginx/sites-enabled/
certbot --nginx -d your-domain.com
systemctl reload nginx
```

## Option C: Railway / Render (one-click)

### Railway
1. Push to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add backend service, set env vars
4. Add frontend service, set env vars

### Render
1. Push to GitHub
2. Go to render.com → New Web Service
3. Select repo, set build commands
4. Add environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | No | Gemini Vision API key (demo mode without) |
| `DATABASE_URL` | Yes | SQLite connection string |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins |
| `HOST` | Yes | Bind address (0.0.0.0 for production) |
| `PORT` | Yes | Listen port (8081) |
| `RUST_LOG` | No | Log level filter |
| `VITE_API_BASE_URL` | Yes | Frontend API URL |
| `VITE_WS_BASE_URL` | Yes | Frontend WebSocket URL |
| `VITE_FRONTEND_URL` | Yes | Frontend public URL |

## Health Checks

- Backend: `GET /api/health` returns `{"status": "ok"}`
- Fly.io auto-monitors this endpoint
- For external monitoring: use Uptime Robot, Betterstack, or similar

## Backups

SQLite database is at `/data/wise.db` (Docker) or `./wise.db` (local).

### Automated backup script
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /data/wise.db /backups/wise_${DATE}.db
# Keep last 7 days
find /backups -name "wise_*.db" -mtime +7 -delete
```

### Fly.io volume backup
```bash
fly ssh console -C "cat /data/wise.db" > wise_backup_$(date +%Y%m%d).db
```
