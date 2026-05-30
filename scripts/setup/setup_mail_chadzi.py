#!/usr/bin/env python3
"""Setup script for new domain chadzi.co.zw using MariaDB CLI."""
import os, subprocess, secrets, string

VMAIL_BASE, DOMAIN = "/var/vmail", "chadzi.co.zw"
USERS = ["info"]

def generate_password(length=20):
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        pw = ''.join(secrets.choice(alphabet) for _ in range(length))
        if all([any(c.islower() for c in pw), any(c.isupper() for c in pw),
                any(c.isdigit() for c in pw), any(c in "!@#$%&*" for c in pw)]):
            return pw

def hash_password(pw):
    try:
        r = subprocess.run(["doveadm", "pw", "-s", "SHA512-CRYPT", "-p", pw],
                           capture_output=True, text=True, check=True)
        return r.stdout.strip()
    except Exception as e:
        print(f"Error hashing password: {e}")
        return None

def run_sql(sql):
    """Run SQL command via mariadb CLI."""
    cmd = ["mariadb", "-N", "-s", "-e", sql]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return r.stdout.strip()
    except Exception as e:
        print(f"Error running SQL: {e}")
        return None

def check_nginx():
    print("Checking Nginx configuration...")
    try:
        subprocess.run(["sudo", "nginx", "-t"], check=True)
        print("✓ Nginx configuration is valid.")
    except Exception as e:
        print(f"✗ Nginx configuration test failed: {e}")

def check_ssl():
    print(f"Checking SSL certificates for {DOMAIN}...")
    cert_path = f"/etc/lego/certificates/{DOMAIN}.crt"
    if os.path.exists(cert_path):
        print(f"✓ SSL certificate found at {cert_path}")
    else:
        print(f"✗ SSL certificate NOT found at {cert_path}")

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
            if not pw_hash:
                continue
            
            # Insert user
            sql = f"INSERT INTO mailserver.users (c_uid, c_name, c_password, c_cn, mail, domain_id) VALUES ('{email}', '{email}', '{pw_hash}', '{user}', '{email}', {domain_id})"
            subprocess.run(["mariadb", "-e", sql], check=True)
            
            mdir = f"{VMAIL_BASE}/{DOMAIN}/{user}"
            subprocess.run(["sudo", "mkdir", "-p", mdir], check=True)
            subprocess.run(["sudo", "chown", "-R", "vmail:vmail", f"{VMAIL_BASE}/{DOMAIN}"], check=True)
            
            f.write(f"{email}: {pw}\n")
            print(f"✓ Created {email}")
            
    os.chmod(passwords_path, 0o600)
    print(f"\n✅ DATABASE SETUP COMPLETE. Passwords saved to: {passwords_path}")
    
    check_nginx()
    check_ssl()

if __name__ == "__main__":
    main()
