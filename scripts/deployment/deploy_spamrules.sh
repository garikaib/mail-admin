#!/bin/bash
# deploy_spamrules.sh - Deploy Rspamd spam rules and custom rules to remote server
# Usage: ./scripts/deployment/deploy_spamrules.sh (from root)

set -euo pipefail

REMOTE_USER="ubuntu"
REMOTE_HOST="51.77.222.232"
LOCAL_TMP_DIR="/tmp/spamrules_deploy"
TARBALL="/tmp/spamrules_deploy.tar.gz"

# Ensure we are in project root
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

echo "🚀 Preparing Rspamd rules deployment..."

# 1. Clean and recreate local temporary directory
rm -rf "$LOCAL_TMP_DIR"
mkdir -p "$LOCAL_TMP_DIR/local.d"

# 2. Copy spam rules configs from spamrules/local.d
if [ -d "spamrules/local.d" ]; then
    echo "📋 Copying spamrules configurations..."
    cp -r spamrules/local.d/* "$LOCAL_TMP_DIR/local.d/"
else
    echo "❌ Error: spamrules/local.d directory not found."
    exit 1
fi

# 3. Overlay local Rspamd customizations that must travel with the spam rules.
echo "📋 Copying local Rspamd customizations..."
install -m 0644 configs/rspamd/multimap.conf "$LOCAL_TMP_DIR/local.d/multimap.conf"
install -m 0644 configs/rspamd/multimap.custom.conf "$LOCAL_TMP_DIR/local.d/multimap.custom.conf"
install -m 0644 configs/rspamd/groups.conf "$LOCAL_TMP_DIR/local.d/groups.conf"
install -m 0644 configs/rspamd/milter_headers.conf "$LOCAL_TMP_DIR/local.d/milter_headers.conf"
install -m 0644 configs/rspamd/local_bl_from.map.inc "$LOCAL_TMP_DIR/local.d/local_bl_from.map.inc"
install -m 0644 configs/rspamd/rspamd.local.lua "$LOCAL_TMP_DIR/rspamd.local.lua"

mkdir -p "$LOCAL_TMP_DIR/local.d/maps.d"
cp -r configs/rspamd/maps.d/* "$LOCAL_TMP_DIR/local.d/maps.d/"

# 4. Create tarball of all configs
echo "📦 Packaging configuration files..."
tar -czf "$TARBALL" -C "$LOCAL_TMP_DIR" .

# 5. Upload tarball to remote server
echo "📤 Uploading package to remote server $REMOTE_HOST..."
scp "$TARBALL" "$REMOTE_USER@$REMOTE_HOST:/tmp/spamrules_deploy.tar.gz"

# 6. Extract and install on remote server
echo "🛠️ Installing configurations on remote server..."
ssh -t "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    set -euo pipefail

    REMOTE_TMP_DIR="/tmp/spamrules_deploy_remote"
    rm -rf "$REMOTE_TMP_DIR"
    mkdir -p "$REMOTE_TMP_DIR"

    # Extract tarball
    tar -xzf /tmp/spamrules_deploy.tar.gz -C "$REMOTE_TMP_DIR"

    echo "📋 Copying files to /etc/rspamd/..."
    sudo mkdir -p /etc/rspamd/local.d/maps.d
    sudo cp -r "$REMOTE_TMP_DIR/local.d"/* /etc/rspamd/local.d/
    sudo install -m 0644 "$REMOTE_TMP_DIR/rspamd.local.lua" /etc/rspamd/rspamd.local.lua
    sudo chown -R root:root /etc/rspamd/local.d /etc/rspamd/rspamd.local.lua
    sudo find /etc/rspamd/local.d -type f \( -name "*.conf" -o -name "*.inc" -o -name "*.map" \) -exec chmod 0644 {} +
    sudo chmod 0644 /etc/rspamd/rspamd.local.lua

    sudo touch /var/lib/rspamd/auto_phish_domains.map
    sudo chown _rspamd:_rspamd /var/lib/rspamd/auto_phish_domains.map
    sudo chmod 0640 /var/lib/rspamd/auto_phish_domains.map

    # Validate configuration syntax
    echo "🔍 Validating Rspamd configuration syntax..."
    if sudo rspamadm configtest; then
        echo "✅ Rspamd syntax is OK! Restarting Rspamd..."
        sudo systemctl restart rspamd
        
        # Verify status
        sleep 2
        if sudo systemctl is-active --quiet rspamd; then
            echo "✅ Rspamd service restarted and running successfully!"
        else
            echo "❌ Rspamd service failed to start. Check status/logs."
            exit 1
        fi
    else
        echo "❌ Rspamd configuration test failed! Reverting is recommended if service breaks."
        exit 1
    fi

    # Cleanup remote tmp
    rm -rf "$REMOTE_TMP_DIR"
    rm -f /tmp/spamrules_deploy.tar.gz
EOF

# 7. Cleanup local tmp files
rm -rf "$LOCAL_TMP_DIR"
rm -f "$TARBALL"

echo "🎉 Deployment of spam rules completed successfully!"
