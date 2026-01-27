#!/usr/bin/env python3
"""
Configure Postfix to prefer IPv4 for outbound connections.
"""

import subprocess

def run(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
    return result.returncode == 0

def main():
    print("=== Configuring Postfix Outbound Preference ===")
    
    # Ensure Postfix listens on both (for receiving)
    print("Ensuring inet_protocols = all...")
    run("postconf -e 'inet_protocols = all'")
    
    # Prefer IPv4 for outbound
    print("Setting smtp_address_preference = ipv4...")
    run("postconf -e 'smtp_address_preference = ipv4'")
    
    # Also restore Dovecot listen if it was changed (none of the previous cmds ran successfully on server but locally it was prepared)
    # The previous attempt to scp/ssh failed on user review, so the server state should be unchanged.
    
    print("\n=== Restarting Postfix ===")
    run("systemctl restart postfix")
    
    print("\n=== Final Configuration ===")
    run("postconf inet_protocols smtp_address_preference")

if __name__ == "__main__":
    main()
