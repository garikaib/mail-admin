#!/bin/bash
# Install and Configure Fail2Ban (SSH and Mail only)
set -e

echo "Installing Fail2Ban..."
sudo apt update
sudo apt install -y fail2ban

echo "Configuring Fail2Ban local settings..."
# Create jail.local - we use systemd backend for Ubuntu 24.04
sudo tee /etc/fail2ban/jail.local > /dev/null <<EOF
[DEFAULT]
bantime  = 1h
findtime = 15m
maxretry = 5
backend = systemd
# Ignore local traffic
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port    = ssh

[postfix]
enabled = true
port    = smtp,587,465

[dovecot]
enabled = true
port    = pop3,pop3s,imap,imaps,submission,sieve
EOF

echo "Enabling and starting Fail2Ban..."
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

echo "Checking Fail2Ban status..."
sudo fail2ban-client status
sudo fail2ban-client status sshd
sudo fail2ban-client status postfix
sudo fail2ban-client status dovecot

echo "Fail2Ban setup for direct services complete."
