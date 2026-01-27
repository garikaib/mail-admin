#!/usr/bin/env python3
"""
Configure Cloudflare DNS records for moretswana.com email migration.
"""
import sys
import requests

ZONE_ID = "c7f8d99a33f491ac4c8319e5bbf649a6"
API_KEY = "5f2e114ea312d7fe910251b60f62e43ff892f"
EMAIL = "garikaib@gmail.com"
HEADERS = {
    "X-Auth-Email": EMAIL,
    "X-Auth-Key": API_KEY,
    "Content-Type": "application/json"
}
BASE_URL = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"

# Server IPs
SERVER_IPV4 = "51.77.222.232"
SERVER_IPV6 = "2001:41d0:305:2100::8406"

# DKIM public key (from rspamadm output)
DKIM_PUBLIC = "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1VrS2KDCP2wxSXSmp3D1iszlbJWL96OTN4DP5iCqSFu/+a4a73Ykz2rR2Duaosm7a/5yijHlYLH65MSf3x0vab8RHpUWKGzl7wcm3cxVzAzj6krrDHHOYosJ+rzP5hlGkEGikdaorPcA1OoUFxIsX9ei+2EhK89yOsF1cq5c1nR6HvtGS/Uo0ueQRg9KKZe3H62mPxWZScrB32w+Nn+QCP47KTlOVlQLflS1FUjvZCZmN/t34uzX/731dORGoxgZVaRRwZvE/ZAzPfwU65VnhNblc+jpN6piNBDGenuTkDqVBGolpJY8YtlGbMnZYxJGB6ov3UdaHiIo23w0JCHjkQIDAQAB"

RECORDS = [
    # MX Record
    {
        "type": "MX",
        "name": "@",
        "content": "mail.zimprices.co.zw",
        "priority": 10,
        "proxied": False
    },
    # CNAME for webmail
    {
        "type": "CNAME", 
        "name": "webmail",
        "content": "mail.zimprices.co.zw",
        "proxied": True  # Proxied through Cloudflare
    },
    # SPF Record
    {
        "type": "TXT",
        "name": "@",
        "content": f"v=spf1 mx ip4:{SERVER_IPV4} ip6:{SERVER_IPV6} ~all"
    },
    # DKIM Record
    {
        "type": "TXT",
        "name": "mail._domainkey",
        "content": DKIM_PUBLIC
    },
    # DMARC Record
    {
        "type": "TXT", 
        "name": "_dmarc",
        "content": "v=DMARC1; p=quarantine; rua=mailto:dmarc@moretswana.com"
    },
    # A record for mail subdomain (for client configuration)
    {
        "type": "A",
        "name": "mail",
        "content": SERVER_IPV4,
        "proxied": False
    },
    # AAAA record for mail subdomain
    {
        "type": "AAAA",
        "name": "mail",
        "content": SERVER_IPV6,
        "proxied": False
    }
]

def get_existing_records():
    """Get existing DNS records."""
    resp = requests.get(BASE_URL, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()["result"]

def delete_record(record_id, name, record_type):
    """Delete a DNS record."""
    resp = requests.delete(f"{BASE_URL}/{record_id}", headers=HEADERS)
    if resp.ok:
        print(f"  🗑️  Deleted existing {record_type} record for {name}")
    return resp.ok

def create_record(record):
    """Create a DNS record."""
    resp = requests.post(BASE_URL, headers=HEADERS, json=record)
    data = resp.json()
    if data.get("success"):
        print(f"  ✅ Created {record['type']} record: {record['name']} -> {record['content'][:50]}...")
        return True
    else:
        print(f"  ❌ Failed to create {record['type']} for {record['name']}: {data.get('errors')}")
        return False

def main():
    print("=" * 60)
    print("  Configuring Cloudflare DNS for moretswana.com")
    print("=" * 60 + "\n")
    
    # Get existing records
    existing = get_existing_records()
    existing_map = {}
    for r in existing:
        key = (r["name"], r["type"])
        if key not in existing_map:
            existing_map[key] = []
        existing_map[key].append(r)
    
    print(f"Found {len(existing)} existing DNS records\n")
    
    for record in RECORDS:
        name = record["name"]
        if name == "@":
            full_name = "moretswana.com"
        else:
            full_name = f"{name}.moretswana.com"
        
        record_type = record["type"]
        key = (full_name, record_type)
        
        # Delete existing records of same name/type if they exist
        if key in existing_map:
            for existing_rec in existing_map[key]:
                delete_record(existing_rec["id"], full_name, record_type)
        
        # Create new record
        create_record(record)
    
    print("\n" + "=" * 60)
    print("  ✅ DNS Configuration Complete!")
    print("=" * 60)
    print("\nNote: DNS propagation may take a few minutes.")
    print("Test with: dig MX moretswana.com")

if __name__ == "__main__":
    main()
