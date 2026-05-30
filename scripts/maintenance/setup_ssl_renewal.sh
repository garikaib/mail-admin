#!/bin/bash
# Setup SSL Auto-renewal Cron Job
set -e

echo "Creating SSL renewal script..."

# Define Cloudflare Accounts
CF_GBDZOMA_EMAIL="gbdzoma@gmail.com"
CF_GBDZOMA_KEY="c387a52124c3ece44c4c4e36a2964a152e86a"

CF_GARIKAIB_EMAIL="garikaib@gmail.com"
CF_GARIKAIB_KEY="5f2e114ea312d7fe910251b60f62e43ff892f"

sudo tee /usr/local/bin/renew_ssl.sh > /dev/null <<EOF
#!/bin/bash
# Renew certificates with Lego
set -e

# Lego registration email. Set SSL_CONTACT_EMAIL in the environment before running.
LEGO_EMAIL="\${SSL_CONTACT_EMAIL:?SSL_CONTACT_EMAIL is required}"

# Account 1: gbdzoma@gmail.com
export CLOUDFLARE_EMAIL="$CF_GBDZOMA_EMAIL"
export CLOUDFLARE_API_KEY="$CF_GBDZOMA_KEY"

DOMAINS_GBDZOMA=(
    "zimprices.co.zw"
    "chadzi.co.zw"
    "honeyscoop.co.zw"
    "hygienemax.co.zw"
    "rotvim.co.zw"
    "growzimcapital.co.zw"
)

for dom in "\${DOMAINS_GBDZOMA[@]}"; do
    echo "Renewing \$dom..."
    /usr/local/bin/lego --email "\$LEGO_EMAIL" --dns cloudflare --domains "\$dom" --domains "*.\$dom" --path /etc/lego renew --days 30 --no-random-sleep || echo "Failed to renew \$dom"
done

# Account 2: garikaib@gmail.com
export CLOUDFLARE_EMAIL="$CF_GARIKAIB_EMAIL"
export CLOUDFLARE_API_KEY="$CF_GARIKAIB_KEY"

DOMAINS_GARIKAIB=(
    "zimpricecheck.com"
    "chaspers.co.zw"
    "crystalcred.co.zw"
    "hydrodrilling.co.zw"
)

for dom in "\${DOMAINS_GARIKAIB[@]}"; do
    echo "Renewing \$dom..."
    /usr/local/bin/lego --email "\$LEGO_EMAIL" --dns cloudflare --domains "\$dom" --domains "*.\$dom" --path /etc/lego renew --days 30 --no-random-sleep || echo "Failed to renew \$dom"
done

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
