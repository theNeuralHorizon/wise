#!/bin/bash
# First-time VPS setup for Wise production deployment.
# Run this as root on a fresh Ubuntu 22.04/24.04 server.
# Usage: bash setup-vps.sh
set -euo pipefail

echo "=== Wise VPS Setup ==="
echo ""

# 1. System updates
echo "→ Updating system packages..."
apt-get update
apt-get upgrade -y

# 2. Install Docker + Docker Compose plugin
echo "→ Installing Docker..."
if ! command -v docker &>/dev/null; then
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
echo "Docker version: $(docker --version)"
echo "Compose version: $(docker compose version)"

# 3. Create non-root user
echo "→ Creating 'wise' user..."
if ! id -u wise &>/dev/null; then
  useradd -m -s /bin/bash -G docker wise
  echo "User 'wise' created (added to docker group)"
else
  echo "User 'wise' already exists"
fi

# 4. UFW firewall
echo "→ Configuring UFW firewall..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  echo "UFW status:"
  ufw status
else
  apt-get install -y ufw
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

# 5. Create deployment directory
echo "→ Creating /opt/wise..."
mkdir -p /opt/wise
chown wise:wise /opt/wise

# 6. Clone repo
echo "→ Cloning repository..."
if [ ! -d "/opt/wise/.git" ]; then
  sudo -u wise git clone https://github.com/theNeuralHorizon/wise.git /opt/wise
else
  echo "Repository already cloned"
fi

# 7. Create .env.production from example
if [ ! -f "/opt/wise/.env.production" ]; then
  if [ -f "/opt/wise/.env.production.example" ]; then
    cp /opt/wise/.env.production.example /opt/wise/.env.production
    echo "Created .env.production from example — edit it with your values"
  fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. SSH in as wise: ssh wise@YOUR_SERVER_IP"
echo "  2. Edit /opt/wise/.env.production with your env vars"
echo "  3. Run: cd /opt/wise && bash deploy.sh"
echo ""
