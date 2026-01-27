#!/usr/bin/env python3
"""Migration script for chaspers.co.zw."""
import os, subprocess, secrets, string, pymysql

DB_HOST, DB_USER, DB_NAME = "localhost", "mailuser", "mailserver"
VMAIL_BASE, DOMAIN = "/var/vmail", "chaspers.co.zw"
USERS = ["albert", "kelvin", "lshoko", "mitchell"]

def get_db_password():
    try:
        with open("/etc/dovecot/dovecot-sql.conf.ext") as f:
            for line in f:
                if "password=" in line:
                    return line.split("password=")[1].strip().strip('"')
    except: pass
    return None

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

def main():
    conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=get_db_password(),
                           database=DB_NAME, cursorclass=pymysql.cursors.DictCursor)
    with conn.cursor() as c:
        c.execute("SELECT id FROM domains WHERE name=%s", (DOMAIN,))
        if not c.fetchone():
            c.execute("INSERT INTO domains (name) VALUES (%s)", (DOMAIN,))
            conn.commit(); print(f"✓ Domain {DOMAIN} added")
        c.execute("SELECT id FROM domains WHERE name=%s", (DOMAIN,))
        domain_id = c.fetchone()['id']
    
    passwords_path = os.path.expanduser(f"~/{DOMAIN.replace('.', '_')}_passwords.txt")
    with open(passwords_path, "w") as f:
        f.write(f"# Passwords for {DOMAIN}\n\n")
        for user in USERS:
            email = f"{user}@{DOMAIN}"
            with conn.cursor() as c:
                c.execute("SELECT 1 FROM users WHERE mail=%s", (email,))
                if c.fetchone(): print(f"⚠ {email} exists"); continue
            pw = generate_password(); pw_hash = hash_password(pw)
            with conn.cursor() as c:
                c.execute("INSERT INTO users (c_uid,c_name,c_password,c_cn,mail,domain_id) VALUES (%s,%s,%s,%s,%s,%s)",
                          (email, email, pw_hash, user, email, domain_id))
            conn.commit()
            mdir = f"{VMAIL_BASE}/{DOMAIN}/{user}"
            subprocess.run(["mkdir", "-p", mdir], check=True)
            subprocess.run(["chown", "-R", "vmail:vmail", f"{VMAIL_BASE}/{DOMAIN}"], check=True)
            f.write(f"{email}: {pw}\n"); print(f"✓ Created {email}")
    os.chmod(passwords_path, 0o600)
    print(f"\n✅ MIGRATION SETUP COMPLETE. Passwords saved to: {passwords_path}")
    conn.close()

if __name__ == "__main__": main()
