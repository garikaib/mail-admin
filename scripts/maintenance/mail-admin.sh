#!/bin/bash
# Mail Admin Wrapper Script
# Runs the Python admin tool on the remote mail server

SERVER="ubuntu@51.77.222.232"
SERVICE_USER="mailadmin"
SCRIPT_NAME="mail_admin.py"
LOCAL_SCRIPT="/home/garikaib/Documents/zimprices_email/scripts/core/mail_admin.py"
REMOTE_SCRIPT="/opt/mail_admin/scripts/core/mail_admin.py"

echo "╔══════════════════════════════════════════════════════╗"
echo "║       Mail Server Admin - zimprices.co.zw           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Sync latest script to server (using sudo to write to /opt)
echo "Syncing admin script to server..."
scp -q "$LOCAL_SCRIPT" "$SERVER:/tmp/$SCRIPT_NAME"
ssh -t "$SERVER" "sudo mv /tmp/$SCRIPT_NAME $REMOTE_SCRIPT && sudo chown $SERVICE_USER:$SERVICE_USER $REMOTE_SCRIPT"

if [ $? -ne 0 ]; then
    echo "❌ Failed to sync script to server."
    exit 1
fi

# Run the script on the server as mailadmin using whitelisted python3 path
echo "Launching admin tool..."
echo ""
ssh -t "$SERVER" "sudo -u $SERVICE_USER /opt/mail_admin/venv/bin/python3 $REMOTE_SCRIPT"
