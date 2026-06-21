# ZimPrices Email Server Handover Document

## 1. System Overview
- **Main Server IP**: `51.77.222.232`
- **Operating System**: Ubuntu 22.04 LTS
- **Mail Stack**: 
    - **MTA**: Postfix
    - **MDA/IMAP**: Dovecot
    - **Spam/Security**: Rspamd
    - **Database**: MariaDB (schema: `mailserver`)
    - **Webmail**: SOGo (`webmail.{domain}.co.zw`)
    - **Admin**: FastAPI + React platform at `admin.zimprices.co.zw`

## 2. Key Paths & Configurations
- **Mail Storage**: `/var/vmail/`
- **Postfix Configs**: `/etc/postfix/`
- **Dovecot Configs**: `/etc/dovecot/`
- **Rspamd Configs**: `/etc/rspamd/`
    - **Custom Logic**: `/etc/rspamd/rspamd.local.lua`
    - **Local Settings**: `/etc/rspamd/local.d/`
- **Logs**:
    - **Postfix/Dovecot**: `/var/log/mail.log`
    - **Rspamd**: `/var/log/rspamd/rspamd.log` (Requires `sudo`)

## 3. Recent Critical Fixes (April 2026)

### A. Rspamd Lua API Fix
- **Issue**: Rspamd was failing to process emails due to a Lua error in the `get_body(task)` function. It was attempting to call `part:is_attachment()` which does not exist for `lua_text_part` objects.
- **Fix**: Updated `rspamd.local.lua` to iterate through text parts and use the correct `get_content()` method. The `is_attachment` check was simplified to ensure stability.

### B. ZISPA / Infrastructure Whitelisting
- **Issue**: `admin@zispa.org.zw` (ZISPA Administrator) emails were being rejected as spam (`AUTO_PHISH_DOMAIN_BLOCK`).
- **Fix**: 
    1.  Removed `zispa.org.zw` from the persistent auto-block map at `/var/lib/rspamd/auto_phish_domains.map`.
    2.  Implemented a permanent **Whitelist** system.
    3.  Created `/etc/rspamd/local.d/maps.d/whitelisted_domains.map`.
    4.  Added logic to `rspamd.local.lua` to skip phishing/blocking for these domains.
    5.  Added a `LOCAL_WL_DOMAIN` symbol in `multimap.conf` with a `-100.0` score.

### D. SSL Renewal & Standardization (April 23, 2026)
- **Issue**: `growzimcapital.co.zw` was near expiry (May 9) and using a legacy certificate path (`_.growzimcapital.co.zw.crt`) which was not in the auto-renewal script.
- **Fix**:
    1. Updated `scripts/maintenance/setup_ssl_renewal.sh` to include `growzimcapital.co.zw`.
    2. Issued a new wildcard certificate for `growzimcapital.co.zw`.
    3. Updated the Nginx configuration for `webmail.growzimcapital.co.zw` to use the new standard path (`/etc/lego/certificates/growzimcapital.co.zw.crt`).
- **Note**: `moretswana.com` is currently EXPIRED (Apr 20) and excluded from renewal as per user instruction.

### E. DNS CNAME Standardization
- **Issue**: Some `webmail` subdomains were using `A` records instead of `CNAME` records.
### F. Spam Campaign Blocking (April 30, 2026)
- **Issue**: Multi-domain spam campaigns:
    1.  "CNN News | Health" / "Memory Restoration" / "Alzheimer"
    2.  "Microsoft Sharepoint" (fake shared documents from `camprodon.biz`)
    3.  "TikTok Shop" / "Jordan from TikTok"
    4.  "Olivia Smith" (SEO proposals from `I2K2TechSolution@outlook.com`)
    5.  "Daniel Perez" / "product boxes"
    6.  "Rohit Singh" / "SEO plan"
    7.  "Taylor from TikTok" / "School of Digital Marketing"
- **Fix**:
    1.  Performed broad purges across all `/var/vmail/` directories using `grep` to identify and delete matching messages.
    2.  Enabled Dovecot `iterate_query` to allow `doveadm` operations across all users.
    3.  Created a dedicated high-score Rspamd rule `CNN_HEALTH_SPAM_DETECTED` (now covers all these campaigns) with a score of 25.0.
    4.  Updated `local_bl_from.map.inc` to block known spammer domains (`moviefone.com`, `camprodon.biz`).
    5.  Populated `phish_keywords.map` with detailed patterns from these campaigns.
    6.  Ran `doveadm force-resync` to ensure webmail/SOGo reflects the changes.

## 4. Operational Procedures

### Safe Rspamd Map Updates
- GitHub-hosted map files are allowed to update automatically, but only for heuristic scoring.
- Keep hard reject logic on the remote server in Rspamd/Postfix policy files, not inside the map scores.
- If an upstream map update raises false positives, lower or neutralize the symbol weight locally before the next deploy.
- Run `rspamadm configtest` after syncing any config change and before restarting Rspamd.
- Watch for newly added high-score rules in upstream map files; treat them as quarantine/junk signals unless explicitly reviewed.


### Adding a New Domain
1.  Run the setup script: `python3 scripts/setup/setup_mail_{domain}.py`.
2.  Configure DNS (Cloudflare): `python3 scripts/setup/configure_dns_{domain}.py`.
3.  Set up aliases: `python3 scripts/setup/setup_aliases_{domain}.py`.

### Whitelisting a Domain
To prevent a domain from being blocked by security heuristics:
1.  Add the domain to `configs/rspamd/maps.d/whitelisted_domains.map`.
2.  Sync to remote: `scp ... /etc/rspamd/local.d/maps.d/whitelisted_domains.map`.
3.  Restart Rspamd: `sudo systemctl restart rspamd`.

### Troubleshooting Rejections
1.  Search `mail.log` for the recipient or "milter-reject".
2.  If rejected by Rspamd, find the `id` of the task and search `rspamd.log` for that ID.
3.  Look for high-scoring symbols (e.g., `AUTO_PHISH_DOMAIN_BLOCK`, `FAKE_SUPPORT_IMPERSONATION`).

## 5. Active Domains
- `zimprices.co.zw` (Core)
- `zimpricecheck.com`
- `hygienemax.co.zw`
- `chadzi.co.zw`
- `rotvim.co.zw`
- `honeyscoop.co.zw`
- (And others listed in `rspamd.local.lua`)
