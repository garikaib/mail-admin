#!/usr/bin/env python3
import requests

ZONE_ID = "c80ff13cd6fb728b36c57d124b128f4c"
API_KEY = "5f2e114ea312d7fe910251b60f62e43ff892f"
EMAIL = "garikaib@gmail.com"
HEADERS = {"X-Auth-Email": EMAIL, "X-Auth-Key": API_KEY, "Content-Type": "application/json"}
BASE_URL = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"

SERVER_IPV4 = "51.77.222.232"
SERVER_IPV6 = "2001:41d0:305:2100::8406"
DKIM_PUBLIC = "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuP3xqBG8LyR5Xu4EyxFAfkRcrajafbq/UPyWMAo8dVRlO01tk2M5enxsRVtaah9R1dGxHsXlTQj3PsOLrZPSYBjFJJNMhE9yZ6V3a3I+aT1Xneu5P7ZSfnY+pXgpKViekuEfiv8+UUWoRZd6FJZEIjj6cgfS2uL87S/SK8IfgpTbCKDJq7drGuPPjkbXMlLSUnw6EAmZ1krVrBUOJE2gNGKPn71lj+zmFXKY7ElRp2vQa3Lr1XPTrilETfmesNMjt6jromnSjBWnrhAJYpI5MS96AcMgIeQCyImiy8F7LEzekeZ6a91jL4wYKycClX4S4eJrKl3t5JdJeWn6XWCQowIDAQAB"

RECORDS = [
    {"type": "MX", "name": "@", "content": "mail.zimprices.co.zw", "priority": 10},
    {"type": "TXT", "name": "@", "content": f"v=spf1 mx ip4:{SERVER_IPV4} ip6:{SERVER_IPV6} ~all"},
    {"type": "TXT", "name": "mail._domainkey", "content": DKIM_PUBLIC},
    {"type": "TXT", "name": "_dmarc", "content": "v=DMARC1; p=quarantine; rua=mailto:dmarc@crystalcred.co.zw"},
    {"type": "A", "name": "mail", "content": SERVER_IPV4, "proxied": False},
    {"type": "AAAA", "name": "mail", "content": SERVER_IPV6, "proxied": False},
    {"type": "CNAME", "name": "webmail", "content": "mail.zimprices.co.zw", "proxied": False}
]

def main():
    existing = requests.get(BASE_URL, headers=HEADERS).json()["result"]
    for record in RECORDS:
        full_name = "crystalcred.co.zw" if record["name"] == "@" else f"{record['name']}.crystalcred.co.zw"
        for r in existing:
            if r["name"] == full_name and r["type"] == record["type"]:
                requests.delete(f"{BASE_URL}/{r['id']}", headers=HEADERS)
                print(f"Deleted {r['type']} {full_name}")
        requests.post(BASE_URL, headers=HEADERS, json=record)
        print(f"Created {record['type']} {full_name}")

if __name__ == "__main__": main()
