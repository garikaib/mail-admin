import requests
import sys

print("Starting DMARC enforcement script...", file=sys.stderr)

ACCOUNTS = [
    {
        "email": "garikaib@gmail.com",
        "key": "5f2e114ea312d7fe910251b60f62e43ff892f",
        "domains": ["moretswana.com", "crystalcred.co.zw", "zimpricecheck.com", "hydrodrilling.co.zw", "chaspers.co.zw"]
    },
    {
        "email": "gbdzoma@gmail.com",
        "key": "c387a52124c3ece44c4c4e36a2964a152e86a",
        "domains": ["honeyscoop.co.zw", "rotvim.co.zw", "zimprices.co.zw"]
    }
]

def update_dmarc(email, key, domain):
    headers = {"X-Auth-Email": email, "X-Auth-Key": key, "Content-Type": "application/json"}
    print(f"Checking {domain}...")
    
    # 1. Get Zone ID
    try:
        r = requests.get(f"https://api.cloudflare.com/client/v4/zones?name={domain}", headers=headers).json()
        if not r.get("success") or not r["result"]:
            print(f"❌ Could not find Zone ID for {domain}: {r.get('errors')}")
            return
        
        zone_id = r["result"][0]["id"]
        base_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records"
        name = f"_dmarc.{domain}"
        content = f"v=DMARC1; p=reject; rua=mailto:dmarc@{domain}"
        
        # 2. Check for existing _dmarc record
        r = requests.get(f"{base_url}?name={name}&type=TXT", headers=headers).json()
        if r.get("success") and r.get("result"):
            record_id = r["result"][0]["id"]
            # Update existing
            u = requests.patch(f"{base_url}/{record_id}", headers=headers, json={"content": content}).json()
            if u.get("success"):
                print(f"✅ Updated DMARC for {domain} to REJECT")
            else:
                print(f"❌ Failed to update {domain}: {u.get('errors')}")
        else:
            # Create new
            c = requests.post(base_url, headers=headers, json={"type": "TXT", "name": name, "content": content}).json()
            if c.get("success"):
                print(f"✅ Created DMARC for {domain} with REJECT")
            else:
                print(f"❌ Failed to create {domain}: {c.get('errors')}")
    except Exception as e:
        print(f"ERROR processing {domain}: {str(e)}")

for acc in ACCOUNTS:
    print(f"\nProcessing account: {acc['email']}")
    for domain in acc['domains']:
        update_dmarc(acc['email'], acc['key'], domain)
