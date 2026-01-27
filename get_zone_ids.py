import requests

ACCOUNTS = [
    {"email": "gbdzoma@gmail.com", "key": "1533ad0374e2c05085374e4479e0004e9089d"},
    {"email": "garikaib@gmail.com", "key": "5f2e114ea312d7fe910251b60f62e43ff892f"}
]

def get_zones(email, key):
    headers = {"X-Auth-Email": email, "X-Auth-Key": key, "Content-Type": "application/json"}
    r = requests.get("https://api.cloudflare.com/client/v4/zones?per_page=50", headers=headers).json()
    if r.get("success"):
        for zone in r["result"]:
            print(f"{zone['name']}|{zone['id']}|{email}|{key}")

if __name__ == '__main__':
    for acc in ACCOUNTS:
        get_zones(acc['email'], acc['key'])
