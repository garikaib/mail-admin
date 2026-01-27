# Generate DKIM key
mkdir -p /var/lib/rspamd/dkim
rspamadm dkim_keygen -b 2048 -s mail -k /var/lib/rspamd/dkim/mail.key > /var/lib/rspamd/dkim/mail.pub
chown -R _rspamd:_rspamd /var/lib/rspamd/dkim
chmod 440 /var/lib/rspamd/dkim/mail.key

# Configure DKIM signing
cat > /etc/rspamd/local.d/dkim_signing.conf <<EOF
path = "/var/lib/rspamd/dkim/mail.key";
selector = "mail";
allow_envfrom_empty = true;
allow_hdrfrom_mismatch = false;
allow_hdrfrom_multiple = false;
allow_username_mismatch = false;
use_domain = "header";
sign_local = true;
symbol = "DKIM_SIGNED";
EOF

# Integrate with Redis
cat > /etc/rspamd/local.d/redis.conf <<EOF
servers = "127.0.0.1";
EOF

# Configure Worker Proxy for Postfix integration
cat > /etc/rspamd/local.d/worker-proxy.inc <<EOF
bind_socket = "localhost:11332";
upstream "local" {
  default = yes;
  self_scan = yes;
  hosts = "localhost:11330";
}
count = 1;
EOF

# Configure Postfix to use Rspamd
postconf -e 'smtpd_milters = inet:localhost:11332'
postconf -e 'non_smtpd_milters = inet:localhost:11332'
postconf -e 'milter_protocol = 6'
postconf -e 'milter_mail_macros = i {mail_addr} {client_addr} {client_name} {auth_authen}'

systemctl restart rspamd postfix

# Output public key for DNS record
echo "DKIM Public Key for DNS:"
cat /var/lib/rspamd/dkim/mail.pub
