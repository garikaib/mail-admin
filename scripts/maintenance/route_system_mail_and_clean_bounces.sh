#!/usr/bin/env bash
set -euo pipefail

TARGET_ADDRESS="${TARGET_ADDRESS:-admin@zimprices.co.zw}"
MAILBOX_USER="${MAILBOX_USER:-admin@zimprices.co.zw}"
ALIASES_FILE="${ALIASES_FILE:-/etc/aliases}"
APPLY_DELETE=0

usage() {
  cat <<EOF
Usage: sudo $0 [--apply-delete]

Routes local root/system mail to ${TARGET_ADDRESS} and removes existing mailer-daemon
bounce messages from ${MAILBOX_USER}.

Environment overrides:
  TARGET_ADDRESS=admin@zimprices.co.zw
  MAILBOX_USER=admin@zimprices.co.zw
  ALIASES_FILE=/etc/aliases

Deletion defaults to dry-run. Pass --apply-delete to expunge matching messages.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply-delete)
      APPLY_DELETE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [[ ! -f "${ALIASES_FILE}" ]]; then
  echo "Missing aliases file: ${ALIASES_FILE}" >&2
  exit 1
fi

backup="${ALIASES_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp "${ALIASES_FILE}" "${backup}"

# Ensure local system mail stops expanding to an external Gmail address.
if grep -Eq '^[[:space:]]*root[[:space:]]*:' "${ALIASES_FILE}"; then
  sed -i -E "s|^[[:space:]]*root[[:space:]]*:.*|root: ${TARGET_ADDRESS}|" "${ALIASES_FILE}"
else
  printf '\nroot: %s\n' "${TARGET_ADDRESS}" >> "${ALIASES_FILE}"
fi

if grep -Eq '^[[:space:]]*mailadmin[[:space:]]*:' "${ALIASES_FILE}"; then
  sed -i -E "s|^[[:space:]]*mailadmin[[:space:]]*:.*|mailadmin: ${TARGET_ADDRESS}|" "${ALIASES_FILE}"
else
  printf 'mailadmin: %s\n' "${TARGET_ADDRESS}" >> "${ALIASES_FILE}"
fi

if command -v newaliases >/dev/null 2>&1; then
  newaliases
else
  postalias "${ALIASES_FILE}"
fi

echo "Updated ${ALIASES_FILE}; backup saved to ${backup}"
echo "root/mailadmin system mail now routes to ${TARGET_ADDRESS}"

if ! command -v doveadm >/dev/null 2>&1; then
  echo "doveadm not found; skipping mailbox cleanup" >&2
  exit 0
fi

QUERY=(OR HEADER Subject "Undelivered Mail Returned to Sender" FROM "MAILER-DAEMON")

echo "Matching bounce messages for ${MAILBOX_USER}:"
doveadm search -u "${MAILBOX_USER}" mailbox INBOX "${QUERY[@]}" || true

if [[ ${APPLY_DELETE} -eq 1 ]]; then
  doveadm expunge -u "${MAILBOX_USER}" mailbox INBOX "${QUERY[@]}"
  echo "Expunged matching bounce messages from ${MAILBOX_USER}/INBOX"
else
  echo "Dry-run only. Re-run with --apply-delete to expunge these messages."
fi
