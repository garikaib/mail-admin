#!/usr/bin/env python3
"""
Configure Rspamd multimap to block specific phishing patterns.
Ref: https://rspamd.com/doc/modules/multimap.html
"""

import subprocess
import os

# Multimap configuration
MULTIMAP_CONF = """\
# Block Bad Senders (Domains or Emails)
bad_senders {
  type = "from";
  filter = "email:domain";
  map = "/etc/rspamd/local.d/maps.d/bad_senders.map";
  symbol = "BAD_SENDER";
  score = 20.0; # Reject
  description = "Blocked sender domain";
}

# Block Bad Subjects (Regex)
bad_subjects {
  type = "header";
  header = "Subject";
  map = "/etc/rspamd/local.d/maps.d/bad_subjects.map";
  symbol = "BAD_SUBJECT";
  regexp = true;
  score = 20.0; # Reject
  description = "Blocked subject line";
}

# Block Bad Content/Body (Regex)
bad_content {
  type = "content";
  map = "/etc/rspamd/local.d/maps.d/bad_content.map";
  symbol = "BAD_CONTENT";
  regexp = true;
  score = 20.0; # Reject
  description = "Blocked content pattern";
}
"""

# Map contents
BAD_SENDERS = """\
boeingcomposite.com
olavhansen.com
"""

BAD_SUBJECTS = """\
/Your email data storage is almost full/i
/Mailbox Cleanup/i
/Upgrade your plan/i
/PAYMENT FOR DECEMBER OUTSTANDING INVOICES/i
"""

BAD_CONTENT = """\
/boeingcomposite\.com/i
/olavhansen\.com/i
/Clean up some space or upgrade your plan/i
/Payment Silp\.tar/i
/Jenking Technology Ltd/i
"""

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)
    print(f"✓ Created {path}")

def run(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
    return result.returncode == 0

def main():
    print("=== Configuring Rspamd Multimap Blocking ===")
    
    # Create maps directory
    run("mkdir -p /etc/rspamd/local.d/maps.d")
    
    # Write configs
    write_file("/etc/rspamd/local.d/multimap.conf", MULTIMAP_CONF)
    write_file("/etc/rspamd/local.d/maps.d/bad_senders.map", BAD_SENDERS)
    write_file("/etc/rspamd/local.d/maps.d/bad_subjects.map", BAD_SUBJECTS)
    write_file("/etc/rspamd/local.d/maps.d/bad_content.map", BAD_CONTENT)
    
    # Restart Rspamd
    print("\n=== Restarting Rspamd ===")
    if run("systemctl restart rspamd"):
        print("✅ Rspamd restarted successfully")
        print("Blocked patterns:")
        print("  - Sender: boeingcomposite.com")
        print("  - Subject: 'Your email data storage is almost full'")
        print("  - Subject: 'Mailbox Cleanup'")
    else:
        print("❌ Failed to restart Rspamd")

if __name__ == "__main__":
    main()
