#!/bin/bash
# Configure UFW for Cloudflare Proxy
set -e

echo "Adding Cloudflare IPv4 address ranges to UFW..."
for ip in $(curl -s https://www.cloudflare.com/ips-v4); do
    sudo ufw allow from "$ip" to any port 443 proto tcp comment 'Cloudflare IPv4'
done

echo "Adding Cloudflare IPv6 address ranges to UFW..."
for ip in $(curl -s https://www.cloudflare.com/ips-v6); do
    sudo ufw allow from "$ip" to any port 443 proto tcp comment 'Cloudflare IPv6'
done

echo "Configuring standard mail ports..."
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 25/tcp      # SMTP
sudo ufw allow 587/tcp     # Submission
sudo ufw allow 465/tcp     # SMTPS
sudo ufw allow 993/tcp     # IMAPS
sudo ufw allow 143/tcp     # IMAP
sudo ufw allow 80/tcp      # HTTP (for redirects/Lego)

echo "Setting default policies..."
sudo ufw default deny incoming
sudo ufw default allow outgoing

echo "Enabling UFW..."
# --force to prevent interactive prompt
sudo ufw --force enable

echo "UFW Status:"
sudo ufw status numbered
