#!/usr/bin/env python3
"""
Migration script for moretswana.com to zimprices mail server.
Creates domain, users, and prepares for maildir sync.
"""

import os
import sys
import subprocess
import secrets
import string
import pymysql

# Configuration
DB_HOST = "localhost"
DB_USER = "mailuser"
DB_NAME = "mailserver"
VMAIL_BASE = "/var/vmail"
DOMAIN = "moretswana.com"

# Users to create
USERS = [
    "catering",
    "info", 
    "media",
    "richard",
    "rodney",
    "sales",
    "talebility",
    "talent"
]

def get_db_password():
    """Read DB password from Dovecot config."""
    try:
        with open("/etc/dovecot/dovecot-sql.conf.ext") as f:
            for line in f:
                if "password=" in line:
                    return line.split("password=")[1].strip().strip('"')
    except:
        pass
    return None

def generate_password(length=20):
    """Generate a secure password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure at least one of each type
        if (any(c.islower() for c in password) and
            any(c.isupper() for c in password) and
            any(c.isdigit() for c in password) and
            any(c in "!@#$%&*" for c in password)):
            return password

def hash_password(password):
    """Hash password using doveadm."""
    result = subprocess.run(
        ["doveadm", "pw", "-s", "SHA512-CRYPT", "-p", password],
        capture_output=True, text=True, check=True
    )
    return result.stdout.strip()

def get_db_connection():
    """Get database connection."""
    password = get_db_password()
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=password,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )

def add_domain(conn):
    """Add domain to database."""
    with conn.cursor() as cursor:
        cursor.execute("SELECT id FROM domains WHERE name = %s", (DOMAIN,))
        if cursor.fetchone():
            print(f"✓ Domain {DOMAIN} already exists")
            cursor.execute("SELECT id FROM domains WHERE name = %s", (DOMAIN,))
            return cursor.fetchone()['id']
        
        cursor.execute("INSERT INTO domains (name) VALUES (%s)", (DOMAIN,))
        conn.commit()
        print(f"✓ Domain {DOMAIN} added")
        return cursor.lastrowid

def add_user(conn, domain_id, username, passwords_file):
    """Add a user to the database."""
    email = f"{username}@{DOMAIN}"
    
    with conn.cursor() as cursor:
        cursor.execute("SELECT 1 FROM users WHERE mail = %s", (email,))
        if cursor.fetchone():
            print(f"  ⚠ User {email} already exists, skipping...")
            return
    
    password = generate_password()
    password_hash = hash_password(password)
    
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO users (c_uid, c_name, c_password, c_cn, mail, domain_id)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (email, email, password_hash, username, email, domain_id))
    conn.commit()
    
    # Create maildir
    maildir = f"{VMAIL_BASE}/{DOMAIN}/{username}"
    subprocess.run(["mkdir", "-p", maildir], check=True)
    subprocess.run(["chown", "-R", "vmail:vmail", f"{VMAIL_BASE}/{DOMAIN}"], check=True)
    
    # Save password
    passwords_file.write(f"{email}: {password}\n")
    print(f"  ✓ Created {email}")

def main():
    print("=" * 60)
    print(f"  MORETSWANA.COM MIGRATION SCRIPT")
    print("=" * 60)
    
    conn = get_db_connection()
    
    try:
        # Add domain
        print("\n[1/2] Adding domain...")
        domain_id = add_domain(conn)
        
        # Add users
        print(f"\n[2/2] Creating {len(USERS)} users...")
        passwords_path = os.path.expanduser("~/moretswana_passwords.txt")
        with open(passwords_path, "w") as f:
            f.write(f"# Passwords for {DOMAIN}\n")
            f.write(f"# Generated: {subprocess.check_output(['date']).decode().strip()}\n")
            f.write("# " + "=" * 50 + "\n\n")
            
            for username in USERS:
                add_user(conn, domain_id, username, f)
        
        os.chmod(passwords_path, 0o600)
        
        print("\n" + "=" * 60)
        print("✅ MIGRATION SETUP COMPLETE")
        print("=" * 60)
        print(f"  Passwords saved to: {passwords_path}")
        print(f"  Maildir base: {VMAIL_BASE}/{DOMAIN}/")
        print("\n  Next: Run rsync to copy mail from source server")
        print("=" * 60)
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()
