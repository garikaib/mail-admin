# Domain Manager Permissions Hardening Plan

## Objective
Make domain manager access explicit, granular, and enforceable. RBAC decides what a user can do. ABAC/domain assignment decides where they can do it. Frontend controls improve UX only; backend authorization remains authoritative.

## Findings
1. `DomainAssignment` currently causes implicit `domain_admin` role elevation in `role_names()`. This means object assignment grants broad write/delete permissions even when a user is intended to be readonly or support-only.
2. `UserRole.scope` exists but the current enforcement model treats roles as global. Until scoped roles are fully implemented, `DomainAssignment` should be the only object-scope mechanism.
3. Several endpoints enforce broad module permissions but not object scope. Zone ownership scan and provisioning status are the highest-risk examples.
4. `mailboxes:update` is overloaded. Resetting a password is more sensitive than editing mailbox metadata and needs its own permission.
5. Native `alert()` / `confirm()` dialogs disrupt the FastHTML-style UI and make destructive flows feel inconsistent.

## Authorization Contract
- RBAC: explicit `core_userrole` rows grant actions.
- ABAC: `core_domainassignment` constrains non-superuser access to specific domain names.
- Super admins bypass ABAC scope.
- Domain assignment alone never grants a role.

## Granular Permissions
- `domains:read`, `domains:create`, `domains:update`, `domains:delete`, `domains:provision`, `domains:provision_status`
- `plans:read`, `plans:create`, `plans:delete`
- `mailboxes:read`, `mailboxes:create`, `mailboxes:update`, `mailboxes:reset_password`, `mailboxes:delete`
- `aliases:read`, `aliases:create`, `aliases:update`, `aliases:delete`
- `credentials:read`, `credentials:create`, `credentials:delete`, `credentials:scan_zones`
- `system:health`, `system:logs`

## Role Defaults
- `super_admin`: all permissions.
- `domain_admin`: assigned-domain read/write for mailboxes and aliases, credential read/create, plan read, provisioning status.
- `support_admin`: assigned-domain read, mailbox update/reset, alias update.
- `readonly_admin`: assigned-domain read only.

## Migration Strategy
Run `scripts/maintenance/seed_permissions.py` first without `--apply` to inspect changes. Then run with `--apply`. The script ensures the configured super admin has `super_admin`, and assigns `readonly_admin` to users with domain assignments but no explicit role. Promote intended managers to `domain_admin` deliberately.

## Frontend UX
Replace native browser dialogs with React modals matching the FastHTML/neobrutalist visual system. Destructive actions use custom confirmation dialogs. Password resets show a result modal with copy-to-clipboard.

## Verification
- Backend syntax/import checks.
- Frontend `npm run build`.
- Manual checks with super admin, readonly user, support user, and domain admin.
