#!/usr/bin/env python3
"""
Configure Rspamd neural training via Dovecot IMAP-Sieve.
When users move mail to Junk in SOGo, it triggers spam learning.
Moving mail out of Junk triggers ham learning.
"""

import subprocess
import os

# Rspamd configurations
CLASSIFIER_BAYES = """\
# Bayes classifier with Redis backend
backend = "redis";
servers = "127.0.0.1";
autolearn = true;
"""

NEURAL_CONF = """\
# Neural network spam learning
enabled = true;
rules {
  NEURAL_SPAM {
    train {
      spam_score = 6.0;
      ham_score = -6.0;
    }
    symbol_spam = "NEURAL_SPAM";
    symbol_ham = "NEURAL_HAM";
  }
}
"""

# Training scripts
LEARN_SPAM_SH = """\
#!/bin/bash
exec /usr/bin/rspamc learn_spam
"""

LEARN_HAM_SH = """\
#!/bin/bash
exec /usr/bin/rspamc learn_ham
"""

# Sieve scripts for IMAP-Sieve
LEARN_SPAM_SIEVE = """\
require ["vnd.dovecot.pipe", "copy", "imapsieve"];
pipe :copy "rspamd-learn-spam.sh";
"""

LEARN_HAM_SIEVE = """\
require ["vnd.dovecot.pipe", "copy", "imapsieve"];
pipe :copy "rspamd-learn-ham.sh";
"""

# Dovecot 90-sieve.conf additions
SIEVE_PLUGIN_CONF = """\
plugin {
  # Sieve script locations
  sieve = file:~/sieve;active=~/.dovecot.sieve
  
  # Global sieve script to move spam to Junk (runs BEFORE user scripts)
  sieve_before = /var/vmail/sieve/spam-to-junk.sieve
  
  # Extensions
  sieve_extensions = +fileinto +mailbox +envelope +variables
  
  # IMAP-Sieve plugins
  sieve_plugins = sieve_imapsieve sieve_extprograms
  
  # Spam learning: when mail is moved TO Junk
  imapsieve_mailbox1_name = Junk
  imapsieve_mailbox1_causes = COPY APPEND
  imapsieve_mailbox1_before = file:/var/vmail/sieve/learn-spam.sieve
  
  # Ham learning: when mail is moved FROM Junk to any other folder
  imapsieve_mailbox2_name = *
  imapsieve_mailbox2_from = Junk
  imapsieve_mailbox2_causes = COPY
  imapsieve_mailbox2_before = file:/var/vmail/sieve/learn-ham.sieve
  
  # Allow executing external programs
  sieve_global_extensions = +vnd.dovecot.pipe
  sieve_pipe_bin_dir = /usr/local/bin
}
"""

# Dovecot 20-imap.conf protocol section
IMAP_PROTOCOL_CONF = """\
protocol imap {
  mail_plugins = $mail_plugins imap_sieve
}
"""

def run(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
    return result.returncode == 0

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)
    print(f"✓ Created {path}")

def main():
    # 1. Fix Rspamd hyperscan cache permissions
    print("\n=== Fixing Rspamd permissions ===")
    run("chown -R _rspamd:_rspamd /var/lib/rspamd/")
    
    # 2. Create Rspamd configurations
    print("\n=== Configuring Rspamd ===")
    write_file("/etc/rspamd/local.d/classifier-bayes.conf", CLASSIFIER_BAYES)
    write_file("/etc/rspamd/local.d/neural.conf", NEURAL_CONF)
    
    # 3. Create training scripts
    print("\n=== Creating training scripts ===")
    write_file("/usr/local/bin/rspamd-learn-spam.sh", LEARN_SPAM_SH)
    write_file("/usr/local/bin/rspamd-learn-ham.sh", LEARN_HAM_SH)
    run("chmod +x /usr/local/bin/rspamd-learn-spam.sh")
    run("chmod +x /usr/local/bin/rspamd-learn-ham.sh")
    
    # 4. Create Sieve scripts
    print("\n=== Creating Sieve scripts ===")
    write_file("/var/vmail/sieve/learn-spam.sieve", LEARN_SPAM_SIEVE)
    write_file("/var/vmail/sieve/learn-ham.sieve", LEARN_HAM_SIEVE)
    run("sievec /var/vmail/sieve/learn-spam.sieve")
    run("sievec /var/vmail/sieve/learn-ham.sieve")
    run("chown vmail:vmail /var/vmail/sieve/learn-*")
    
    # 5. Update Dovecot configuration
    print("\n=== Configuring Dovecot ===")
    write_file("/etc/dovecot/conf.d/90-sieve.conf", SIEVE_PLUGIN_CONF)
    
    # Append to 20-imap.conf if not already present
    with open("/etc/dovecot/conf.d/20-imap.conf", "r") as f:
        existing = f.read()
    if "imap_sieve" not in existing:
        with open("/etc/dovecot/conf.d/20-imap.conf", "a") as f:
            f.write("\n" + IMAP_PROTOCOL_CONF)
        print("✓ Added imap_sieve to 20-imap.conf")
    else:
        print("✓ imap_sieve already in 20-imap.conf")
    
    # 6. Restart services
    print("\n=== Restarting services ===")
    run("systemctl restart rspamd")
    run("systemctl restart dovecot")
    
    # 7. Check status
    print("\n=== Verifying ===")
    run("systemctl is-active rspamd && echo 'Rspamd: OK'")
    run("systemctl is-active dovecot && echo 'Dovecot: OK'")
    run("rspamc stat | head -10")
    
    print("\n✅ IMAP-Sieve neural training configured!")
    print("   - Move mail TO Junk → learns as SPAM")
    print("   - Move mail FROM Junk → learns as HAM")

if __name__ == "__main__":
    main()
