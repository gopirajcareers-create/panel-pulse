#!/usr/bin/env bash
# =============================================================
# setup-vm.sh — First-time VM provisioning for Panel Pulse AI
# Run this ONCE on the VM after SSH-ing in.
# Usage:
#   chmod +x setup-vm.sh
#   sudo bash setup-vm.sh
# =============================================================
set -euo pipefail

APP_DIR="/opt/panel-pulse"
REPO_URL="https://github.com/fabimore-dev/panel-pulse.git"
LOG_DIR="/var/log/panel-pulse"
NGINX_SITE="/etc/nginx/sites-available/panel-pulse"

echo ""
echo "========================================"
echo "  Panel Pulse AI — First-time VM Setup"
echo "========================================"

# ── 1. System packages ───────────────────────────────────────
echo ""
echo "▶ [1/8] Updating system packages..."
apt-get update -y
apt-get install -y curl git nginx build-essential

# ── 2. Node.js 20 LTS ───────────────────────────────────────
echo ""
echo "▶ [2/8] Installing Node.js 20 LTS..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
node -v && npm -v

# ── 3. PM2 ──────────────────────────────────────────────────
echo ""
echo "▶ [3/8] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u indium --hp /home/indium | tail -1 | bash || true

# ── 4. Clone repo ───────────────────────────────────────────
echo ""
echo "▶ [4/8] Cloning repository..."
mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
    echo "   Repo already exists, pulling latest..."
    cd "$APP_DIR" && git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
fi

# ── 5. Backend .env ─────────────────────────────────────────
echo ""
echo "▶ [5/8] Creating backend .env ..."
if [ ! -f "$APP_DIR/backend/.env" ]; then
    cat > "$APP_DIR/backend/.env" <<'ENV'
PORT=3000
NODE_ENV=production
FRONTEND_URL=http://10.10.142.91
ALLOWED_ORIGIN=http://10.10.142.91

# ── Fill in your actual values below ──────────────────
MONGODB_URI=<your-mongodb-atlas-uri>
MONGODB_DB=panel_db

GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL_NAME=llama-3.3-70b-versatile

MISTRAL_API_KEY=<your-mistral-api-key>
EMBEDDING_MODEL=mistral-embed
EMBEDDING_DIM=1024
ENV
    echo "   ✅ .env written at $APP_DIR/backend/.env"
else
    echo "   ✅ .env already exists — skipping (edit manually if needed)"
fi

# ── 6. Install deps + build ──────────────────────────────────
echo ""
echo "▶ [6/8] Installing backend dependencies..."
cd "$APP_DIR/backend" && npm install --omit=dev

echo ""
echo "▶ [7/8] Building frontend..."
cd "$APP_DIR/frontend"
echo "VITE_API_BASE_URL=http://10.10.142.91"  > .env.production
echo "VITE_APP_NAME=Panel Pulse AI"          >> .env.production
echo "VITE_ENABLE_MOCK=false"                >> .env.production
npm install
npm run build

# ── 7. PM2 start ────────────────────────────────────────────
echo ""
echo "▶ [8/8] Starting backend via PM2..."
mkdir -p "$LOG_DIR"
# Transfer full ownership to the deploy user so future deploys run without sudo
chown -R indium:indium "$APP_DIR"
chown -R indium:indium "$LOG_DIR"
cd "$APP_DIR"
pm2 delete panel-pulse-backend 2>/dev/null || true
pm2 start deployment/ecosystem.config.js --env production
pm2 save

# ── Allow indium to remove the frontend dist dir without a password ─────────
# This lets deploy.sh clear root-owned build artifacts without requireing
# interactive sudo (deploy runs non-interactively as indium).
DEPLOY_SUDOERS="/etc/sudoers.d/panel-pulse-deploy"
printf '%s\n' \
    "indium ALL=(root) NOPASSWD: /usr/bin/rm -rf /opt/panel-pulse/frontend/dist" \
    "indium ALL=(root) NOPASSWD: /usr/bin/tee /etc/nginx/sites-available/panel-pulse" \
    "indium ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx" \
    "indium ALL=(root) NOPASSWD: /usr/sbin/nginx -t" \
    > "$DEPLOY_SUDOERS"
chmod 440 "$DEPLOY_SUDOERS"
echo "   ✅ sudoers rule written: $DEPLOY_SUDOERS"

# ── 8. nginx ────────────────────────────────────────────────
echo ""
echo "▶ [9/9] Configuring nginx..."
cp "$APP_DIR/deployment/nginx.conf" "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/panel-pulse
# Remove default site if present
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo ""
echo "========================================"
echo "  ✅  Setup complete!"
echo ""
echo "  Frontend : http://10.10.142.91"
echo "  API health: http://10.10.142.91/api/v1/health"
echo ""
echo "  Useful commands:"
echo "    pm2 status                    — check backend status"
echo "    pm2 logs panel-pulse-backend  — tail backend logs"
echo "    sudo nginx -t && sudo systemctl reload nginx"
echo "========================================"
