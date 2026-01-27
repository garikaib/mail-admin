#!/bin/bash
# Setup Daily Cron Job for Cloudflare IP updates
set -e

echo "Installing update script to /usr/local/bin/update_ufw_cloudflare.sh..."
sudo cp /home/ubuntu/update_ufw_cloudflare.sh /usr/local/bin/update_ufw_cloudflare.sh
sudo chmod +x /usr/local/bin/update_ufw_cloudflare.sh

echo "Setting up Daily Cron job (runs at 4:30 AM)..."
# Create a cron file in /etc/cron.d/
sudo tee /etc/cron.d/ufw-cloudflare-sync > /dev/null <<EOF
30 4 * * * root /usr/local/bin/update_ufw_cloudflare.sh >> /var/log/ufw_cf_sync.log 2>&1
EOF

echo "Testing the update script..."
sudo /usr/local/bin/update_ufw_cloudflare.sh

echo "Automated UFW sync for Cloudflare setup complete."
