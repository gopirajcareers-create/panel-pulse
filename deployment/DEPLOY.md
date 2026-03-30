# Panel Pulse AI — VM Deployment Guide

> **Target server:** `10.10.142.91`  
> **User:** `indium`  
> **Architecture:** Nginx (port 80) → Static React SPA + `/api/*` proxied to Node.js (port 3000) via PM2

---

## Table of Contents
1. [First-Time Setup](#1-first-time-setup)
2. [Redeploying Updates](#2-redeploying-updates)
3. [Useful PM2 Commands](#3-useful-pm2-commands)
4. [Nginx Management](#4-nginx-management)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. First-Time Setup

### Step 1 — SSH into the VM
```bash
ssh indium@10.10.142.91
# Password: Indium@123
```

### Step 2 — Run the setup script
```bash
curl -fsSL https://raw.githubusercontent.com/fabimore-dev/panel-pulse/main/deployment/setup-vm.sh | bash
```

Or if you cloned manually:
```bash
git clone https://github.com/fabimore-dev/panel-pulse.git /opt/panel-pulse
cd /opt/panel-pulse
chmod +x deployment/setup-vm.sh
bash deployment/setup-vm.sh
```

The script will:
- Install Node.js 20 LTS via nvm
- Install PM2 globally
- Install and configure Nginx
- Install all npm dependencies
- Create the `.env` file with production secrets
- Build the React frontend
- Start the backend with PM2
- Enable PM2 on system startup
- Activate the Nginx config

### Step 3 — Verify the deployment
```bash
# Check backend health
curl http://10.10.142.91/api/v1/health

# Check PM2 process
pm2 status

# Check nginx status
sudo systemctl status nginx
```

Open your browser and navigate to: **http://10.10.142.91**

---

## 2. Redeploying Updates

After pushing code changes to GitHub, SSH into the VM and run:

```bash
ssh indium@10.10.142.91
# Password: Indium@123

bash /opt/panel-pulse/deployment/deploy.sh
```

This will:
1. Pull the latest code (`git pull origin main`)
2. Re-install backend dependencies
3. Rebuild the React frontend
4. Restart the backend via PM2

---

## 3. Useful PM2 Commands

```bash
pm2 status                        # List all processes
pm2 logs panel-pulse-backend      # Tail live backend logs
pm2 logs panel-pulse-backend --lines 100  # Last 100 log lines
pm2 restart panel-pulse-backend   # Restart backend
pm2 stop panel-pulse-backend      # Stop backend
pm2 start panel-pulse-backend     # Start backend
pm2 monit                         # Live process monitor (CPU / mem)
pm2 save                          # Persist process list across reboots
```

---

## 4. Nginx Management

```bash
sudo nginx -t                     # Test config syntax
sudo systemctl reload nginx       # Apply config changes (no downtime)
sudo systemctl restart nginx      # Full restart
sudo systemctl status nginx       # Check status
sudo tail -f /var/log/nginx/panel-pulse.error.log   # Error log
sudo tail -f /var/log/nginx/panel-pulse.access.log  # Access log
```

Config file location: `/etc/nginx/sites-enabled/panel-pulse`

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| **502 Bad Gateway** | Backend isn't running. Run `pm2 start panel-pulse-backend` |
| **404 on page refresh** | Nginx SPA fallback missing — re-copy nginx config and reload |
| **CORS errors in browser** | `FRONTEND_URL` in `/opt/panel-pulse/backend/.env` must be `http://10.10.142.91` |
| **App loads but API fails** | Check `/opt/panel-pulse/backend/.env` exists with all credentials |
| **PM2 not found** | Re-run `source ~/.nvm/nvm.sh && npm install -g pm2` |
| **Cannot connect on port 80** | Run `sudo ufw allow 80/tcp && sudo ufw reload` |

### Check backend `.env` on the VM
```bash
cat /opt/panel-pulse/backend/.env
# Should have MONGODB_URI, GROQ_API_KEY, MISTRAL_API_KEY, etc.
```

### Manual .env creation (if setup script skipped it)
```bash
cat > /opt/panel-pulse/backend/.env << 'EOF'
PORT=3000
NODE_ENV=production
MONGODB_URI=<your-mongodb-atlas-uri>
MONGODB_DB=panel_db
FRONTEND_URL=http://10.10.142.91
GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL_NAME=llama-3.3-70b-versatile
MISTRAL_API_KEY=<your-mistral-api-key>
EMBEDDING_MODEL=mistral-embed
EMBEDDING_DIM=1024
EOF
pm2 restart panel-pulse-backend --update-env
```

---

## Architecture on VM

```
[Browser]  http://10.10.142.91
     │
     ▼  :80
[Nginx]
  ├── GET /            → /opt/panel-pulse/frontend/dist/index.html
  ├── GET /assets/*    → /opt/panel-pulse/frontend/dist/assets/
  └── /api/*           → http://localhost:3000  (proxy)
                              │
                         [PM2 — Node.js]
                         backend/src/index.js
                              │
                    ┌─────────┴─────────┐
               [MongoDB Atlas]      [GROQ API]
               (cloud)              (cloud)
```
