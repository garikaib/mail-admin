#!/usr/bin/env python3
"""Setup script for new domain honeyscoop.co.zw using MariaDB CLI."""
import os, subprocess, secrets, string

VMAIL_BASE, DOMAIN = "/var/vmail", "honeyscoop.co.zw"
USERS = ["vincent", "sales"]

def generate_password(length=20):
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        pw = ''.join(secrets.choice(alphabet) for _ in range(length))
        if all([any(c.islower() for c in pw), any(c.isupper() for c in pw),
                any(c.isdigit() for c in pw), any(c in "!@#$%&*" for c in pw)]):
            return pw

def hash_password(pw):
    r = subprocess.run(["doveadm", "pw", "-s", "SHA512-CRYPT", "-p", pw],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()

def run_sql(sql):
    """Run SQL command via mariadb CLI."""
    cmd = ["mariadb", "-N", "-s", "-e", sql]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return r.stdout.strip()

def main():
    print(f"Setting up domain {DOMAIN}...")
    
    # 1. Ensure domain exists
    domain_id = run_sql(f"SELECT id FROM mailserver.domains WHERE name='{DOMAIN}'")
    if not domain_id:
        subprocess.run(["mariadb", "-e", f"INSERT INTO mailserver.domains (name) VALUES ('{DOMAIN}')"], check=True)
        domain_id = run_sql(f"SELECT id FROM mailserver.domains WHERE name='{DOMAIN}'")
        print(f"✓ Domain {DOMAIN} added (ID: {domain_id})")
    else:
        print(f"ℹ Domain {DOMAIN} already exists (ID: {domain_id})")
    
    passwords_path = os.path.expanduser(f"~/{DOMAIN.replace('.', '_')}_passwords.txt")
    with open(passwords_path, "w") as f:
        f.write(f"# Passwords for {DOMAIN}\n\n")
        for user in USERS:
            email = f"{user}@{DOMAIN}"
            
            # Check if user exists
            exists = run_sql(f"SELECT 1 FROM mailserver.users WHERE mail='{email}'")
            if exists:
                print(f"⚠ {email} already exists")
                continue
            
            pw = generate_password()
            pw_hash = hash_password(pw)
            
            # Insert user
            sql = f"INSERT INTO mailserver.users (c_uid, c_name, c_password, c_cn, mail, domain_id) VALUES ('{email}', '{email}', '{pw_hash}', '{user}', '{email}', {domain_id})"
            subprocess.run(["mariadb", "-e", sql], check=True)
            
            mdir = f"{VMAIL_BASE}/{DOMAIN}/{user}"
            subprocess.run(["mkdir", "-p", mdir], check=True)
            subprocess.run(["chown", "-R", "vmail:vmail", f"{VMAIL_BASE}/{DOMAIN}"], check=True)
            
            f.write(f"{email}: {pw}\n")
            print(f"✓ Created {email}")
            
    os.chmod(passwords_path, 0o600)
    print(f"\n✅ SETUP COMPLETE. Passwords saved to: {passwords_path}")

if __name__ == "__main__":
    main()
