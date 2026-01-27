#!/bin/bash
# Update UFW with latest Cloudflare IP ranges
# This script is intended to be run daily via cron

set -e

echo "Fetching latest Cloudflare IP ranges..."
CF_IPV4=$(curl -s https://www.cloudflare.com/ips-v4)
CF_IPV6=$(curl -s https://www.cloudflare.com/ips-v6)

if [ -z "$CF_IPV4" ] || [ -z "$CF_IPV6" ]; then
    echo "Error: Could not fetch Cloudflare IPs. Aborting update."
    exit 1
fi

echo "Deleting existing Cloudflare rules from UFW..."
# Get rule numbers for rules with comment 'Cloudflare'
# We delete in reverse order to keep rule numbers consistent during deletion
RULES=$(sudo ufw status numbered | grep 'Cloudflare' | awk -F"[][]" '{print $2}' | sort -rn)

for rule in $RULES; do
    echo "Deleting rule $rule..."
    sudo ufw --force delete $rule
done

echo "Adding updated Cloudflare IPv4 ranges..."
for ip in $CF_IPV4; do
    sudo ufw allow from "$ip" to any port 443 proto tcp comment 'Cloudflare IPv4'
done

echo "Adding updated Cloudflare IPv6 ranges..."
for ip in $CF_IPV6; do
    sudo ufw allow from "$ip" to any port 443 proto tcp comment 'Cloudflare IPv6'
done

echo "Cloudflare IP update complete."
sudo ufw status numbered | grep 'Cloudflare'
