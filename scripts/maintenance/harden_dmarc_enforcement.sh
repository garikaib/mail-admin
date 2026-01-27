#!/bin/bash
# Configure Rspamd to strictly respect DMARC policies
set -e

echo "Configuring Rspamd DMARC enforcement..."

# Create/update dmarc.conf
sudo tee /etc/rspamd/local.d/dmarc.conf > /dev/null <<EOF
# Respect sender's DMARC policy
# If p=reject, reject the message
# If p=quarantine, add 'rewrite subject' or 'add header' action (which we map to Junk)

actions {
    quarantine = "add_header"; # We use add_header to signal spam to Dovecot
    reject = "reject";
}
EOF

# Ensure the dmarc module is enabled and configured to apply these actions
# Usually, Rspamd respects these by default if defined in actions, 
# but we can make it explicit in the module configuration.

echo "Verifying Rspamd configuration..."
sudo rspamadm configtest

echo "Restarting Rspamd..."
sudo systemctl restart rspamd

echo "DMARC enforcement hardened."
