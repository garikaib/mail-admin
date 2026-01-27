#!/usr/bin/env python3
import requests

# Account 1: zimprices.co.zw
CF_ACCOUNT_1 = {
    "email": "gbdzoma@gmail.com",
    "key": "c387a52124c3ece44c4c4e36a2964a152e86a",
    "zone_id": "21d8b65b9fb185403cfb9eaf914fb488",
    "domain": "zimprices.co.zw"
}

# Account 2: moretswana.com & crystalcred.co.zw
CF_ACCOUNT_2 = {
    "email": "garikaib@gmail.com",
    "key": "5f2e114ea312d7fe910251b60f62e43ff892f",
    "zones": {
        "moretswana.com": "c7f8d99a33f491ac4c8319e5bbf649a6",
        "crystalcred.co.zw": "c80ff13cd6fb728b36c57d124b128f4c"
    }
}

def update_record(account, domain, name, content, r_type="CNAME", proxied=True):
    headers = {
        "X-Auth-Email": account["email"],
        "X-Auth-Key": account["key"],
        "Content-Type": "application/json"
    }
    zone_id = account["zone_id"] if "zone_id" in account else account["zones"][domain]
    base_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records"
    
    # Check if record exists
    r = requests.get(f"{base_url}?name={name}", headers=headers).json()
    if r.get("success") and r.get("result"):
        record_id = r["result"][0]["id"]
        # Update existing
        data = {"type": r_type, "name": name, "content": content, "proxied": proxied}
        u = requests.put(f"{base_url}/{record_id}", headers=headers, json=data).json()
        if u.get("success"):
            print(f"✓ Updated {name} to proxied={proxied}")
        else:
            print(f"✗ Failed to update {name}: {u.get('errors')}")
    else:
        # Create new
        data = {"type": r_type, "name": name, "content": content, "proxied": proxied}
        c = requests.post(base_url, headers=headers, json=data).json()
        if c.get("success"):
            print(f"✓ Created {name} with proxied={proxied}")
        else:
            print(f"✗ Failed to create {name}: {c.get('errors')}")

def main():
    # 1. webmail.zimprices.co.zw
    update_record(CF_ACCOUNT_1, "zimprices.co.zw", "webmail.zimprices.co.zw", "mail.zimprices.co.zw")
    
    # 2. webmail.moretswana.com
    update_record(CF_ACCOUNT_2, "moretswana.com", "webmail.moretswana.com", "mail.zimprices.co.zw")
    
    # 3. webmail.crystalcred.co.zw
    update_record(CF_ACCOUNT_2, "crystalcred.co.zw", "webmail.crystalcred.co.zw", "mail.zimprices.co.zw")

if __name__ == "__main__":
    main()
