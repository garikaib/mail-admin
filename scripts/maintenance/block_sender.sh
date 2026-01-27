#!/bin/bash
# Block a sender or domain in Rspamd

SENDER=$1

if [ -z "$SENDER" ]; then
  echo "Usage: $0 <email_or_domain>"
  exit 1
fi

MAP_FILE="/etc/rspamd/local.d/local_bl_from.map.inc"

if grep -q "$SENDER" "$MAP_FILE"; then
  echo "$SENDER is already blocked."
else
  echo "$SENDER" >> "$MAP_FILE"
  echo "Added $SENDER to blacklist."
  systemctl restart rspamd
  echo "Rspamd restarted."
fi
