#!/usr/bin/env python3
"""Configure Cloudflare DNS for rotvim.co.zw."""
import requests, json

DOMAIN = "rotvim.co.zw"
ZONE_ID = "f75806dd7a469fe5baa3aef8472c6a6f"
with open("secrets/cloudflare/gbdzoma.json") as f:
    creds = json.load(f)
CF_EMAIL = creds["email"]
CF_API_KEY = creds["api_key"]

HEADERS = {"X-Auth-Email": CF_EMAIL, "X-Auth-Key": CF_API_KEY, "Content-Type": "application/json"}
BASE_URL = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"

SERVER_IPV4 = "51.77.222.232"
SERVER_IPV6 = "2001:41d0:305:2100::8406"

# Common DKIM for this server
DKIM_PUBLIC = "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxHc1PAf09YTkdvnvlqf7k/jBmQfoKtDQchlsJF/irIE9rOnme1dno0RRFrDPnLV26zL69RCcmxzgq9b26YQn29n6TSxljCvk/TJ9zRy5QtHNBg9/NJsTQgObSiqeMUadFbzdr6WTz8ufW+vKrvFz9DLaimyMLbaLFeuyiCPTUpitYlFucz68EMOCNdOkN4w/A53sKViDnWr3xaRY2qWmMhj/pJ+DYqJEHePtubY1PH8zl/k9wVRyxE9CMmJUOBJAYByDmdnLfXKGJH8CgqvSU0W4Z2DHqrVC3Rh8mwe0CxaUAcPB1+C2JNodc23bBClxVmF0oONETEsxO81bJuu7BQIDAQAB"

def get_existing_records():
    r = requests.get(BASE_URL, headers=HEADERS).json()
    if r.get("success"):
        return r["result"]
    return []

def delete_record(record_id):
    requests.delete(f"{BASE_URL}/{record_id}", headers=HEADERS)

def create_record(data):
    return requests.post(BASE_URL, headers=HEADERS, json=data).json()

def main():
    print("Configuring DNS for rotvim.co.zw...")
    
    existing = get_existing_records()
    print(f"Found {len(existing)} existing records. Deleting them to start fresh...")
    for rec in existing:
        delete_record(rec["id"])
        print(f"  - Deleted {rec['type']} {rec['name']}")

    records = [
        # 1. Wildcard A record
        {"type": "A", "name": "*", "content": SERVER_IPV4, "proxied": False},
        
        # 2. Main A record
        {"type": "A", "name": "rotvim.co.zw", "content": SERVER_IPV4, "proxied": False},
        
        # 3. MX Record
        {"type": "MX", "name": "rotvim.co.zw", "content": "mail.zimprices.co.zw", "priority": 10},
        
        # 4. Webmail CNAME (proxied)
        {"type": "CNAME", "name": "webmail", "content": "mail.zimprices.co.zw", "proxied": True},
        
        # 5. SPF Record
        {"type": "TXT", "name": "rotvim.co.zw", "content": f"v=spf1 mx ip4:{SERVER_IPV4} ip6:{SERVER_IPV6} ~all"},
        
        # 6. DKIM Record
        {"type": "TXT", "name": "mail._domainkey", "content": DKIM_PUBLIC},
        
        # 7. DMARC Record
        {"type": "TXT", "name": "_dmarc", "content": f"v=DMARC1; p=quarantine; rua=mailto:dmarc@{DOMAIN}"}
    ]

    for data in records:
        r = create_record(data)
        if r.get("success"):
            print(f" ✓ Created {data['type']} {data['name']}")
        else:
            print(f" ✗ Failed {data['type']} {data['name']}: {r.get('errors')}")

    print("\n✅ DNS configuration complete!")

if __name__ == "__main__":
    main()
