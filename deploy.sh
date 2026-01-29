#!/bin/bash
# deploy.sh - Fast, bundle-based deployment
# Usage: ./deploy.sh
#
# This script handles routine code deployments. For initial server setup
# or infrastructure changes, run ./setup_server.sh instead.

set -e

# Configuration
REMOTE_USER="ubuntu"
REMOTE_HOST="51.77.222.232"
REMOTE_DIR="/opt/mail_admin"
BUNDLE_NAME="mail_admin_bundle.tar.zst"
LOCAL_BUNDLE="/tmp/$BUNDLE_NAME"

echo "🚀 Starting bundle-based deployment to $REMOTE_HOST..."

# Precondition: .env must exist
if [ ! -f "mail_admin/.env" ]; then
    echo "❌ Error: mail_admin/.env file not found!"
    echo "Please create mail_admin/.env with your secrets before deploying."
    exit 1
fi

# 1. Create zstd bundle locally
echo "📦 Creating zstd bundle..."
tar --zstd -cf "$LOCAL_BUNDLE" -C . \
    --exclude='venv' \
    --exclude='__pycache__' \
    --exclude='.git' \
    --exclude='*.pyc' \
    --exclude='db.sqlite3' \
    mail_admin

BUNDLE_SIZE=$(du -h "$LOCAL_BUNDLE" | cut -f1)
echo "   Bundle created: $BUNDLE_SIZE"

# 2. Transfer bundle to server
echo "📤 Transferring bundle to server..."
scp "$LOCAL_BUNDLE" "$REMOTE_USER@$REMOTE_HOST:/tmp/"

# 3. Remote extraction and service restart
echo "🛠️  Extracting bundle and restarting service..."
ssh -t "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    set -e

    echo "Stopping service..."
    sudo systemctl stop mail-admin || true

    # Extract to temp location
    echo "Extracting bundle..."
    rm -rf /tmp/mail_admin_new
    tar --zstd -xf /tmp/mail_admin_bundle.tar.zst -C /tmp/
    mv /tmp/mail_admin /tmp/mail_admin_new

    # Preserve venv (if it exists)
    if [ -d "/opt/mail_admin/venv" ]; then
        echo "Preserving existing virtualenv..."
        cp -a /opt/mail_admin/venv /tmp/mail_admin_new/
    fi

    # Preserve .env (if it exists on server and not in bundle)
    if [ -f "/opt/mail_admin/.env" ] && [ ! -f "/tmp/mail_admin_new/.env" ]; then
        echo "Preserving existing .env..."
        cp /opt/mail_admin/.env /tmp/mail_admin_new/
    fi

    # Atomic swap: old -> backup, new -> active
    echo "Performing atomic swap..."
    sudo rm -rf /opt/mail_admin_old
    if [ -d "/opt/mail_admin" ]; then
        sudo mv /opt/mail_admin /opt/mail_admin_old
    fi
    sudo mv /tmp/mail_admin_new /opt/mail_admin
    sudo chown -R ubuntu:ubuntu /opt/mail_admin

    # Secure .env
    if [ -f "/opt/mail_admin/.env" ]; then
        chmod 600 /opt/mail_admin/.env
    fi

    # Run migrations
    echo "Running migrations..."
    cd /opt/mail_admin
    ./venv/bin/python3 manage.py migrate --noinput

    # Collect static files
    echo "Collecting static files..."
    mkdir -p static/css
    ./venv/bin/python3 manage.py collectstatic --noinput

    # Start service
    echo "Starting service..."
    sudo systemctl start mail-admin

    # Quick health check
    sleep 2
    if sudo systemctl is-active --quiet mail-admin; then
        echo "✅ Service is running!"
    else
        echo "❌ Service failed to start. Check logs with: sudo journalctl -u mail-admin -n 50"
        exit 1
    fi

    # Cleanup
    rm /tmp/mail_admin_bundle.tar.zst
    echo "✅ Remote deployment complete!"
EOF

# Cleanup local bundle
rm "$LOCAL_BUNDLE"

echo ""
echo "🎉 Deployment finished successfully!"
echo "📍 Access your app at: https://admin.zimprices.co.zw"
