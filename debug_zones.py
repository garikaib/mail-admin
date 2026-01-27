import requests
import json

ACCOUNTS = [
    {"email": "gbdzoma@gmail.com", "key": "1533ad0374e2c05085374e4479e0004e9089d"},
    {"email": "garikaib@gmail.com", "key": "5f2e114ea312d7fe910251b60f62e43ff892f"}
]

for acc in ACCOUNTS:
    headers = {"X-Auth-Email": acc['email'], "X-Auth-Key": acc['key'], "Content-Type": "application/json"}
    try:
        r = requests.get("https://api.cloudflare.com/client/v4/zones", headers=headers)
        data = r.json()
        if data.get("success"):
            for z in data['result']:
                print(f"FOUND: {z['name']} | {z['id']} | {acc['email']}")
        else:
            print(f"FAILED for {acc['email']}: {data.get('errors')}")
    except Exception as e:
        print(f"ERROR for {acc['email']}: {str(e)}")
