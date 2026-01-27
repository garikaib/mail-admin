#!/bin/bash
# Mail Admin Wrapper Script
# Runs the Python admin tool on the remote mail server

SERVER="ubuntu@51.77.222.232"
SCRIPT_NAME="mail_admin.py"
LOCAL_SCRIPT="/home/garikaib/Documents/zimprices_email/mail_admin.py"
REMOTE_SCRIPT="/home/ubuntu/mail_admin.py"

echo "╔══════════════════════════════════════════════════════╗"
echo "║       Mail Server Admin - zimprices.co.zw           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Sync latest script to server
echo "Syncing admin script to server..."
scp -q "$LOCAL_SCRIPT" "$SERVER:$REMOTE_SCRIPT"

if [ $? -ne 0 ]; then
    echo "❌ Failed to sync script to server."
    exit 1
fi

# Run the script on the server with sudo (needed for maildir creation)
echo "Launching admin tool..."
echo ""
ssh -t "$SERVER" "sudo python3 $REMOTE_SCRIPT"
