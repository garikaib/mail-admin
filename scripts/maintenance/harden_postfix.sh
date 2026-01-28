#!/bin/bash
# Harden Postfix Configuration
set -e

echo "Hardening Postfix restrictions..."

# Basic restrictions and relay protection
sudo postconf -e 'smtpd_helo_required = yes'
sudo postconf -e 'strict_rfc821_envelopes = yes'
sudo postconf -e 'disable_vrfy_command = yes'

# HELO restrictions
sudo postconf -e 'smtpd_helo_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_invalid_helo_hostname, reject_non_fqdn_helo_hostname'

# Configure sender login maps for spoofing protection
sudo postconf -e 'smtpd_sender_login_maps = mysql:/etc/postfix/mysql-virtual-mailbox-maps.cf, mysql:/etc/postfix/mysql-virtual-alias-maps.cf'

# Sender restrictions
# Added reject_sender_login_mismatch to prevent spoofing
sudo postconf -e 'smtpd_sender_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_sender_login_mismatch, reject_non_fqdn_sender, reject_unknown_sender_domain'

# Recipient restrictions (The core relay protection)
sudo postconf -e 'smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination, reject_unlisted_recipient, reject_non_fqdn_recipient'

# Relay restrictions
sudo postconf -e 'smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, defer_unauth_destination'

# Modern TLS settings
sudo postconf -e 'smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1'
sudo postconf -e 'smtpd_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1'
sudo postconf -e 'smtpd_tls_ciphers = high'
sudo postconf -e 'smtpd_tls_mandatory_ciphers = high'
sudo postconf -e 'tls_high_cipherlist = ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384'

echo "Restarting Postfix..."
sudo systemctl restart postfix

echo "Postfix hardening complete."
