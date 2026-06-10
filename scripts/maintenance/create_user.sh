#!/bin/bash
DOMAIN="zimprices.co.zw"
USER="gbdzoma"
EMAIL="${USER}@${DOMAIN}"
PASSWORD="${MAILBOX_PASSWORD:-}"

if [ -z "$PASSWORD" ]; then
    echo "MAILBOX_PASSWORD must be set; refusing to use an insecure default password" >&2
    exit 1
fi

# Generate Hash
HASH=$(doveadm pw -s SHA512-CRYPT -p "$PASSWORD")

# Get Domain ID
DOMAIN_ID=$(sudo mariadb -N -e "SELECT id FROM mailserver.domains WHERE name='${DOMAIN}'")

if [ -z "$DOMAIN_ID" ]; then
    echo "Domain not found!"
    exit 1
fi

# Insert User
sudo mariadb -e "INSERT INTO mailserver.users (domain_id, password, email) VALUES (${DOMAIN_ID}, '${HASH}', '${EMAIL}') ON DUPLICATE KEY UPDATE password='${HASH}';"

echo "User ${EMAIL} created/updated with ID: ${DOMAIN_ID}"
