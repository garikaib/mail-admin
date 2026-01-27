#!/usr/bin/env python3
"""
Disable IPv6 for Postfix and Dovecot.
"""

import subprocess

def run(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
    return result.returncode == 0

def main():
    print("=== Disabling IPv6 for Postfix ===")
    run("postconf -e 'inet_protocols = ipv4'")
    
    print("\n=== Disabling IPv6 for Dovecot ===")
    # Explicitly set listen to only IPv4
    run("sed -i 's/^#listen = .*/listen = */' /etc/dovecot/dovecot.conf")
    run("grep -q '^listen = \*' /etc/dovecot/dovecot.conf || echo 'listen = *' >> /etc/dovecot/dovecot.conf")
    
    print("\n=== Restarting Services ===")
    run("systemctl restart postfix")
    run("systemctl restart dovecot")
    
    print("\n=== Verification ===")
    print("Postfix protocols:")
    run("postconf inet_protocols")
    
    print("\nListening ports (should only show 0.0.0.0, no [::]):")
    run("netstat -lnpt | grep -E ':25|:143|:587|:993'")

if __name__ == "__main__":
    main()
