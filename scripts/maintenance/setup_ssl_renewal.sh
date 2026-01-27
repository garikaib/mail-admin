#!/bin/bash
# Setup SSL Auto-renewal Cron Job
set -e

echo "Creating SSL renewal script..."

# Define sensitive variables clearly
CF_EMAIL="gbdzoma@gmail.com"
CF_API_KEY="c387a52124c3ece44c4c4e36a2964a152e86a"

sudo tee /usr/local/bin/renew_ssl.sh > /dev/null <<EOF
#!/bin/bash
# Renew certificates with Lego
export CLOUDFLARE_EMAIL="$CF_EMAIL"
export CLOUDFLARE_API_KEY="$CF_API_KEY"

# Renew domains
/usr/local/bin/lego --email "$CF_EMAIL" --dns cloudflare --domains "zimprices.co.zw" --domains "*.zimprices.co.zw" --path /etc/lego renew --days 30

# Reload services to pick up new certificates
systemctl reload nginx
systemctl reload postfix
systemctl reload dovecot
EOF

sudo chmod +x /usr/local/bin/renew_ssl.sh

echo "Setting up Cron job (runs weekly on Sunday at 3 AM)..."
# Create a cron file in /etc/cron.d/
sudo tee /etc/cron.d/lego-renewal > /dev/null <<EOF
0 3 * * 0 root /usr/local/bin/renew_ssl.sh >> /var/log/ssl_renewal.log 2>&1
EOF

echo "SSL auto-renewal setup complete."
echo "Renewal script: /usr/local/bin/renew_ssl.sh"
echo "Cron job: /etc/cron.d/lego-renewal"
