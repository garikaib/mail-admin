# Configure Dovecot SQL
sudo tee /etc/dovecot/dovecot-sql.conf.ext > /dev/null <<EOF
driver = mysql
connect = host=127.0.0.1 dbname=mailserver user=mailuser password=ChangeMe123!
default_pass_scheme = SHA512-CRYPT
password_query = SELECT email as user, password FROM users WHERE email='%u';
user_query = SELECT email as user, '/var/vmail/%d/%n' as home, 5000 as uid, 5000 as gid FROM users WHERE email='%u';
EOF

sudo chmod 640 /etc/dovecot/dovecot-sql.conf.ext
sudo chgrp dovecot /etc/dovecot/dovecot-sql.conf.ext

# Configure Dovecot Main setup
sudo tee /etc/dovecot/conf.d/10-auth.conf > /dev/null <<EOF
disable_plaintext_auth = yes
auth_mechanisms = plain login
!include auth-sql.conf.ext
EOF

sudo tee /etc/dovecot/conf.d/auth-sql.conf.ext > /dev/null <<EOF
passdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf.ext
}
userdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf.ext
}
EOF

sudo tee /etc/dovecot/conf.d/10-mail.conf > /dev/null <<EOF
mail_location = maildir:/var/vmail/%d/%n
mail_uid = 5000
mail_gid = 5000
first_valid_uid = 5000
last_valid_uid = 5000
EOF

sudo tee /etc/dovecot/conf.d/10-ssl.conf > /dev/null <<EOF
ssl = required
ssl_cert = </etc/lego/certificates/zimprices.co.zw.crt
ssl_key = </etc/lego/certificates/zimprices.co.zw.key
EOF

sudo tee /etc/dovecot/conf.d/10-master.conf > /dev/null <<EOF
service lmtp {
 unix_listener /var/spool/postfix/private/dovecot-lmtp {
   mode = 0600
   user = postfix
   group = postfix
  }
}
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666
    user = postfix
    group = postfix
  }
}
EOF

# Create vmail user
sudo groupadd -g 5000 vmail || true
sudo useradd -g vmail -u 5000 vmail -d /var/vmail || true
sudo mkdir -p /var/vmail
sudo chown -R vmail:vmail /var/vmail

sudo systemctl restart dovecot
