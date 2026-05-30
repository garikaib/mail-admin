#!/usr/bin/env python3
import json
import requests
import sys

# Cloudflare API Configuration
CF_API_URL = "https://api.cloudflare.com/client/v4"
DOMAIN = "chadzi.co.zw"
SECRETS_PATH = "/home/garikaib/Documents/zimprices_email/secrets/cloudflare/gbdzoma.json"

# Mail Server Details (matching CloudflareService constants)
MAIL_SERVER_HOST = "mail.zimprices.co.zw"
MAIL_SERVER_IP = "51.77.222.232"
MAIL_SERVER_IPV6 = "2001:41d0:305:2100::8406"

def get_creds():
    with open(SECRETS_PATH, "r") as f:
        return json.load(f)

def get_zone_id(headers):
    url = f"{CF_API_URL}/zones?name={DOMAIN}"
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    if data["success"] and data["result"]:
        return data["result"][0]["id"]
    return None

def create_dns_record(headers, zone_id, record):
    url = f"{CF_API_URL}/zones/{zone_id}/dns_records"
    resp = requests.post(url, headers=headers, json=record)
    data = resp.json()
    if not data["success"]:
        for err in data.get("errors", []):
            if "already exists" in err.get("message", "").lower():
                print(f"ℹ Record {record['type']} {record['name']} already exists.")
                return True
        print(f"✗ Failed to create {record['type']} record: {data}")
        return False
    print(f"✓ Created {record['type']} record for {record['name']}")
    return True

def main():
    creds = get_creds()
    headers = {
        "X-Auth-Email": creds["email"],
        "X-Auth-Key": creds["api_key"],
        "Content-Type": "application/json"
    }
    
    zone_id = get_zone_id(headers)
    if not zone_id:
        print(f"✗ Could not find zone for {DOMAIN}")
        sys.exit(1)
    
    print(f"Found zone_id {zone_id} for {DOMAIN}")
    
    records = [
        {
            "type": "MX",
            "name": DOMAIN,
            "content": MAIL_SERVER_HOST,
            "priority": 10,
            "proxied": False,
            "ttl": 3600
        },
        {
            "type": "TXT",
            "name": DOMAIN,
            "content": f"v=spf1 mx ip4:{MAIL_SERVER_IP} ip6:{MAIL_SERVER_IPV6} ~all",
            "proxied": False,
            "ttl": 3600
        },
        {
            "type": "TXT",
            "name": "_dmarc",
            "content": f"v=DMARC1; p=reject; rua=mailto:dmarc@{DOMAIN}",
            "proxied": False,
            "ttl": 3600
        },
        {
            "type": "CNAME",
            "name": "webmail",
            "content": MAIL_SERVER_HOST,
            "proxied": True, 
            "ttl": 1
        },
        {
            "type": "TXT",
            "name": "mail._domainkey",
            "content": "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApfy/RZ3JywHUwfw0eSGQ4fnj/A5k9Cr2Bw92nC6G22NH/1wYonzspQge6cSKEZm5SqnMwzh1wd1BaXG2C4GuajY3wmNRiW5KZFWfLP58qIfb5T9JX1xAMpRWRulmTyT+kTOErDuyGs0xlU6htdW/fQ9ovirVQCbk7D0hImGa/W6wIadk5ufIA0jpuMCafOd2kxCS4bV0uY2XfXfOJapXBx5GSP2GC+45aoL3itGtaxWEZrAb2l6Tsu/MOhdW1kFqA30zBx7pxTbYieoykRcJdmFVbmRD/D9P/3avdesUb2SP1y0ZH/l6dxVrVkWxo/Zz8GNcGsa2XO6AwCpqCor1CQIDAQAB",
            "proxied": False,
            "ttl": 3600
        },
    ]
    
    for rec in records:
        create_dns_record(headers, zone_id, rec)

if __name__ == "__main__":
    main()
