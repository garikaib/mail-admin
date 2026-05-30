---
description: How to deploy the ZimPrices Mail Admin application
---

# Deploy Mail Admin

This workflow handles the deployment of the Mail Admin FastAPI + React application to the production server.

## Prerequisites
- Local environment with SSH access to the server.
- `backend/requirements.txt` must be up to date.
- `.env` file must exist on the server at `/opt/mail_admin/.env`.

## Steps

1. **Verify Requirements**
   Ensure `backend/requirements.txt` includes all recent dependencies.
   ```bash
   # Check specific package if unsure
   grep "django-htmx" backend/requirements.txt
   ```

2. **Run Deployment Script**
   Execute the deployment script from the project root. This script:
   - Creates a minimal bundle (< 100KB).
   - Excludes local artifacts (`venv`, `__pycache__`, `tailwindcss` binary).
   - Uploads to server.
   - Installs dependencies on remote (via `pip`).
   - Runs migrations and collects static files.
   - Restarts the `mail-admin` systemd service.

   // turbo
   ```bash
   ./scripts/deployment/deploy.sh
   ```

3. **Verify Deployment**
   Check the service status and logs if needed.
   ```bash
   ssh ubuntu@51.77.222.232 "sudo systemctl status mail-admin"
   ```
