# Fail2ban Dashboard Module Plan

## Objective
Build a first-class Fail2ban management module for the mail admin dashboard. The module should let authorized users inspect, configure, test, ban, unban, reload, and audit Fail2ban without SSH or manual shell commands.

The module must be permission-driven from the beginning. Backend authorization is authoritative; frontend controls only reflect permissions.

## Design Principles
1. Treat Fail2ban as a security operations module, not just a config editor.
2. Prefer fast, safe actions from the dashboard: inspect, ban, unban, reload, and validate.
3. Keep destructive actions separated by granular permissions and confirmation modals.
4. Never edit package-owned defaults directly. Write local overrides and keep backups.
5. Every state-changing action must write an audit log entry.
6. Use whitelisted commands and whitelisted config/log paths only.

## Core Views

### Overview
Show the current security posture at a glance.

- Fail2ban service status: running, stopped, failed, disabled.
- Active jail count.
- Currently banned IP count.
- Bans in the last 1 hour, 24 hours, and 7 days.
- Top banned IPs.
- Top jails by ban count.
- Recent ban/unban events.
- Health warnings:
  - Fail2ban not running.
  - Enabled jail has no active backend.
  - Config test fails.
  - Jail log path is missing.
  - Filter has not matched recent logs.
  - Backend command failed.

### Jails
List every jail from Fail2ban and expose high-value actions.

Per jail fields:

- Jail name.
- Enabled/active state.
- Current banned IP count.
- Total failed attempts where available.
- Log path.
- Filter name.
- Ports.
- Backend.
- `maxretry`.
- `findtime`.
- `bantime`.

Actions:

- View jail detail.
- Reload jail.
- Restart jail if supported.
- Enable or disable jail through local override.
- Ban IP in this jail.
- Unban IP from this jail.
- Flush all bans for this jail.
- View matching logs.
- Test jail filter against sample log lines.

### Jail Detail
Provide an operator view for one jail.

- Current banned IPs.
- Recent failures.
- Recent ban/unban events.
- Effective jail config.
- Linked filter file.
- Linked log file.
- Regex/filter test panel.
- Quick ban/unban controls.
- Reload jail control.
- Flush jail control.

### Banned IPs
Global banned IP management.

Filters:

- Jail.
- IP address.
- Search text.
- Date range.
- Currently banned only.
- Repeated offenders only.

Actions:

- Unban from one jail.
- Unban from all jails.
- Copy IP address.
- Inspect related log lines.
- Add to temporary allowlist.
- Add to permanent ignore list.
- Add to permanent blocklist if a blocklist facility exists.

### Action Center
A dense action panel for common response work.

- Ban IP globally or by jail.
- Unban IP globally or by jail.
- Add temporary allowlist entry.
- Add permanent ignore IP entry.
- Reload Fail2ban.
- Restart Fail2ban.
- Validate config.
- Open latest Fail2ban logs.

### Logs
A dedicated Fail2ban log viewer.

Sources should include journal first and file fallback where needed:

- `journalctl -u fail2ban`.
- `/var/log/fail2ban.log` when present.
- Jail source logs when reviewing a specific jail.

Filters:

- Jail.
- IP address.
- Action: ban, unban, found, error, warning.
- Text search.
- Presets: last 15 minutes, last 1 hour, today, yesterday, custom range.
- Limit.

Actions:

- Copy visible logs.
- Download visible logs.
- Jump from log line to jail detail.
- Jump from IP to banned IP detail.

### Configuration Editor
Manage safe local overrides and validation.

Editable targets:

- `/etc/fail2ban/jail.local`.
- `/etc/fail2ban/jail.d/*.local`.
- `/etc/fail2ban/filter.d/*.local`.

Read-only targets:

- `/etc/fail2ban/jail.conf`.
- `/etc/fail2ban/jail.d/*.conf`.
- `/etc/fail2ban/filter.d/*.conf`.

Required behavior:

- Validate before save with `fail2ban-client -t`.
- Create timestamped backup before write.
- Roll back automatically if validation or reload fails.
- Show diff before deploy.
- Reload Fail2ban only after successful validation.
- Audit every save, restore, reload, restart, ban, and unban.

### Filter Tester
Make regex and jail tuning possible from the dashboard.

- Select jail/filter.
- Paste sample log lines.
- Run `fail2ban-regex` against the selected filter.
- Show matched and missed lines.
- Show matched groups where possible.
- Show recommended next steps when no matches are found.

## Advanced Features

### IP Intelligence
Optional enrichment for response work.

- Reverse DNS.
- ASN.
- Country.
- Abuse contact.
- First seen.
- Last seen.
- Ban count across jails.
- Related domains/mailboxes if derivable from logs.

### Recidive Analysis
Highlight repeated offenders.

- IPs banned repeatedly across jails.
- IPs repeatedly failing but not currently banned.
- Suggested escalation into recidive jail or firewall blocklist.

### Presets
Offer safe configuration templates.

- Mail server baseline.
- Conservative webmail protection.
- Aggressive SMTP abuse protection.
- SSH hardening.
- Rspamd/postfix abuse tuning.

Presets should preview config diffs and require `fail2ban:config_write`.

### Drift Detection
Detect manual server-side changes.

- Modified local override files.
- Unknown local files.
- Backups available.
- Last dashboard-managed write.

## Backend API Shape

Suggested routes:

