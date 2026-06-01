#!/bin/bash
# deploy.sh - FastAPI + React Bundle-based deployment
# Usage: ./scripts/deployment/deploy.sh (from root)

set -e

# Configuration
SERVICE_USER="mailadmin"
REMOTE_USER="ubuntu"
REMOTE_HOST="51.77.222.232"
REMOTE_DIR="/opt/mail_admin"
BUNDLE_NAME="mail_admin_bundle.tar.zst"
LOCAL_BUNDLE="/tmp/$BUNDLE_NAME"

# Ensure we are in the project root
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

echo "🚀 Starting FastAPI/React bundle-based deployment to $REMOTE_HOST..."
echo "📂 Project Root: $PROJECT_ROOT"

# 0. Validate backend sudo usage and sudoers syntax before bundling
echo "🔐 Auditing backend sudo calls..."
python3 scripts/audit/audit_sudo_calls.py
if command -v visudo >/dev/null 2>&1; then
    echo "🔐 Validating sudoers syntax..."
    visudo -cf backend/config/mailadmin_sudoers
else
    echo "⚠️  visudo not found locally; remote validation will still run before install."
fi

# 1. Build frontend React production assets
echo "🏗️  Building React frontend locally..."
cd "$PROJECT_ROOT/frontend"
npm run build
cd "$PROJECT_ROOT"

# 2. Create zstd bundle locally containing backend, built frontend, and configuration
echo "📦 Creating zstd bundle..."
tar --zstd -cf "$LOCAL_BUNDLE" -C "$PROJECT_ROOT" \
    --exclude='backend/venv' \
    --exclude='backend/__pycache__' \
    --exclude='frontend/node_modules' \
    --exclude='frontend/src' \
    --exclude='.git' \
    backend frontend/dist scripts

BUNDLE_SIZE=$(du -h "$LOCAL_BUNDLE" | cut -f1)
echo "   Bundle created: $BUNDLE_SIZE"

# 3. Transfer bundle to server
echo "📤 Transferring bundle to server..."
scp "$LOCAL_BUNDLE" "$REMOTE_USER@$REMOTE_HOST:/tmp/"

# 4. Remote extraction, environment setup, and systemd service migration
echo "🛠️  Configuring environment and starting migration on remote..."
ssh -t "$REMOTE_USER@$REMOTE_HOST" << EOF
    set -e

    echo "Stopping existing mail-admin service..."
    sudo systemctl stop mail-admin || true

    # Extract to temp location
    echo "Extracting bundle..."
    rm -rf /tmp/mail_admin_new
    mkdir -p /tmp/mail_admin_new
    tar --zstd -xf /tmp/mail_admin_bundle.tar.zst -C /tmp/mail_admin_new/

    # Preserve virtualenv if it exists
    if [ -d "/opt/mail_admin/venv" ]; then
        echo "Preserving existing virtualenv..."
        sudo cp -a /opt/mail_admin/venv /tmp/mail_admin_new/
    fi

    # Preserve .env if it exists
    if [ -f "/opt/mail_admin/.env" ]; then
        echo "Preserving existing .env..."
        sudo cp /opt/mail_admin/.env /tmp/mail_admin_new/
    fi

    # Atomic swap: old -> backup, new -> active
    echo "Performing atomic swap..."
    sudo rm -rf /opt/mail_admin_old
    if [ -d "/opt/mail_admin" ]; then
        sudo mv /opt/mail_admin /opt/mail_admin_old
    fi
    sudo mv /tmp/mail_admin_new /opt/mail_admin
    sudo chown -R $SERVICE_USER:$SERVICE_USER /opt/mail_admin

    # Secure .env
    if [ -f "/opt/mail_admin/.env" ]; then
        sudo chmod 600 /opt/mail_admin/.env
        sudo chown $SERVICE_USER:$SERVICE_USER /opt/mail_admin/.env
    fi

    cd /opt/mail_admin

    # Install Python backend dependencies in virtualenv
    if [ -f "backend/requirements.txt" ]; then
        echo "Installing Python dependencies..."
        # If virtualenv doesn't exist, create it
        if [ ! -d "venv" ]; then
            sudo -u $SERVICE_USER python3 -m venv venv
        fi
        sudo -u $SERVICE_USER ./venv/bin/python3 -m pip install --upgrade pip
        sudo -u $SERVICE_USER ./venv/bin/python3 -m pip install -r backend/requirements.txt
    else
        echo "⚠️  backend/requirements.txt not found!"
    fi

    # Apply Sudoers Configuration
    if [ -f "backend/config/mailadmin_sudoers" ]; then
        echo "Validating sudoers configuration for $SERVICE_USER..."
        sudo visudo -cf backend/config/mailadmin_sudoers
        echo "Applying sudoers configuration for $SERVICE_USER..."
        sudo cp backend/config/mailadmin_sudoers /etc/sudoers.d/mailadmin
        sudo chmod 440 /etc/sudoers.d/mailadmin
        sudo chown root:root /etc/sudoers.d/mailadmin
        sudo visudo -cf /etc/sudoers.d/mailadmin
    fi

    # Apply SSH Geo Check script
    if [ -f "scripts/security/ssh-geo-check.py" ]; then
        echo "Installing SSH GeoIP Check hook..."
        sudo cp scripts/security/ssh-geo-check.py /usr/local/bin/ssh-geo-check.py
        sudo chmod 755 /usr/local/bin/ssh-geo-check.py
        sudo chown root:root /usr/local/bin/ssh-geo-check.py
    fi

    # Migrate Systemd service configuration to Uvicorn (FastAPI)
    echo "Updating systemd service for FastAPI (Uvicorn)..."
    sudo tee /etc/systemd/system/mail-admin.service > /dev/null << 'SERVICE_EOF'
[Unit]
Description=Uvicorn instance to serve FastAPI Mail Admin Platform
After=network.target

[Service]
User=mailadmin
Group=mailadmin
WorkingDirectory=/opt/mail_admin
Environment="PATH=/opt/mail_admin/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
EnvironmentFile=/opt/mail_admin/.env
ExecStart=/opt/mail_admin/venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 3

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    sudo systemctl daemon-reload
    echo "Starting mail-admin service..."
    sudo systemctl start mail-admin

    # Quick health check
    sleep 3
    if sudo systemctl is-active --quiet mail-admin; then
        echo "✅ FastAPI service is running successfully!"
    else
        echo "❌ FastAPI service failed to start. Check logs: sudo journalctl -u mail-admin -n 100"
        exit 1
    fi

    # Cleanup remote bundle
    rm /tmp/mail_admin_bundle.tar.zst
    echo "✅ Remote deployment complete!"
EOF

# Cleanup local bundle
rm "$LOCAL_BUNDLE"

echo ""
echo "🎉 FastAPI & React deployment finished successfully!"
echo "📍 Access your app at: https://admin.zimprices.co.zw"
