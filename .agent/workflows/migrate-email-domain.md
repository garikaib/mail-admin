---
description: Migrate email domain from cPanel shared hosting to zimprices mail server
---

# Email Domain Migration Workflow

This workflow migrates an email domain from `revision@nlshared8.ramnode.com` (cPanel shared hosting) to `ubuntu@51.77.222.232` (zimprices mail server).

## Prerequisites
- SSH access to both servers (already configured with key auth)
- Cloudflare API credentials (global key or zone token)
- Domain must be on Cloudflare

## Variables (Set Before Starting)
```bash
DOMAIN="example.com"                    # Target domain to migrate
CF_ZONE_ID="your_zone_id"               # Cloudflare Zone ID
CF_EMAIL="garikaib@gmail.com"           # Cloudflare account email
CF_API_KEY="your_global_api_key"        # Cloudflare global API key
```

---

## Step 1: Discover Users on Source Server
// turbo
```bash
ssh revision@nlshared8.ramnode.com "ls -F mail/$DOMAIN/"
```
Note the usernames returned (e.g., info/, sales/, admin/).

---

## Step 2: Get Cloudflare Zone ID
// turbo
```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_API_KEY" \
  -H "Content-Type: application/json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d['result'] else 'NOT_FOUND')"
```
Save the Zone ID to `CF_ZONE_ID`.

---

## Step 3: Create Zone API Token for Lego SSL
// turbo
```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_API_KEY" \
  -H "Content-Type: application/json" \
  --data "{
    \"name\": \"Lego SSL - $DOMAIN\",
    \"policies\": [{
      \"effect\": \"allow\",
      \"resources\": {\"com.cloudflare.api.account.zone.$CF_ZONE_ID\": \"*\"},
      \"permission_groups\": [
        {\"id\": \"4755a26eedb94da69e1066d98aa820be\", \"name\": \"Zone Read\"},
        {\"id\": \"c8fed203ed3043cba015a93ad1616f1f\", \"name\": \"DNS Write\"}
      ]
    }]
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('value','ERROR'))"
```
Save the token for SSL renewal.

---

## Step 4: Create Migration Script on Target Server
Create `/home/ubuntu/migrate_DOMAIN.py` with the discovered users:

```python
#!/usr/bin/env python3
import os, subprocess, secrets, string, pymysql

DB_HOST, DB_USER, DB_NAME = "localhost", "mailuser", "mailserver"
VMAIL_BASE, DOMAIN = "/var/vmail", "REPLACE_WITH_DOMAIN"
USERS = ["user1", "user2", "user3"]  # Replace with discovered users

def get_db_password():
    with open("/etc/dovecot/dovecot-sql.conf.ext") as f:
        for line in f:
            if "password=" in line: return line.split("password=")[1].strip().strip('"')

def generate_password(length=20):
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        pw = ''.join(secrets.choice(alphabet) for _ in range(length))
        if all([any(c.islower() for c in pw), any(c.isupper() for c in pw),
                any(c.isdigit() for c in pw), any(c in "!@#$%&*" for c in pw)]): return pw

def hash_password(pw):
    r = subprocess.run(["doveadm","pw","-s","SHA512-CRYPT","-p",pw], capture_output=True, text=True, check=True)
    return r.stdout.strip()

def main():
    conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=get_db_password(),
                           database=DB_NAME, cursorclass=pymysql.cursors.DictCursor)
    with conn.cursor() as c:
        c.execute("SELECT id FROM domains WHERE name=%s", (DOMAIN,))
        if not c.fetchone():
            c.execute("INSERT INTO domains (name) VALUES (%s)", (DOMAIN,))
            conn.commit(); print(f"✓ Domain {DOMAIN} added")
        c.execute("SELECT id FROM domains WHERE name=%s", (DOMAIN,))
        domain_id = c.fetchone()['id']
    
    with open(os.path.expanduser(f"~/{DOMAIN.replace('.','_')}_passwords.txt"), "w") as f:
        f.write(f"# Passwords for {DOMAIN}\n\n")
        for user in USERS:
            email = f"{user}@{DOMAIN}"
            with conn.cursor() as c:
                c.execute("SELECT 1 FROM users WHERE mail=%s", (email,))
                if c.fetchone(): print(f"⚠ {email} exists"); continue
            pw = generate_password(); pw_hash = hash_password(pw)
            with conn.cursor() as c:
                c.execute("INSERT INTO users (c_uid,c_name,c_password,c_cn,mail,domain_id) VALUES (%s,%s,%s,%s,%s,%s)",
                          (email, email, pw_hash, user, email, domain_id))
            conn.commit()
            mdir = f"{VMAIL_BASE}/{DOMAIN}/{user}"
            subprocess.run(["mkdir","-p",mdir], check=True)
            subprocess.run(["chown","-R","vmail:vmail",f"{VMAIL_BASE}/{DOMAIN}"], check=True)
            f.write(f"{email}: {pw}\n"); print(f"✓ Created {email}")
    conn.close()

if __name__ == "__main__": main()
```

