# Domain Provisioning Improvements & Validation Plan

## Objective
Improve the domain provisioning flow so it validates domains before provisioning, provisions mail DNS in an idempotent way, registers DKIM in the server configuration safely, and aligns the frontend with backend permissions.

Backend authorization remains the source of truth. Frontend checks only control visibility and UX.

## Current Code Reality
- `domains:provision`, `mailboxes:*`, `aliases:*`, and `domains:delete` are already enforced in backend routes.
- The frontend still has a hardcoded `is_superuser` gate for the "New Domain" button and passes `isSuper` into `DomainDetailPage`.
- `dnspython` is already available in backend dependencies.
- `configure_mail_dns()` currently creates MX, SPF, DMARC, and `webmail` CNAME records only.
- DKIM generation currently writes key material to disk, but it does not register domain-specific signing config in Rspamd.

## Scope
1. Pre-flight domain validation.
2. Cloudflare DNS provisioning improvements.
3. DKIM key registration and cleanup in Rspamd.
4. Frontend permission guard updates.
5. Verification and rollback behavior.

## 1. Pre-flight Domain Validation
Update `backend/app/routes/domains.py` so `_validate_domain_request()` checks:
- Domain format.
- Duplicate domain in the local database.
- Cloudflare zone presence for the selected credential.
- Live DNS registration status when the zone is missing from Cloudflare.

Validation flow:
1. Try `CloudflareService.get_zone_id(domain)`.
2. If the zone exists, continue with provisioning.
3. If the zone is missing, use `dnspython` to query `NS` and then `SOA`.
4. If DNS returns `NXDOMAIN`, or both `NS` and `SOA` are unresolved, reject the request as unregistered.
5. If DNS resolves but the zone is not in the Cloudflare account, warn the user to add the domain to Cloudflare first.
6. If DNS lookup times out or fails for transient reasons, return a clear verification error instead of treating the domain as unregistered.

Suggested user-facing messages:
- `Domain is not registered yet. Please register it first.`
- `Domain is registered, but it is not present in the selected Cloudflare account. Please add it to Cloudflare first.`
- `Unable to verify domain registration status right now. Please try again.`

## 2. Cloudflare DNS Provisioning
Update `backend/app/services/cloudflare.py` so DNS provisioning is explicit and idempotent.

Required behavior:
- Query existing MX records before creating a new one.
- Prefer platform-owned records when updating existing entries.
- Do not silently demote or overwrite third-party MX records unless an explicit replacement mode is enabled.
- Keep the provisioning step deterministic: create or update the exact records we own, and warn on conflicts.

Records to provision:
- MX for the root domain.
- SPF TXT for the root domain.
- DMARC TXT for `_dmarc`.
- `webmail` CNAME.
- `mail.<domain>` A record.
- `mail.<domain>` AAAA record.

Implementation notes:
- Add list/update helpers for DNS records so we can upsert instead of only creating.
- If a record already exists with conflicting values, log the conflict and fail or warn depending on the record type.
- If an existing MX record is already primary, prefer a safe warning path unless the user explicitly asked for replacement.

## 3. DKIM and Rspamd Registration
Update `backend/app/services/dkim.py` so DKIM key generation also registers the signing config.

Required helpers:
- `register_domain_in_rspamd(domain, selector, key_path)`
- `unregister_domain_in_rspamd(domain)`

Required behavior:
- Register the domain signing block only after a DKIM key is successfully generated.
- Remove the domain block when keys are removed or the domain is deleted.
- Reload Rspamd after a successful config change.
- Keep the config write atomic and reversible.

Preferred implementation approach:
- Use a managed include file or a dedicated domain map if the current Rspamd layout allows it.
- If the existing `dkim_signing.conf` must be edited directly, rewrite the file atomically with a backup and validation step before reload.
- Avoid partial string insertion that can corrupt the config on repeated runs.

Rollback behavior:
- If DKIM registration fails after key generation, provisioning should continue only if that failure is treated as non-fatal and explicitly logged.
- On domain deletion, remove keys and unregister the domain config before final cleanup completes.

## 4. Frontend Permission Guards
Update `frontend/src/App.jsx` to use `hasPermission()` instead of hardcoded superuser checks for provisioning and domain actions.

Required UI guards:
- `New Domain` -> `domains:provision`
- `Delete Domain` -> `domains:delete`
- `New Mailbox` -> `mailboxes:create`
- `Reset` mailbox password -> `mailboxes:reset_password`
- `Delete` mailbox -> `mailboxes:delete`
- `New Alias` -> `aliases:create`
- `Edit Alias` -> `aliases:update`
- `Delete Alias` -> `aliases:delete`

Implementation notes:
- Pass `hasPermission` into `DomainDetailPage` instead of `isSuper`.
- Keep the backend route checks unchanged, because they are already the enforcement boundary.
- Treat UI hiding as a usability improvement only; do not rely on it for access control.

## 5. Verification Plan
Automated checks:
- Validate the backend route and service paths locally.
- Add or update tests for:
  - unregistered domain rejection,
  - Cloudflare zone missing warning,
  - DNS lookup timeout handling,
  - permission-based route denial for provisioning, mailboxes, and aliases.

Manual checks:
- Log in as support admin and domain admin and confirm they only see the actions allowed by their permissions.
- Attempt to add a non-registered domain and confirm the request is rejected with the unregistered-domain message.
- Attempt to add a registered domain that is not in the selected Cloudflare account and confirm the warning is shown.
- Confirm Cloudflare DNS records are created or updated as expected.
- Confirm DKIM key generation updates the Rspamd config and reloads the service.
- Confirm database records, Nginx config, and provisioning logs are updated after a successful run.

## Non-Goals
- Redesigning the permission model.
- Changing backend authorization semantics beyond the existing permission checks.
- Automatically overwriting third-party MX records without an explicit replace mode.

