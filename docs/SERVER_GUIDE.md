# zimprices.co.zw Mail Server: Technical Blueprint

This document provide a thorough description of the custom "bare-metal" mail server architecture, security framework, and operational procedures.

---

## 🏗️ The Technology Stack

| Component | Software | Role |
|-----------|----------|------|
| **OS** | Ubuntu 24.04 (Noble) | Core Operating System |
| **MTA** | Postfix | SMTP Transfer Agent (Sending/Receiving) |
| **MDA** | Dovecot | Delivery Agent & IMAP/POP3 Server |
| **Filtering** | Rspamd | Spam Filtering, DKIM Signing, DMARC Checks |
| **Webmail** | SOGo | Modern Web Interface, CalDAV, CardDAV |
| **Database** | MariaDB | Storage for Users, Domains, and SOGo Data |
| **Cache** | Redis | Rspamd high-speed storage (Bayes, Reputation) |
| **Proxy** | Nginx | Reverse Proxy & SSL Termination for SOGo |
| **SSL** | Lego | Let's Encrypt Wildcard Certs (Cloudflare DNS) |

---

## 🔑 Access Requirements

To perform administrative tasks on the server, the following is required:

- **Remote User**: `ubuntu`
- **Authentication**: SSH Keys (Password authentication is disabled).
- **Permissions**: `sudo` privileges are required for all configuration changes and service restarts.
- **SSH Command**: `ssh ubuntu@51.77.222.232`

---

## 📨 Mail Flow & Architecture

### 📥 Inbound Mail (Receiving)
1.  **Arrival**: Mail arrives at Postfix on port 25.
2.  **Authentication Check**: Postfix queries MariaDB to verify if the domain and user exist.
3.  **Milter Interaction**: Postfix passes the mail to **Rspamd** via Milter protocol.
    *   Rspamd checks SPF, DKIM, DMARC, DNSBLs, and Bayesian filters.
    *   Rspamd assigns a score and returns an action (Accept, Add Header, Reject).
4.  **Handoff**: Postfix hands valid mail to **Dovecot** via **LMTP** (Local Mail Transport Protocol).
5.  **Storage**: Dovecot saves the mail in `maildir` format at `/var/vmail/zimprices.co.zw/username/`.

### 📤 Outbound Mail (Sending)
1.  **Submission**: A client (SOGo or Outlook) connects via PORT 587 (STARTTLS) or 465 (SSL).
2.  **SASL Auth**: Dovecot provides authentication services to Postfix (querying MariaDB).
3.  **Signing**: Postfix passes the mail to **Rspamd**. Rspamd adds the **DKIM Signature**.
4.  **Delivery**: Postfix resolves the destination MX and sends the mail to the internet.

---

## 🛡️ Security Framework

### 1. Network & Firewall (UFW)
- **Direct Access**: Ports 25, 587, 465, 993, 110, 80 are open to the world.
- **Proxied Access**: Port 443 (HTTPS) is **restricted**. It only accepts traffic from **Cloudflare IP ranges**. This prevents attackers from hitting the server bypassing the WAF.
- **Daily Sync**: A cron job (`ufw-cloudflare-sync`) updates these IP ranges daily.

### 2. Brute Force Protection (Fail2Ban)
- Monitors logs for SSH, Postfix, and Dovecot.
- Automatically bans IPs after 5 failed login attempts for 1 hour.

### 3. Email Authentication
- **SPF**: Explicitly allows the server's IPv4 and IPv6.
- **DKIM**: 2048-bit RSA keys managed by Rspamd.
- **DMARC**: Hardened enforcement. We strictly respect `p=reject` and `p=quarantine` from external domains.

### 4. Encryption
- **SSL**: Wildcard certificates managed via Cloudflare DNS-01 challenge.
- **Transport**: Modern TLS 1.2 and 1.3 enforced. Older, insecure protocols (SSLv3, TLS 1.0) are disabled.

---

## ⚙️ Operational Management

### 👤 User Management
All users are stored in the `mailserver` database in MariaDB.
- **Admin Tool**: Use the included `./mail-admin.sh` script.
- **Features**: List users, Add users, Update passwords (policy-compliant), Delete users.
- **Password Policy**: Minimum 16 characters, mix of upper/lower/digit/special.

