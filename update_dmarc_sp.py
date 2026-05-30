#!/usr/bin/env python3
import requests
import sys

ACCOUNTS = [
    {
        "email": "garikaib@gmail.com",
        "key": "5f2e114ea312d7fe910251b60f62e43ff892f"
    },
    {
        "email": "gbdzoma@gmail.com",
        "key": "c387a52124c3ece44c4c4e36a2964a152e86a"
    }
]

HOSTED_DOMAINS = [
    "chadzi.co.zw",
    "chaspers.co.zw",
    "crystalcred.co.zw",
    "growzimcapital.co.zw",
    "honeyscoop.co.zw",
    "hydrodrilling.co.zw",
    "hygienemax.co.zw",
    "moretswana.com",
    "rotvim.co.zw",
    "zimpricecheck.com",
    "zimprices.co.zw"
]

def get_zones(email, key):
    headers = {"X-Auth-Email": email, "X-Auth-Key": key, "Content-Type": "application/json"}
    zones = []
    url = "https://api.cloudflare.com/client/v4/zones?per_page=50"
    while url:
        r = requests.get(url, headers=headers).json()
        if not r.get("success"):
            print(f"❌ Failed to list zones for {email}: {r.get('errors')}")
            break
        zones.extend(r["result"])
        # Pagination check
        info = r.get("result_info", {})
        if info.get("page") < info.get("total_pages"):
            url = f"https://api.cloudflare.com/client/v4/zones?per_page=50&page={info.get('page') + 1}"
        else:
            url = None
    return zones

def update_dmarc(email, key, zone_id, domain):
    headers = {"X-Auth-Email": email, "X-Auth-Key": key, "Content-Type": "application/json"}
    base_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records"
    name = f"_dmarc.{domain}"
    # Setting both p=reject and sp=reject
    content = f"v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@{domain}"
    
    try:
        # Check for existing _dmarc record
        r = requests.get(f"{base_url}?name={name}&type=TXT", headers=headers).json()
        if r.get("success") and r.get("result"):
            record_id = r["result"][0]["id"]
            # Update existing
            u = requests.patch(f"{base_url}/{record_id}", headers=headers, json={"content": content}).json()
            if u.get("success"):
                print(f"✅ Updated DMARC for {domain} to REJECT (p=reject, sp=reject)")
            else:
                print(f"❌ Failed to update {domain}: {u.get('errors')}")
        else:
            # Create new
            c = requests.post(base_url, headers=headers, json={"type": "TXT", "name": name, "content": content}).json()
            if c.get("success"):
                print(f"✅ Created DMARC for {domain} with REJECT (p=reject, sp=reject)")
            else:
                print(f"❌ Failed to create {domain}: {c.get('errors')}")
    except Exception as e:
        print(f"ERROR processing {domain}: {str(e)}")

def main():
    for acc in ACCOUNTS:
        print(f"\nProcessing account: {acc['email']}")
        zones = get_zones(acc['email'], acc['key'])
        for zone in zones:
            domain = zone['name']
            if domain in HOSTED_DOMAINS:
                print(f"Found hosted domain {domain} in {acc['email']}")
                update_dmarc(acc['email'], acc['key'], zone['id'], domain)

if __name__ == "__main__":
    main()