```text
GET    /security/fail2ban/overview
GET    /security/fail2ban/status
POST   /security/fail2ban/control
GET    /security/fail2ban/jails
GET    /security/fail2ban/jails/{jail}
POST   /security/fail2ban/jails/{jail}/reload
POST   /security/fail2ban/jails/{jail}/ban
POST   /security/fail2ban/jails/{jail}/unban
POST   /security/fail2ban/jails/{jail}/flush
GET    /security/fail2ban/bans
POST   /security/fail2ban/ban
POST   /security/fail2ban/unban
GET    /security/fail2ban/logs
GET    /security/fail2ban/configs
GET    /security/fail2ban/configs/{id}
POST   /security/fail2ban/configs/{id}/validate
POST   /security/fail2ban/configs/{id}
POST   /security/fail2ban/configs/{id}/restore
POST   /security/fail2ban/filter-test
```

## Command Strategy
Use explicit command construction only. Do not pass user input through shell strings.

Likely command allowlist:

- `fail2ban-client status`.
- `fail2ban-client status <jail>`.
- `fail2ban-client set <jail> banip <ip>`.
- `fail2ban-client set <jail> unbanip <ip>`.
- `fail2ban-client unban <ip>` where supported.
- `fail2ban-client reload`.
- `fail2ban-client reload <jail>` where supported.
- `fail2ban-client -t`.
- `fail2ban-regex <log> <filter>`.
- `systemctl status/start/stop/restart/reload fail2ban`.
- `journalctl -u fail2ban`.
- `tail` for whitelisted Fail2ban and jail log files.

Input validation:

- Jail names must match discovered jails or whitelisted config IDs.
- IPs must parse as IPv4 or IPv6.
- Config IDs must resolve to whitelisted files.
- Log paths must come from known jails or explicit allowlist.

## Permissions
Add a new module to `MODULE_PERMISSIONS`.

```python
"fail2ban": {
    "read": "fail2ban:read",
    "overview": "fail2ban:overview",
    "jails_read": "fail2ban:jails_read",
    "jail_detail": "fail2ban:jail_detail",
    "bans_read": "fail2ban:bans_read",
    "logs_read": "fail2ban:logs_read",

    "ban_ip": "fail2ban:ban_ip",
    "unban_ip": "fail2ban:unban_ip",
    "flush_jail": "fail2ban:flush_jail",

    "service_status": "fail2ban:service_status",
    "service_start": "fail2ban:service_start",
    "service_stop": "fail2ban:service_stop",
    "service_restart": "fail2ban:service_restart",
    "service_reload": "fail2ban:service_reload",

    "config_read": "fail2ban:config_read",
    "config_validate": "fail2ban:config_validate",
    "config_write": "fail2ban:config_write",
    "config_restore": "fail2ban:config_restore",

    "filter_test": "fail2ban:filter_test",
    "allowlist_read": "fail2ban:allowlist_read",
    "allowlist_write": "fail2ban:allowlist_write",
    "presets_read": "fail2ban:presets_read",
    "presets_apply": "fail2ban:presets_apply",
}
```

## Role Defaults

Suggested defaults:

- `super_admin`: all Fail2ban permissions.
- `support_admin`: overview, jails read, jail detail, bans read, logs read, ban IP, unban IP, filter test, service reload.
- `readonly_admin`: overview, jails read, jail detail, bans read, logs read.
- `domain_admin`: no Fail2ban permissions by default unless later scoped by domain/service.

High-risk permissions should remain separate and super-admin-only by default:

- `fail2ban:service_stop`.
- `fail2ban:service_restart`.
- `fail2ban:flush_jail`.
- `fail2ban:config_write`.
- `fail2ban:config_restore`.
- `fail2ban:allowlist_write`.
- `fail2ban:presets_apply`.

## Sudoers Requirements
Add narrowly scoped sudoers entries for the `mailadmin` service user.

Examples:

```text
/usr/bin/fail2ban-client status
/usr/bin/fail2ban-client status *
/usr/bin/fail2ban-client set * banip *
/usr/bin/fail2ban-client set * unbanip *
/usr/bin/fail2ban-client reload
/usr/bin/fail2ban-client reload *
/usr/bin/fail2ban-client -t
/usr/bin/fail2ban-regex *
/usr/bin/systemctl status fail2ban
/usr/bin/systemctl start fail2ban
/usr/bin/systemctl stop fail2ban
/usr/bin/systemctl restart fail2ban
/usr/bin/systemctl reload fail2ban
/usr/bin/journalctl -u fail2ban *
/usr/bin/tail -n * /var/log/fail2ban.log
```

The implementation should validate all user inputs before invoking these commands.

## Implementation Phases

### Phase 1: Read-Only Observability
- Permission definitions and role defaults.
- Fail2ban service status.
- Jail list.
- Jail detail.
- Current bans.
- Logs view.
- Audit-safe read endpoints.

### Phase 2: Safe Operations
- Ban IP.
- Unban IP.
- Reload jail.
- Reload Fail2ban.
- Filter testing.
- Confirmation modals.
- Audit logging.

### Phase 3: Config Management
- Config discovery.
- Read-only default configs.
- Editable local override configs.
- Validation.
- Backup.
- Diff preview.
- Save, reload, rollback.

### Phase 4: Advanced Security Tools
- Recidive analysis.
- IP intelligence.
- Presets.
- Drift detection.
- Allowlist/blocklist workflows.

## Verification

Backend:

- Python syntax checks.
- Unit tests for command construction.
- Permission denial tests.
- IP validation tests.
- Jail name validation tests.
- Config path resolution tests.

Frontend:

- `npm run build`.
- Permission-gated UI checks.
- Confirmation modal checks.
- Desktop and mobile layout checks.

Manual server checks:

- Read jails as super admin.
- Read jails as readonly admin.
- Ban/unban as support admin.
- Deny config write as support admin.
- Validate config before save.
- Confirm audit logs for all state-changing actions.
