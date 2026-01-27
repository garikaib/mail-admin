#!/usr/bin/env python3
"""Configure Cloudflare DNS for hydrodrilling.co.zw."""
import requests

ZONE_ID = "7091cdc4e79b22bb40b0a923d1262568"
API_KEY = "5f2e114ea312d7fe910251b60f62e43ff892f"
EMAIL = "garikaib@gmail.com"
HEADERS = {"X-Auth-Email": EMAIL, "X-Auth-Key": API_KEY, "Content-Type": "application/json"}
BASE_URL = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"

SERVER_IPV4 = "51.77.222.232"
SERVER_IPV6 = "2001:41d0:305:2100::8406"

DKIM_PUBLIC = "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxHc1PAf09YTkdvnvlqf7k/jBmQfoKtDQchlsJF/irIE9rOnme1dno0RRFrDPnLV26zL69RCcmxzgq9b26YQn29n6TSxljCvk/TJ9zRy5QtHNBg9/NJsTQgObSiqeMUadFbzdr6WTz8ufW+vKrvFz9DLaimyMLbaLFeuyiCPTUpitYlFucz68EMOCNdOkN4w/A53sKViDnWr3xaRY2qWmMhj/pJ+DYqJEHePtubY1PH8zl/k9wVRyxE9CMmJUOBJAYByDmdnLfXKGJH8CgqvSU0W4Z2DHqrVC3Rh8mwe0CxaUAcPB1+C2JNodc23bBClxVmF0oONETEsxO81bJuu7BQIDAQAB"

def get_record(name, rtype):
    r = requests.get(f"{BASE_URL}?name={name}&type={rtype}", headers=HEADERS).json()
    if r.get("success") and r.get("result"):
        return r["result"][0]
    return None

def delete_record(record_id):
    requests.delete(f"{BASE_URL}/{record_id}", headers=HEADERS)

def create_record(data):
    return requests.post(BASE_URL, headers=HEADERS, json=data).json().get("success", False)

def update_or_create(name, rtype, content, **kwargs):
    existing = get_record(name, rtype)
    if existing:
        delete_record(existing["id"])
        print(f"  Deleted old {rtype} {name}")
    if create_record({"type": rtype, "name": name, "content": content, **kwargs}):
        print(f"  ✓ Created {rtype} {name}")
    else:
        print(f"  ✗ Failed {rtype} {name}")

def main():
    print("Configuring DNS for hydrodrilling.co.zw...")
    
    print("\n1. MX Record:")
    update_or_create("hydrodrilling.co.zw", "MX", "mail.zimprices.co.zw", priority=10)
    
    print("\n2. A Record (mail):")
    update_or_create("mail.hydrodrilling.co.zw", "A", SERVER_IPV4, proxied=False)
    
    print("\n3. AAAA Record (mail):")
    update_or_create("mail.hydrodrilling.co.zw", "AAAA", SERVER_IPV6, proxied=False)
    
    print("\n4. SPF Record:")
    r = requests.get(f"{BASE_URL}?type=TXT&name=hydrodrilling.co.zw", headers=HEADERS).json()
    for rec in r.get("result", []):
        if "spf1" in rec.get("content", "").lower():
            delete_record(rec["id"]); print("  Deleted old SPF")
    create_record({"type": "TXT", "name": "hydrodrilling.co.zw", "content": f"v=spf1 mx ip4:{SERVER_IPV4} ip6:{SERVER_IPV6} ~all"})
    print("  ✓ Created SPF")
    
    print("\n5. DKIM Record:")
    update_or_create("mail._domainkey.hydrodrilling.co.zw", "TXT", DKIM_PUBLIC)
    
    print("\n6. DMARC Record:")
    update_or_create("_dmarc.hydrodrilling.co.zw", "TXT", "v=DMARC1; p=quarantine; rua=mailto:dmarc@hydrodrilling.co.zw")
    
    print("\n7. Webmail A Record (proxied):")
    update_or_create("webmail.hydrodrilling.co.zw", "A", SERVER_IPV4, proxied=True)
    
    print("\n✅ DNS configuration complete!")

if __name__ == "__main__": main()
