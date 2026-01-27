sudo tee /etc/postfix/mysql-virtual-mailbox-domains.cf > /dev/null <<EOF
user = mailuser
password = ChangeMe123!
hosts = 127.0.0.1
dbname = mailserver
query = SELECT 1 FROM domains WHERE name='%s'
EOF

sudo tee /etc/postfix/mysql-virtual-mailbox-maps.cf > /dev/null <<EOF
user = mailuser
password = ChangeMe123!
hosts = 127.0.0.1
dbname = mailserver
query = SELECT 1 FROM users WHERE email='%s'
EOF

sudo tee /etc/postfix/mysql-virtual-alias-maps.cf > /dev/null <<EOF
user = mailuser
password = ChangeMe123!
hosts = 127.0.0.1
dbname = mailserver
query = SELECT destination FROM aliases WHERE source='%s'
EOF

sudo chmod 640 /etc/postfix/mysql-virtual-*.cf
sudo chgrp postfix /etc/postfix/mysql-virtual-*.cf
