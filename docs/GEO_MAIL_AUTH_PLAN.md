# Geo-Mail & SSH Auth Plan

## Goal

Control remote IMAP, SMTP, and SSH secure logins by checking the client's IP geolocation before authentication is accepted.

The intended flow is:

1. Look up the remote IP in the shared local MaxMind database (city-level accuracy is already maintained on the host).
2. Compare the country/region to the allowed policies.
3. Allow or deny the login based on domain-level configurations, regional groups, or user-specific overrides.
4. If denied, immediately log the event to a local SQLite database and add the IP directly to a service-specific kernel-level `nftables` set (either mail or SSH) with a defined timeout.
5. Drop subsequent traffic from the blocked IP **only for the specific ports matching the targeted service** (retaining access to other services like HTTP/HTTPS on the same host).
6. Rehydrate active firewall bans on system startup directly from the SQLite database.

## Feasibility

This is highly feasible because:
1. **Unified Mail Auth:** Postfix SMTP submission is already configured to delegate SASL authentication to Dovecot (`smtpd_sasl_type = dovecot`). Therefore, adding an authentication policy hook to Dovecot automatically covers both IMAP and SMTP submission.
2. **SSH PAM Hook:** SSH logins can trigger a verification script using PAM (`pam_exec.so`), which queries the same policy service.
3. **High-Performance Firewall Integration:** `nftables` sets scale to hundreds of thousands of IPs using O(1) hash table lookups, eliminating the CPU bottleneck associated with parsing logs.

## Recommended Design

### 1. Decision Engine Logic

Keep the policy service small, fast, and deterministic.

Input:
- username (e.g., `user@domain.com`)
- remote IP
- protocol (`imap`, `smtp`, `ssh`)
- timestamp

Decision order:
1. **Admin Override:** Allow if the IP is in the permanent administrative whitelist (e.g., local infrastructure, trusted networks).
2. **Explicit IP block:** Deny if the IP is in the permanent blocklist.
3. **User-Specific Exception:** Check if there is an active exception for this specific user (e.g., temporary travel pass or dedicated country override). If found, apply it and skip domain check.
4. **Domain-Level Policy:** 
   - Parse the domain from the username.
   - Match the country from the MaxMind lookup against the domain's allowed list of countries or regions (e.g., SADC, Europe).
   - If allowed, permit login.
5. **Deny & Ban Action:**
   - Log the rejection to the SQLite database.
   - Add the IP programmatically to the service-specific `nftables` set (`geo_mail_bans` or `geo_ssh_bans`) with a dynamic timeout (e.g., `30m`).
   - Terminate connection with auth failure.

### 2. Regions, Domains, and Exceptions (Mitigations)

- **Regional Seed Lists:** Define presets of countries mapped to regional blocks (e.g., `SADC`, `Europe`, `West Africa`) so administrators can allow entire regions instead of selecting individual countries.
- **Domain-Level Controls:** Domain admins have the permission to manage the allowed countries/regions for all users under their domain.
- **User-Specific Overrides:** Domain/Super admins can add exceptions for individual mailboxes/usernames (e.g., a specific user is traveling to Europe for 2 weeks, so we add a temporary override for them).
- **Temporary Travel Window (Flip):** Overrides can be configured with an auto-expiration timestamp (TTL). Once expired, the user reverts to the domain-level default policy.

### 3. Durable Policy State (SQLite)

Store all policy and temporary/permanent states in a small database (e.g., SQLite or the main database):
- `allowed_regions` / `allowed_countries` (mapped per domain)
- `user_exceptions` (username, country/region, expiration_timestamp/TTL)
- `trusted_ips` (IP/CIDR, description)
- `blocked_ips` (IP/CIDR, reason)
- `active_bans` (IP, service, ban_timestamp, expiration_timestamp)
- `audit_history` (who, what, when, source IP)

### 4. Enforcement Layer (Kernel Nftables with Service Isolation)

To ensure that bans on one protocol do not block access to unrelated services (like web traffic on ports 80/443), we define distinct, service-specific sets:

- Define native `nftables` sets in `/etc/nftables.conf` with timeout support:
  ```text
  table inet filter {
      # Target sets
      set geo_mail_bans {
          type ipv4_addr
          flags timeout
      }
      set geo_ssh_bans {
          type ipv4_addr
          flags timeout
      }

      chain input {
          type filter hook input priority filter; policy accept;
          
          # Target-specific drops:
          # Only drop mail ports for mail bans
          ip saddr @geo_mail_bans tcp dport { 25, 465, 587, 993 } drop
          
          # Only drop SSH port for SSH bans
          ip saddr @geo_ssh_bans tcp dport { 22 } drop
      }
  }
  ```
- Adding bans: The Python service uses `libnftables` to programmatically add the IP to the correct set:
  - For IMAP/SMTP: `nft add element inet filter geo_mail_bans { <IP> timeout 30m }`
  - For SSH: `nft add element inet filter geo_ssh_bans { <IP> timeout 30m }`
- Clearing bans: Admin can clear a ban by executing:
  ```text
  nft delete element inet filter geo_mail_bans { <IP> }
  ```
- Boot Reconciler: On startup, a script queries the SQLite database for non-expired `active_bans` and loads them into their respective sets based on the `service` column.

### 5. SSH Integration Details

To extend this plan to SSH:
1. **PAM Execution Hook:** Add `account required pam_exec.so stdout /usr/local/bin/ssh-geo-check.py` to `/etc/pam.d/sshd`.
2. **Policy Call:** The PAM script reads `$PAM_USER` and `$PAM_RHOST` and queries the central Python policy service.
3. **Safety Guardrails:**
   - **Fail-Open:** Configure the PAM hook or script to fail-open if the policy database or service is unavailable. This prevents locking out the system administrator.
   - **Local Network/Key Bypass:** Completely bypass GeoIP check for connection attempts originating from local subnets or when authenticating with a pre-approved master public key.

## Webadmin Module

Expose these controls in the web admin interface:
- **Allowed Countries/Regions Screen:** Let domain admins set global policies and select regions (e.g., SADC).
- **User Exceptions Screen:** Create, update, and delete temporary travel permissions with automated expiry dates.
- **Active Bans & Logs:** View recent blocks and manually clear temporary bans from the interface by deleting elements from the `nftables` set and database.

## Verification Plan

### Automated Tests
- Script mock tests passing IPs from different countries to verify region resolution (SADC, Europe).
- Verification that domain-level default configurations are correctly overridden by user exceptions.
- Unit tests verifying expiration logic of temporary overrides.

### Manual Verification
- Testing fake login attempts simulating different remote IPs using custom headers or environment injection.
- Confirming that denied attempts immediately block further network packets from that IP on the specific service ports.
- Testing that blocked IPs can still successfully request web pages on HTTP/HTTPS ports (80/443).
