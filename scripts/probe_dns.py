import requests
import json
import sys

# Credentials
EMAIL = "gbdzoma@gmail.com"
KEY = "c387a52124c3ece44c4c4e36a2964a152e86a"
HEADERS = {
    "X-Auth-Email": EMAIL, 
    "X-Auth-Key": KEY, 
    "Content-Type": "application/json"
}
DOMAIN = "honeyscoop.co.zw"

def run():
    print(f"Probing Cloudflare for {DOMAIN}...")
    
    # 1. Get Zone ID
    try:
        r1 = requests.get(f"https://api.cloudflare.com/client/v4/zones?name={DOMAIN}", headers=HEADERS)
        r1.raise_for_status()
        d1 = r1.json()
    except Exception as e:
        print(f"Error fetching zone: {e}")
        return

    if not d1.get("success"):
        print("Zone fetch API error:", d1)
        return
    
    if not d1["result"]:
        print("No zone found for domain.")
        return

    zone_id = d1["result"][0]["id"]
    print(f"Zone ID: {zone_id}")

    # 2. Get Records
    try:
        r2 = requests.get(f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records", headers=HEADERS)
        r2.raise_for_status()
        d2 = r2.json()
    except Exception as e:
        print(f"Error fetching records: {e}")
        return

    if not d2.get("success"):
        print("Records fetch API error:", d2)
        return

    records = d2["result"]
    print(f"Found {len(records)} records:")
    print("-" * 60)
    print(f"{'TYPE':<6} | {'NAME':<30} | {'CONTENT':<40} | {'PROXY'}")
    print("-" * 60)
    
    for r in records:
        rtype = r.get("type", "UNKNOWN")
        rname = r.get("name", "")
        rcontent = r.get("content", "")
        rproxy = r.get("proxied", False)
        
        # Truncate content for display
        if len(rcontent) > 40:
            rcontent = rcontent[:37] + "..."
            
        print(f"{rtype:<6} | {rname:<30} | {rcontent:<40} | {rproxy}")

if __name__ == "__main__":
    run()