Upload and run:
```bash
scp migrate_DOMAIN.py ubuntu@51.77.222.232:~/
ssh ubuntu@51.77.222.232 "sudo python3 ~/migrate_DOMAIN.py"
```

---

## Step 5: Sync Maildir Data
```bash
ssh ubuntu@51.77.222.232 "rsync -avz revision@nlshared8.ramnode.com:mail/$DOMAIN/ /tmp/${DOMAIN}_mail/"
ssh ubuntu@51.77.222.232 "sudo cp -r /tmp/${DOMAIN}_mail/* /var/vmail/$DOMAIN/ && sudo chown -R vmail:vmail /var/vmail/$DOMAIN/ && rm -rf /tmp/${DOMAIN}_mail"
```

---

## Step 6: Generate SSL Certificates
```bash
ssh ubuntu@51.77.222.232 "sudo CLOUDFLARE_DNS_API_TOKEN='YOUR_ZONE_TOKEN' lego --email gbdzoma@gmail.com --dns cloudflare --domains '$DOMAIN' --domains '*.$DOMAIN' --path /etc/lego run"
```

---

## Step 7: Generate DKIM Key
```bash
ssh ubuntu@51.77.222.232 "sudo rspamadm dkim_keygen -s mail -d $DOMAIN -b 2048 -k /var/lib/rspamd/dkim/$DOMAIN.key"
ssh ubuntu@51.77.222.232 "sudo chown _rspamd:_rspamd /var/lib/rspamd/dkim/$DOMAIN.key && sudo chmod 640 /var/lib/rspamd/dkim/$DOMAIN.key"
```
**Copy the public key output** (the TXT record value starting with `v=DKIM1;`).

---

## Step 8: Update Rspamd DKIM Config
Add to `/etc/rspamd/local.d/dkim_signing.conf`:
```
domain {
    DOMAIN {
        path = "/var/lib/rspamd/dkim/DOMAIN.key";
        selector = "mail";
    }
}
```

---

## Step 9: Create Nginx Webmail VHost
Create `/etc/nginx/sites-available/webmail.$DOMAIN`:
```nginx
server {
    listen 80;
    server_name webmail.$DOMAIN;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name webmail.$DOMAIN;
    ssl_certificate /etc/lego/certificates/$DOMAIN.crt;
    ssl_certificate_key /etc/lego/certificates/$DOMAIN.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://127.0.0.1:20000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header x-webobjects-server-url https://$host;
        client_max_body_size 50m;
    }
}
```
Enable and reload:
```bash
sudo ln -sf /etc/nginx/sites-available/webmail.$DOMAIN /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx rspamd
```

---

## Step 10: Configure Cloudflare DNS Records
Required DNS records:
| Type | Name | Value | Proxied |
|------|------|-------|---------|
| MX | @ | mail.zimprices.co.zw (priority 10) | No |
| A | mail | 51.77.222.232 | No |
| AAAA | mail | 2001:41d0:305:2100::8406 | No |
| CNAME | webmail | mail.zimprices.co.zw | No |
| TXT | @ | v=spf1 mx ip4:51.77.222.232 ip6:2001:41d0:305:2100::8406 ~all | - |
| TXT | mail._domainkey | v=DKIM1; k=rsa; p=YOUR_DKIM_PUBLIC_KEY | - |
| TXT | _dmarc | v=DMARC1; p=quarantine; rua=mailto:dmarc@$DOMAIN | - |

---

## Step 11: Set Cloudflare SSL Mode to Strict
// turbo
```bash
curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings/ssl" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_API_KEY" \
  -H "Content-Type: application/json" --data '{"value":"strict"}'
```

---

## Step 12: Check for Forwarders (Optional)
```bash
ssh revision@nlshared8.ramnode.com "cat /etc/valiases/$DOMAIN 2>/dev/null"
ssh revision@nlshared8.ramnode.com "for u in USER_LIST; do cat ~/mail/$DOMAIN/\$u/.forward 2>/dev/null; done"
```
If forwarders exist, add them to the `aliases` table in MariaDB.

---

## Verification Checklist
- [ ] `dig MX $DOMAIN +short` returns `mail.zimprices.co.zw`
- [ ] `dig TXT $DOMAIN +short` shows SPF record
- [ ] `dig TXT mail._domainkey.$DOMAIN +short` shows DKIM key
- [ ] `curl -sI https://webmail.$DOMAIN/` returns 302 (SOGo redirect)
- [ ] Test login at https://webmail.$DOMAIN with new credentials
- [ ] Send/receive test email
