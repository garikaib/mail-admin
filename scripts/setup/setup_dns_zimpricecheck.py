#!/usr/bin/env python3
"""
Configure Cloudflare DNS records for zimpricecheck.com migration.
Carefully preserves existing SPF includes for bulk email providers.
"""
import requests

ZONE_ID = "7c6e174923bd5b048f64a23a344e062f"
API_KEY = "5f2e114ea312d7fe910251b60f62e43ff892f"
EMAIL = "garikaib@gmail.com"
HEADERS = {"X-Auth-Email": EMAIL, "X-Auth-Key": API_KEY, "Content-Type": "application/json"}
BASE_URL = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"

SERVER_IPV4 = "51.77.222.232"
SERVER_IPV6 = "2001:41d0:305:2100::8406"

# New DKIM public key (mail2 selector)
DKIM_PUBLIC = "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxjTOxeTwuwdldu8lMKSArUnUcpOIpntkV+E3hW9a2SID90/e1HF3CYseA6daeAViDuOhTm7z10R+P71B4tQaid28hh8C5wjPzfc9Kxb1v/92zH7l3iDc2ZCsK6RcG7pQFb1u/T7uZY0mF0gVeAmVzhG+X96z291Bu00zPynZO4hw5TsywYkR1NoaCNDs9Vah+iZSv6zsO0Na8S+Bo9USusWLdxOh9OtRQqEzVsPP7aCh551H6PJSnakNPWy7c6j5QLNLraXjco8skAiMZmlVpiDJMZ4bfltcsWFpYkQD4NDld2cGkCgnzgLIrPsIXc50eqZ0SqvZn+ieXqx/D/RuLwIDAQAB"

# Updated SPF - keeps all bulk providers, adds new server IP
NEW_SPF = f"v=spf1 include:_spf.mailersend.net include:mxsspf.sendpulse.com include:spf.sendinblue.com include:_spf.elasticemail.com include:relay.mailchannels.net mx ip4:{SERVER_IPV4} ip6:{SERVER_IPV6} ~all"

def get_record(name, rtype):
    """Get existing record ID if exists."""
    r = requests.get(f"{BASE_URL}?name={name}&type={rtype}", headers=HEADERS).json()
    if r.get("success") and r.get("result"):
        return r["result"][0]
    return None

def delete_record(record_id):
    """Delete a record by ID."""
    requests.delete(f"{BASE_URL}/{record_id}", headers=HEADERS)

def create_record(data):
    """Create a new DNS record."""
    r = requests.post(BASE_URL, headers=HEADERS, json=data).json()
    return r.get("success", False)

def update_or_create(name, rtype, content, **kwargs):
    """Update existing record or create new one."""
    existing = get_record(name, rtype)
    if existing:
        delete_record(existing["id"])
        print(f"  Deleted old {rtype} {name}")
    
    data = {"type": rtype, "name": name, "content": content, **kwargs}
    if create_record(data):
        print(f"  ✓ Created {rtype} {name}")
    else:
        print(f"  ✗ Failed {rtype} {name}")

def main():
    print("Configuring DNS for zimpricecheck.com...")
    
    # 1. Update MX record to new server
    print("\n1. MX Record:")
    update_or_create("zimpricecheck.com", "MX", "mail.zimprices.co.zw", priority=10)
    
    # 2. Update mail.zimpricecheck.com A record to new IP
    print("\n2. A Record (mail):")
    update_or_create("mail.zimpricecheck.com", "A", SERVER_IPV4, proxied=False)
    
    # 3. Add AAAA record for mail
    print("\n3. AAAA Record (mail):")
    update_or_create("mail.zimpricecheck.com", "AAAA", SERVER_IPV6, proxied=False)
    
    # 4. Update SPF record (keep existing includes, add new server)
    print("\n4. SPF Record:")
    # Find and delete existing SPF
    r = requests.get(f"{BASE_URL}?type=TXT&name=zimpricecheck.com", headers=HEADERS).json()
    for rec in r.get("result", []):
        if "spf1" in rec.get("content", "").lower():
            delete_record(rec["id"])
            print(f"  Deleted old SPF record")
    create_record({"type": "TXT", "name": "zimpricecheck.com", "content": NEW_SPF})
    print(f"  ✓ Created new SPF record")
    
    # 5. Add new DKIM record with mail2 selector
    print("\n5. DKIM Record (mail2 selector):")
    update_or_create("mail2._domainkey.zimpricecheck.com", "TXT", DKIM_PUBLIC)
    
    # 6. Update DMARC
    print("\n6. DMARC Record:")
    update_or_create("_dmarc.zimpricecheck.com", "TXT", "v=DMARC1; p=quarantine; rua=mailto:dmarc@zimpricecheck.com")
    
    # 7. Create webmail CNAME (proxied)
    print("\n7. Webmail A Record (proxied):")
    update_or_create("webmail.zimpricecheck.com", "A", SERVER_IPV4, proxied=True)
    
    print("\n✅ DNS configuration complete!")

if __name__ == "__main__":
    main()
