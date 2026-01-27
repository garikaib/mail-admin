#!/usr/bin/env python3
"""
Complete mail server setup script.
Fixes database schema, creates user, and configures Cloudflare DNS.
"""
import subprocess
import json
import requests

# Configuration
SERVER = "51.77.222.232"
SERVER_IPV6 = "2001:41d0:305:2100::8406"
DOMAIN = "zimprices.co.zw"
CF_EMAIL = "gbdzoma@gmail.com"
CF_API_KEY = "c387a52124c3ece44c4c4e36a2964a152e86a"
MAIL_USER = "gbdzoma"
MAIL_PASSWORD = "ChangeMe123!"

# DKIM key (captured from rspamd setup)
DKIM_KEY = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApfy/RZ3JywHUwfw0eSGQ4fnj/A5k9Cr2Bw92nC6G22NH/1wYonzspQge6cSKEZm5SqnMwzh1wd1BaXG2C4GuajY3wmNRiW5KZFWfLP58qIfb5T9JX1xAMpRWRulmTyT+kTOErDuyGs0xlU6htdW/fQ9ovirVQCbk7D0hImGa/W6wIadk5ufIA0jpuMCafOd2kxCS4bV0uY2XfXfOJapXBx5GSP2GC+45aoL3itGtaxWEZrAb2l6Tsu/MOhdW1kFqA30zBx7pxTbYieoykRcJdmFVbmRD/D9P/3avdesUb2SP1y0ZH/l6dxVrVkWxo/Zz8GNcGsa2XO6AwCpqCor1CQIDAQAB'


def ssh_cmd(cmd: str) -> str:
    """Execute command on remote server via SSH."""
    result = subprocess.run(
        ["ssh", f"ubuntu@{SERVER}", f"sudo bash -c '{cmd}'"],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"SSH Error: {result.stderr}")
    return result.stdout.strip()


def fix_database():
    """Fix the password column length and create user."""
    print("=== Fixing Database Schema ===")
    
    # Extend password column
    ssh_cmd("mariadb -e \"ALTER TABLE mailserver.users MODIFY password VARCHAR(256) NOT NULL;\"")
    print("Password column extended to 256 chars.")
    
    # Generate password hash
    hash_result = ssh_cmd(f"doveadm pw -s SHA512-CRYPT -p '{MAIL_PASSWORD}'")
    print(f"Generated hash: {hash_result[:30]}...")
    
    # Escape single quotes in hash for SQL
    escaped_hash = hash_result.replace("'", "''")
    
    # Insert/update user
    email = f"{MAIL_USER}@{DOMAIN}"
    sql = f"""
        INSERT INTO mailserver.users (domain_id, password, email) 
        SELECT id, '{escaped_hash}', '{email}' FROM mailserver.domains WHERE name='{DOMAIN}'
        ON DUPLICATE KEY UPDATE password='{escaped_hash}';
    """
    ssh_cmd(f'mariadb -e "{sql}"')
    print(f"User {email} created/updated.")
    
    # Create maildir
    ssh_cmd(f"mkdir -p /var/vmail/{DOMAIN}/{MAIL_USER} && chown -R vmail:vmail /var/vmail/{DOMAIN}")
    print(f"Maildir created for {email}.")


def get_cf_zone_id() -> str:
    """Get Cloudflare zone ID for the domain."""
    headers = {
        "X-Auth-Email": CF_EMAIL,
        "X-Auth-Key": CF_API_KEY,
        "Content-Type": "application/json"
    }
    resp = requests.get(
        f"https://api.cloudflare.com/client/v4/zones?name={DOMAIN}",
        headers=headers
    )
    data = resp.json()
    if not data["success"] or not data["result"]:
        raise Exception(f"Failed to get zone: {data}")
    return data["result"][0]["id"]


def set_dns_record(zone_id: str, record_type: str, name: str, content: str, proxied: bool = False, priority: int = None, ttl: int = 1):
    """Create or update a DNS record."""
    headers = {
        "X-Auth-Email": CF_EMAIL,
        "X-Auth-Key": CF_API_KEY,
        "Content-Type": "application/json"
    }
    
    # Check if record exists
    resp = requests.get(
        f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?type={record_type}&name={name}",
        headers=headers
    )
    existing = resp.json()
    
    payload = {
        "type": record_type,
        "name": name,
        "content": content,
        "ttl": ttl,
        "proxied": proxied
    }
    if priority is not None:
        payload["priority"] = priority
    
    if existing["result"]:
        # Update
        record_id = existing["result"][0]["id"]
        resp = requests.put(
            f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}",
            headers=headers,
            json=payload
        )
    else:
        # Create
        resp = requests.post(
            f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records",
            headers=headers,
            json=payload
        )
    
    result = resp.json()
    if result["success"]:
        print(f"  ✓ {record_type} {name} -> {content[:50]}...")
    else:
        print(f"  ✗ {record_type} {name} FAILED: {result['errors']}")


def configure_dns():
    """Configure all required DNS records on Cloudflare."""
    print("\n=== Configuring Cloudflare DNS ===")
    
    zone_id = get_cf_zone_id()
    print(f"Zone ID: {zone_id}")
    
    # A record for mail (NOT proxied - mail needs direct IP)
    set_dns_record(zone_id, "A", f"mail.{DOMAIN}", SERVER, proxied=False)
    
    # AAAA record for mail
    set_dns_record(zone_id, "AAAA", f"mail.{DOMAIN}", SERVER_IPV6, proxied=False)
    
    # MX record
    set_dns_record(zone_id, "MX", DOMAIN, f"mail.{DOMAIN}", priority=10)
    
    # SPF record
    spf = f"v=spf1 mx a ip4:{SERVER} ip6:{SERVER_IPV6} ~all"
    set_dns_record(zone_id, "TXT", DOMAIN, spf)
    
    # DKIM record
    set_dns_record(zone_id, "TXT", f"mail._domainkey.{DOMAIN}", DKIM_KEY)
    
    # DMARC record
    dmarc = f"v=DMARC1; p=quarantine; rua=mailto:postmaster@{DOMAIN}; ruf=mailto:postmaster@{DOMAIN}; fo=1"
    set_dns_record(zone_id, "TXT", f"_dmarc.{DOMAIN}", dmarc)
    
    print("\nDNS configuration complete!")


def verify_services():
    """Verify all services are running."""
    print("\n=== Verifying Services ===")
    
    services = ["postfix", "dovecot", "rspamd", "nginx", "sogo", "redis-server", "mariadb"]
    for svc in services:
        status = ssh_cmd(f"systemctl is-active {svc}")
        symbol = "✓" if status == "active" else "✗"
        print(f"  {symbol} {svc}: {status}")


if __name__ == "__main__":
    fix_database()
    configure_dns()
    verify_services()
    
    print("\n" + "="*50)
    print("Setup Complete!")
    print(f"Webmail: https://mail.{DOMAIN}")
    print(f"User: {MAIL_USER}@{DOMAIN}")
    print(f"Password: {MAIL_PASSWORD}")
    print("="*50)
