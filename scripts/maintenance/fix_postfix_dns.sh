#!/bin/bash
# Fix Postfix DNS lookup in chroot

# 1. Update master.cf to disable chroot for smtp/smtpd temporarily to rule it out
# Or better, copy resolv.conf to chroot properly
echo "Updating chroot DNS files..."
sudo cp /etc/resolv.conf /var/spool/postfix/etc/resolv.conf
sudo cp /etc/services /var/spool/postfix/etc/services

# Ensure we have a valid nameserver in the chroooted resolv.conf
# systemd-resolved's 127.0.0.53 often fails in chroot. 
# Let's add Google/Cloudflare DNS as fallback in the chroot copy
echo "nameserver 1.1.1.1" | sudo tee -a /var/spool/postfix/etc/resolv.conf
echo "nameserver 8.8.8.8" | sudo tee -a /var/spool/postfix/etc/resolv.conf

# 2. Enable submission (587) and submissions (465) in master.cf if not already
# It seems they were commented out in the grep output!
echo "Enabling SASL and TLS in master.cf..."
sudo postconf -M submission/inet="submission inet n - y - - smtpd"
sudo postconf -P "submission/inet/smtpd_tls_security_level=encrypt"
sudo postconf -P "submission/inet/smtpd_sasl_auth_enable=yes"
sudo postconf -P "submission/inet/smtpd_tls_auth_only=yes"
sudo postconf -P "submission/inet/smtpd_relay_restrictions=permit_sasl_authenticated,reject"
sudo postconf -P "submission/inet/smtpd_recipient_restrictions=permit_sasl_authenticated,reject"

sudo postconf -M submissions/inet="submissions inet n - y - - smtpd"
sudo postconf -P "submissions/inet/smtpd_tls_wrappermode=yes"
sudo postconf -P "submissions/inet/smtpd_sasl_auth_enable=yes"
sudo postconf -P "submissions/inet/smtpd_relay_restrictions=permit_sasl_authenticated,reject"
sudo postconf -P "submissions/inet/smtpd_recipient_restrictions=permit_sasl_authenticated,reject"

# 3. Restart Postfix
echo "Restarting Postfix..."
sudo systemctl restart postfix
