#!/usr/bin/env python3
"""Reset password for director1@hygienemax.co.zw."""
import subprocess, secrets, string

DOMAIN = "hygienemax.co.zw"
USER = "director1"
EMAIL = f"{USER}@{DOMAIN}"

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
    pw = generate_password()
    pw_hash = hash_password(pw)
    
    sql = f"UPDATE mailserver.users SET c_password = '{pw_hash}' WHERE mail = '{EMAIL}'"
    subprocess.run(["sudo", "mariadb", "-e", sql], check=True)
    
    print(f"{EMAIL}: {pw}")

if __name__ == "__main__":
    main()