### 🧹 Automated Maintenance
| Task | Frequency | Script Path |
|------|-----------|-------------|
| **SSL Renewal** | Weekly (Sun 3 AM) | `/usr/local/bin/renew_ssl.sh` |
| **CF IP Sync** | Daily (4:30 AM) | `/usr/local/bin/update_ufw_cloudflare.sh`|
| **Health Check** | Manual/Anytime | `python3 health_check.py` |

---

## 🛠️ Troubleshooting Commands

### View Logs
```bash
# General Mail Logs
tail -f /var/log/mail.log

# SOGo Logs
tail -f /var/log/sogo/sogo.log

# Rspamd Logs
tail -f /var/log/rspamd/rspamd.log
```

### Service Control
```bash
sudo systemctl status [postfix|dovecot|rspamd|sogo|nginx|mariadb]
sudo systemctl restart postfix dovecot rspamd sogo nginx
```

### Database Access
```bash
sudo mariadb -u mailuser -p mailserver
```

---

## 📁 Directory Structure
- `/etc/postfix/`: MTA configuration.
- `/etc/dovecot/`: IMAP/Auth configuration.
- `/etc/rspamd/`: Filtering rules and local modules.
- `/etc/lego/`: SSL certificates.

---

## 🛠️ Service Configuration Details

This section details the specific configuration files and logic for each component of the stack.

### 1. Postfix (SMTP MTA)
- **Main Config**: `/etc/postfix/main.cf`
    - Defines hostname, SSL certs, and relay restrictions.
    - Points to MySQL maps for virtual delivery.
- **Master Config**: `/etc/postfix/master.cf`
    - Configures port 25, 587 (submission), and 465 (smtps).
    - Links to Rspamd via Milter: `smtpd_milters = inet:localhost:11332`.
- **MySQL Lookups**:
    - `/etc/postfix/mysql-virtual-mailbox-domains.cf`: Queries if a domain is handled by the server.
    - `/etc/postfix/mysql-virtual-mailbox-maps.cf`: Queries if a user/email address exists.
    - `/etc/postfix/mysql-virtual-alias-maps.cf`: Handles email aliases/forwarding.

### 2. Dovecot (IMAP/LMTP MDA)
- **Core Config**: `/etc/dovecot/dovecot.conf`
- **Mail Location**: `/etc/dovecot/conf.d/10-mail.conf`
    - `mail_location = maildir:/var/vmail/%d/%n` - Stores mail as individual files in domain/user folders.
- **SQL Auth**: `/etc/dovecot/dovecot-sql.conf.ext`
    - Defines the SQL query used to verify user passwords and retrieve home directories.
- **SSL**: `/etc/dovecot/conf.d/10-ssl.conf`
    - Configures the Let's Encrypt certificates for IMAP access.
- **LMTP**: `/etc/dovecot/conf.d/10-master.conf`
    - Sets up the `postfix-lmtp` socket for receiving mail from Postfix.

### 3. Rspamd (Spam & Hygiene)
- **Local Overrides**: `/etc/rspamd/local.d/`
    - `dkim_signing.conf`: Tells Rspamd which key to use for signing outbound mail.
    - `dmarc.conf`: Configured for **Strict Enforcement** (`p=reject` and `p=quarantine`).
    - `actions.conf`: Defines scoring thresholds for greylisting and rejecting.
    - `worker-proxy.inc`: Configures the Milter port (11332) for Postfix communication.

### 4. SOGo (Webmail & Groupware)
- **Config File**: `/etc/sogo/sogo.conf`
    - **Database**: Configures SQL connection for profiles, sessions, and folders.
    - **Mail Integration**: Points to localhost (Postfix/Dovecot) for SMTP and IMAP.
    - **Auth**: Uses the `mailserver.users` table for logging in.
    - **SOGoUserSources**: Maps SQL columns to SOGo attributes (e.g., `c_password`, `c_uid`).

### 5. Nginx (Web Proxy)
- **VHost Config**: `/etc/nginx/sites-available/mail.zimprices.co.zw`
    - Acts as an HTTPS terminator.
    - Forwards traffic to SOGo (port 20000).
    - **Cloudflare Real IP**: Uses `set_real_ip_from` to restore the visitor's actual IP address from Cloudflare headers.

