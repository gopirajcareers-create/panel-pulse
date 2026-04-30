# Production VM Deployment — Panel Pulse AI

Target VM: `10.10.142.91` (user `indium`)

This document describes a safe, repeatable production deployment to the VM. It assumes the repository is `https://github.com/fabimore-dev/panel-pulse` and the app will be deployed to `/opt/panel-pulse`.

## 1. Preconditions
- Ensure you're on a machine with network access to `10.10.142.91` (private network).
- Have the VM SSH credentials (user `indium`, password or SSH key). Replace password-based SSH with keys in production.
- Confirm necessary secrets: `MONGODB_URI`, `GROQ_API_KEY`, `MISTRAL_API_KEY`.

## 2. First-time setup (one-time)
1. SSH into the VM:
```bash
ssh indium@10.10.142.91
# Password: Indium@123  # replace with secure password or use SSH key
```

2. Install `curl` if it's missing (the setup script uses it):
```bash
sudo apt update -y
sudo apt install -y curl
```

3. Make sure the deployment directory is owned by the deploy user (preferred):
```bash
sudo chown -R indium:indium /opt/panel-pulse || true
```

4. Run the setup script (clones repo, installs Node, PM2, nginx, builds frontend):
```bash
curl -fsSL https://raw.githubusercontent.com/fabimore-dev/panel-pulse/main/deployment/setup-vm.sh | sudo bash
```

If you prefer to review the script before executing, clone the repo and run it locally on the VM:
```bash
sudo git clone https://github.com/fabimore-dev/panel-pulse.git /opt/panel-pulse
cd /opt/panel-pulse
sudo chmod +x deployment/setup-vm.sh
sudo bash deployment/setup-vm.sh
```

## 3. Configure production secrets (`/opt/panel-pulse/backend/.env`)
Edit the backend `.env` on the VM; do NOT commit secrets to git. Two safe methods:

- Interactive edit (recommended):
```bash
sudo nano /opt/panel-pulse/backend/.env
```

- Overwrite using a heredoc (will replace the file):
```bash
sudo tee /opt/panel-pulse/backend/.env > /dev/null <<'EOF'
PORT=3000
NODE_ENV=production
FRONTEND_URL=http://10.10.142.91
ALLOWED_ORIGIN=http://10.10.142.91

MONGODB_URI=<your-mongodb-atlas-uri>
MONGODB_DB=panel_db

GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL_NAME=llama-3.3-70b-versatile

MISTRAL_API_KEY=<your-mistral-api-key>
EMBEDDING_MODEL=mistral-embed
EMBEDDING_DIM=1024
EOF

pm2 restart panel-pulse-backend --update-env || true
```

Notes:
- Keep these values private. Use a secrets manager if available.
- If using the frontend on the VM, the frontend build uses `VITE_API_BASE_URL=http://10.10.142.91`. The client code also accepts `VITE_API_URL`—both are supported.

## 4. Start / Restart backend with PM2
Start the app using the provided ecosystem config:
```bash
cd /opt/panel-pulse
pm2 start deployment/ecosystem.config.js --env production
pm2 save
pm2 status
```

If a `dubious ownership` error appears when pulling, either change ownership (preferred) or add a safe.directory entry:
```bash
sudo chown -R indium:indium /opt/panel-pulse
# OR (if you cannot chown):
git config --global --add safe.directory /opt/panel-pulse
```

## 5. Redeploying updates
When you need to deploy a code update:
```bash
ssh indium@10.10.142.91
bash /opt/panel-pulse/deployment/deploy.sh
```

`deploy.sh` will: pull `main`, install backend deps, write `frontend/.env.production` with `VITE_API_BASE_URL=http://10.10.142.91`, build the frontend, then restart the backend via PM2.

## 6. Nginx
The deployment provides `/etc/nginx/sites-available/panel-pulse` → symlinked to `sites-enabled` during setup. Common ops:
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/panel-pulse.error.log
```

## 7. Health checks & verification
```bash
curl http://10.10.142.91/api/v1/health
# should return 200 / a small JSON payload

open http://10.10.142.91  # in a browser on the reachable network
```

## 8. Logs and troubleshooting
- PM2 process list and logs:
```bash
pm2 status
pm2 logs panel-pulse-backend --lines 200
```
- Backend error file (as configured in ecosystem.config.js):
```bash
sudo tail -n 200 /var/log/panel-pulse/backend-error.log
```
- Nginx logs:
```bash
sudo tail -n 200 /var/log/nginx/panel-pulse.error.log
sudo tail -n 200 /var/log/nginx/panel-pulse.access.log
```

## 9. Rollback
To roll back to the previous commit on the VM:
```bash
cd /opt/panel-pulse
git fetch origin
git checkout <previous-commit-or-tag>
bash deployment/deploy.sh
```

## 10. Security & hardening checklist
- Replace password SSH with key-based auth and disable `PasswordAuthentication` in `/etc/ssh/sshd_config`.
- Restrict `sudo` usage and change default passwords.
- Use a firewall (`ufw`) to allow only ports 22 and 80 (and 443 if you enable TLS):
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
```
- Consider adding HTTPS with Let's Encrypt (Certbot) and proxying via nginx.

## 11. Appendix — useful commands summary
```bash
# First-time
ssh indium@10.10.142.91
sudo apt install -y curl
curl -fsSL https://raw.githubusercontent.com/fabimore-dev/panel-pulse/main/deployment/setup-vm.sh | sudo bash

# Redeploy
ssh indium@10.10.142.91
bash /opt/panel-pulse/deployment/deploy.sh

# Check
curl http://10.10.142.91/api/v1/health
pm2 status
pm2 logs panel-pulse-backend
```

---
If you want, I can:
- Insert the exact `MONGODB_URI`, `GROQ_API_KEY`, and `MISTRAL_API_KEY` into the heredoc above (do **not** commit afterwards). Provide them via a secure channel.
- Add an automated `env` templating step that pulls secrets from a safer store.
