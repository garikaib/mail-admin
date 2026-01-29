#!/bin/bash
# setup_server.sh - One-time server provisioning
# Usage: ./setup_server.sh
#
# Run this script ONLY for initial server setup or after major infrastructure changes.
# For routine code deployments, use ./deploy.sh instead.

set -e

REMOTE_USER="ubuntu"
REMOTE_HOST="51.77.222.232"

echo "🔧 Starting server provisioning on $REMOTE_HOST..."
echo "⚠️  This script should only run ONCE for initial setup."
read -p "Continue? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

ssh -t "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    set -e

    echo "=========================================="
    echo "1. Installing System Dependencies"
    echo "=========================================="
    sudo apt-get update -qq
    sudo apt-get upgrade -y -qq
    sudo apt-get install -y -qq \
        python3-venv \
        python3-dev \
        libmysqlclient-dev \
        zstd \
        build-essential \
        nginx \
        certbot \
        python3-certbot-nginx

    echo "=========================================="
    echo "2. Creating Application Directory"
    echo "=========================================="
    sudo mkdir -p /opt/mail_admin
    sudo chown ubuntu:ubuntu /opt/mail_admin

    echo "=========================================="
    echo "3. Setting up Python Virtual Environment"
    echo "=========================================="
    cd /opt/mail_admin

    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi

    echo "Installing Python dependencies..."
    ./venv/bin/python3 -m pip install -q --upgrade pip
    ./venv/bin/python3 -m pip install -q \
        django \
        django-htmx \
        django-compressor \
        passlib[sha512] \
        pymysql \
        gunicorn \
        requests \
        psutil

    echo "=========================================="
    echo "4. Configuring Systemd Service"
    echo "=========================================="
    cat << 'SERVICE_CONF' | sudo tee /etc/systemd/system/mail-admin.service
[Unit]
Description=Gunicorn instance to serve Mail Admin Platform
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/mail_admin
Environment="PATH=/opt/mail_admin/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
EnvironmentFile=/opt/mail_admin/.env
ExecStart=/opt/mail_admin/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 config.wsgi:application

[Install]
WantedBy=multi-user.target
SERVICE_CONF

    sudo systemctl daemon-reload
    sudo systemctl enable mail-admin

    echo "=========================================="
    echo "5. Configuring Dovecot Quotas"
    echo "=========================================="
    # Ensure quota kb is in user query
    SQL_CONF="/etc/dovecot/dovecot-sql.conf.ext"
    if [ -f "$SQL_CONF" ]; then
        sudo sed -i "s/user_query = SELECT mail as user, '\\/var\\/vmail\\/%d\\/%n' as home, 5000 as uid, 5000 as gid FROM users WHERE mail='%u';/user_query = SELECT mail as user, '\\/var\\/vmail\\/%d\\/%n' as home, 5000 as uid, 5000 as gid, concat('*:storage=', quota_kb) as quota_rule FROM users WHERE mail='%u';/" $SQL_CONF || true
    fi

    # Enable global quota plugin
    MAIL_CONF="/etc/dovecot/conf.d/10-mail.conf"
    if [ -f "$MAIL_CONF" ] && ! sudo grep -q "mail_plugins =.*quota" $MAIL_CONF; then
        sudo sed -i "s/#mail_plugins =/mail_plugins = quota/" $MAIL_CONF || echo "mail_plugins = \$mail_plugins quota" | sudo tee -a $MAIL_CONF
    fi

    # Fix 90-quota.conf driver
    cat << 'QUOTA_EOF' | sudo tee /etc/dovecot/conf.d/90-quota.conf
plugin {
  quota = maildir:User quota
  quota_rule = *:storage=1G
  quota_grace = 10%
  quota_status_success = yes
  quota_status_nofree = quota-exceeded
}
QUOTA_EOF

    sudo systemctl restart dovecot || true

    echo "=========================================="
    echo "6. Hardening Postfix"
    echo "=========================================="
    if [ -f "/opt/mail_admin/scripts/maintenance/harden_postfix.sh" ]; then
        sudo bash /opt/mail_admin/scripts/maintenance/harden_postfix.sh
    else
        echo "⚠️  harden_postfix.sh not found. Run deploy.sh first, then re-run this script."
    fi

    echo "=========================================="
    echo "7. Configuring Mail Monitoring Cron"
    echo "=========================================="
    CRON_JOB="0 * * * * cd /opt/mail_admin && /opt/mail_admin/venv/bin/python3 mail_monitor.py >> /var/log/mail_monitor.log 2>&1"
    (sudo crontab -l 2>/dev/null | grep -v "mail_monitor.py"; echo "$CRON_JOB") | sudo crontab -

    echo "=========================================="
    echo "8. Configuring Sudoers for Platform Operations"
    echo "=========================================="
    cat << 'SUDOERS' | sudo tee /etc/sudoers.d/mail-admin
# Mail Admin Platform - Restricted Commands
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/mkdir -p /var/vmail/*
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/chown -R vmail\:vmail /var/vmail/*
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/rm -rf /var/vmail/*
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u mail-admin *
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/tail -n * /var/log/mail.log
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/tail -n * /var/log/nginx/error.log
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/systemctl is-active *
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop mail-admin
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/systemctl start mail-admin
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart mail-admin
ubuntu ALL=(ALL) NOPASSWD: /usr/sbin/doveadm reload
ubuntu ALL=(ALL) NOPASSWD: /opt/mail_admin/venv/bin/python3 /opt/mail_admin/mail_monitor.py
SUDOERS
    sudo chmod 0440 /etc/sudoers.d/mail-admin

    echo ""
    echo "=========================================="
    echo "✅ Server provisioning complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Upload your .env file to /opt/mail_admin/.env"
    echo "2. Run ./deploy.sh to deploy your application code"
    echo "3. Configure Nginx and SSL certificates"
EOF

echo ""
echo "🎉 Server provisioning script finished!"