### 6. MariaDB (Database)
- **Database**: `mailserver`
- **Tables**:
    - `domains`: List of hosted domains (e.g., `zimprices.co.zw`).
    - `users`: Core user storage (`mail`, `c_password`).
    - `aliases`: Forwarding rules.
- **User Permissions**: `mailuser` is restricted to only accessing the `mailserver` database.

---

## 📖 Administrator Guides

### 1. Managing Users
The primary way to manage users is via the `./mail-admin.sh` wrapper script.

#### Using the Admin Tool
1.  **Run the script**: `./mail-admin.sh`
2.  **Add User**: Select option 2. Enter the username (e.g., `garikai`).
    *   **How it works**:
        1.  Generates a 16+ character secure password (random mix of types).
        2.  Creates a SHA512-CRYPT hash of that password.
        3.  Inserts a record into the `users` table including the hash.
        4.  Creates the physical mailbox directory: `/var/vmail/zimprices.co.zw/garikai/`.
        5.  Sets ownership to the `vmail` user.
3.  **Update Password**: Select option 3.
    *   **How it works**: Generates a new secure password, hashes it, and updates the `c_password` column for that user in MariaDB.

#### Manual Password Update (via DB)
If you prefer manual SQL:
```sql
-- Generate hash on server: doveadm pw -s SHA512-CRYPT
UPDATE mailserver.users SET c_password = '{SHA512-CRYPT}$6$...' WHERE mail = 'user@domain';
```

### 2. Adding a New Domain
While the script is currently tuned for `zimprices.co.zw`, adding a new domain involves:
1.  **Database**: Insert the domain into the `domains` table.
    ```sql
    INSERT INTO mailserver.domains (name) VALUES ('newdomain.com');
    ```
2.  **DNS**: Set up MX, SPF, DKIM, and DMARC records for the new domain.
3.  **DKIM**: Generate a new key in Rspamd for the domain (or use a multi-domain key).
4.  **SSL**: Add the domain to the `lego` certificate request.

### 3. Generating/Updating SSL Certificates
We use **Lego** with the **Cloudflare DNS-01** challenge to handle wildcards.

#### Manual Generation Command
```bash
export CLOUDFLARE_EMAIL="gbdzoma@gmail.com"
export CLOUDFLARE_API_KEY="your_api_key"

lego --email "gbdzoma@gmail.com" --dns cloudflare \
     --domains "zimprices.co.zw" --domains "*.zimprices.co.zw" \
     --path /etc/lego run
```

#### How Renewal Works
The cron job at `/etc/cron.d/lego-renewal` runs `renew_ssl.sh` weekly.
- It attempts a renewal if the cert is less than 30 days old.
- After success, it **reloads** Nginx, Postfix, and Dovecot so they see the new files immediately without dropped connections.

### 4. Firewall (UFW) Management
The firewall is critical for protecting the server. We use `ufw` to manage access.

#### Core Server IPs
- **IPv4**: `51.77.222.232`
- **IPv6**: `2001:41d0:305:2100::8406`

#### Checking Status
To view current rules and status:
```bash
sudo ufw status verbose
# To see rules with numbers (useful for deletion)
sudo ufw status numbered
```

#### How the Rules Work
1.  **Direct Ports**: Standard mail ports (25, 587, 465, 993, 110/143) and SSH (22) are open to **Anywhere**.
2.  **Restricted HTTPS (443)**: This port is **ONLY** open to Cloudflare IP ranges. This ensures all web traffic to SOGo must pass through Cloudflare's WAF.
3.  **Automated Updates**: Since Cloudflare changes their IPs occasionally, the script at `/usr/local/bin/update_ufw_cloudflare.sh` runs daily via cron to fetch the latest IPs and re-configure UFW.

#### Security Recommendation: Narrowing SSH Access
Currently, SSH (port 22) is open to the world. For maximum security, if you have a static home or office IP, you should restrict SSH to only that IP:
```bash
# First, allow your IP (VERY IMPORTANT to prevent lockout)
sudo ufw allow from your_static_ip to any port 22

# Then delete the "Anywhere" SSH rule
sudo ufw status numbered
sudo ufw delete <rule_number_for_ssh_anywhere>
```

---

*Last Updated: January 20, 2026*
