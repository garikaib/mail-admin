#!/bin/bash
# deploy.sh - Consolidated deployment script
# Usage: ./deploy.sh

set -e

# Configuration
REMOTE_USER="ubuntu"
REMOTE_HOST="51.77.222.232"
REMOTE_PROJECT_DIR="/opt/mail_admin"
STAGING_DIR="~/mail_admin_staging"
DOMAIN="admin.zimprices.co.zw"

echo "🚀 Starting deployment to $REMOTE_HOST..."

# 1. Sync files to remote staging
echo "📦 Syncing files to remote staging..."
ssh $REMOTE_USER@$REMOTE_HOST "mkdir -p $STAGING_DIR"
rsync -avz --exclude 'venv' --exclude '__pycache__' --exclude 'db.sqlite3' ./mail_admin/ ./scripts $REMOTE_USER@$REMOTE_HOST:$STAGING_DIR/

# 2. Remote Execution Block
echo "🛠️  Running remote setup (using passwordless sudo)..."
ssh -t $REMOTE_USER@$REMOTE_HOST << 'EOF'
    set -e
    
    # --- Setup Django App ---
    echo "🏗️ Setting up Django environment in /opt/mail_admin..."
    sudo mkdir -p /opt/mail_admin
    sudo chown ubuntu:ubuntu /opt/mail_admin
    
    # Sync from staging to /opt/
    rsync -av ~/mail_admin_staging/ /opt/mail_admin/
    cd /opt/mail_admin
    
    # System dependencies
    sudo apt-get update -qq
    sudo apt-get upgrade -y -qq
    sudo apt-get install -y -qq python3-venv python3-dev libmysqlclient-dev zstd build-essential nginx

    # Virtual environment
    # Robustness check: if venv exists but is broken, delete it
    if [ -d "venv" ]; then
        if ! ./venv/bin/python3 -c "import sys" >/dev/null 2>&1; then
            echo "⚠️  Detected broken venv, recreating..."
            rm -rf venv
        fi
    fi

    if [ ! -d "venv" ]; then
        echo "🐍 Creating virtual environment..."
        python3 -m venv venv
    fi
    
    echo "python dependencies..."
    ./venv/bin/python3 -m pip install -q --upgrade pip
    # Install dependencies
    ./venv/bin/python3 -m pip install django django-htmx django-compressor passlib[sha512] pymysql gunicorn requests psutil

    # Migrations & Static
    echo "Migrations..."
    /opt/mail_admin/venv/bin/python3 manage.py makemigrations core --noinput
    /opt/mail_admin/venv/bin/python3 manage.py migrate --noinput
    
    # DB Schema Update (for monitoring)
    if [ -f "scripts/update_db_schema.py" ]; then
        echo "Running DB Schema Update..."
        /opt/mail_admin/venv/bin/python3 scripts/update_db_schema.py
    fi
    
    # Ensure static src exists before collectstatic
    mkdir -p static/src
    touch static/src/output.css

    echo "Static files..."
    /opt/mail_admin/venv/bin/python3 manage.py collectstatic --noinput

    # --- Systemd Service ---
    echo "⚙️ Setting up Systemd service..."
    cat << SERVICE_CONF | sudo tee /etc/systemd/system/mail-admin.service
[Unit]
Description=Gunicorn instance to serve Mail Admin Platform
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/mail_admin
Environment="PATH=/opt/mail_admin/venv/bin"
ExecStart=/opt/mail_admin/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 config.wsgi:application

[Install]
WantedBy=multi-user.target
SERVICE_CONF

    sudo systemctl daemon-reload
    sudo systemctl enable mail-admin
    sudo systemctl restart mail-admin

    # --- Dovecot Quota Alignment ---
    echo "🐦 Aligning Dovecot Quotas..."
    # Ensure quota kb is in user query
    SQL_CONF="/etc/dovecot/dovecot-sql.conf.ext"
    sudo sed -i "s/user_query = SELECT mail as user, '\/var\/vmail\/%d\/%n' as home, 5000 as uid, 5000 as gid FROM users WHERE mail='%u';/user_query = SELECT mail as user, '\/var\/vmail\/%d\/%n' as home, 5000 as uid, 5000 as gid, concat('*:storage=', quota_kb) as quota_rule FROM users WHERE mail='%u';/" $SQL_CONF

    # Enable global quota plugin
    MAIL_CONF="/etc/dovecot/conf.d/10-mail.conf"
    if ! sudo grep -q "mail_plugins =.*quota" $MAIL_CONF; then
        sudo sed -i "s/#mail_plugins =/mail_plugins = quota/" $MAIL_CONF || echo "mail_plugins = \$mail_plugins quota" | sudo tee -a $MAIL_CONF
    fi

    # Fix 90-quota.conf driver
    cat <<'QUOTA_EOF' | sudo tee /etc/dovecot/conf.d/90-quota.conf
plugin {
  quota = maildir:User quota
  quota_rule = *:storage=1G
  quota_grace = 10%
  quota_status_success = yes
  quota_status_nofree = quota-exceeded
}
QUOTA_EOF

    sudo systemctl restart dovecot
    sudo systemctl restart postfix

    # --- Monitoring Setup ---
    echo "📊 Setting up Mail Monitoring..."
    source venv/bin/activate
    # Run once to initialize stats
    sudo /opt/mail_admin/venv/bin/python3 /opt/mail_admin/mail_monitor.py || true
    
    # Setup cron job (runs every hour)
    CRON_JOB="0 * * * * cd /opt/mail_admin && /opt/mail_admin/venv/bin/python3 mail_monitor.py >> /var/log/mail_monitor.log 2>&1"
    (sudo crontab -l 2>/dev/null | grep -v "mail_monitor.py"; echo "$CRON_JOB") | sudo crontab -

    # --- Sudoers for Log Reading ---
    echo "🔑 Configuring log reading permissions..."
    cat <<SUDO_CONF | sudo tee /etc/sudoers.d/mail-admin
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/tail -n [0-9]* /var/log/mail.log
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/tail -n [0-9]* /var/log/nginx/error.log
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u mail-admin -n [0-9]* --no-pager
ubuntu ALL=(ALL) NOPASSWD: /usr/sbin/doveadm reload
SUDO_CONF
    sudo chmod 0440 /etc/sudoers.d/mail-admin

    echo "✅ Remote setup complete!"
EOF

echo "🎉 Deployment finished successfully!"
echo "📍 Access your app at: http://admin.zimprices.co.zw"
