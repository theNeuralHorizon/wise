#!/bin/bash
set -euo pipefail

REMOTE_HOST="${DEPLOY_HOST:-your-server-ip}"
REMOTE_USER="${DEPLOY_USER:-wise}"
REMOTE_DIR="/opt/wise"
BRANCH="${DEPLOY_BRANCH:-main}"

echo "=== Wise Deploy ==="
echo "Target: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
echo "Branch: ${BRANCH}"
echo ""

ssh "${REMOTE_USER}@${REMOTE_HOST}" << DEPLOY_EOF
set -euo pipefail
cd "${REMOTE_DIR}"

echo "→ Pulling latest code..."
git fetch origin
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

echo "→ Building and starting services..."
sudo docker compose -f docker-compose.prod.yml up -d --build

echo "→ Waiting for services to start..."
sleep 5

echo "→ Tailing logs for 30 seconds..."
timeout 30 sudo docker compose -f docker-compose.prod.yml logs -f --tail=50 || true

echo "→ Service status:"
sudo docker compose -f docker-compose.prod.yml ps

echo "→ Health check:"
curl -sf http://localhost/api/health && echo " API OK" || echo " API NOT READY"

echo ""
echo "=== Deploy complete ==="
DEPLOY_EOF
