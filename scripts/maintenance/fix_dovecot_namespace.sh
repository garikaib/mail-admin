#!/bin/bash
# Fix Dovecot namespace configuration
# Error: namespace configuration error: inbox=yes namespace missing

echo "Updating Dovecot namespace config..."
sudo tee /etc/dovecot/conf.d/10-gmail-style.conf > /dev/null <<EOF
namespace inbox {
  inbox = yes
  location = 
  mailbox Drafts {
    special_use = \Drafts
    auto = subscribe
  }
  mailbox Junk {
    special_use = \Junk
    auto = subscribe
  }
  mailbox Trash {
    special_use = \Trash
    auto = subscribe
  }
  mailbox Sent {
    special_use = \Sent
    auto = subscribe
  }
  mailbox "Sent Messages" {
    special_use = \Sent
  }
  prefix = 
}

# Ensure mail_location is properly set if not already in 10-mail.conf (it is, but good to double check or override)
# We are currently using maildir:/var/vmail/%d/%n in 10-mail.conf, which works with the above 'location =' (empty means use default)
EOF

# Restart Dovecot
echo "Restarting Dovecot..."
sudo systemctl restart dovecot
echo "Dovecot restarted."
