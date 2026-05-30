from functools import lru_cache

import casbin
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models import AuthUser, DomainAssignment

MODULE_PERMISSIONS = {
    "domains": {
        "read": "domains:read",
        "create": "domains:create",
        "update": "domains:update",
        "delete": "domains:delete",
        "provision": "domains:provision",
        "provision_status": "domains:provision_status",
    },
    "plans": {
        "read": "plans:read",
        "create": "plans:create",
        "update": "plans:update",
        "delete": "plans:delete",
    },
    "mailboxes": {
        "read": "mailboxes:read",
        "create": "mailboxes:create",
        "update": "mailboxes:update",
        "reset_password": "mailboxes:reset_password",
        "delete": "mailboxes:delete",
    },
    "aliases": {
        "read": "aliases:read",
        "create": "aliases:create",
        "update": "aliases:update",
        "delete": "aliases:delete",
    },
    "credentials": {
        "read": "credentials:read",
        "create": "credentials:create",
        "delete": "credentials:delete",
        "scan_zones": "credentials:scan_zones",
    },
    "system": {
        "health": "system:health",
        "logs": "system:logs",
        "logs_query": "system:logs_query",
        "logs_purge": "system:logs_purge",
        "journal_query": "system:journal_query",
        "service_status": "system:service_status",
        "service_start": "system:service_start",
        "service_stop": "system:service_stop",
        "service_restart": "system:service_restart",
        "service_logs": "system:service_logs",
        "config_read": "system:config_read",
        "config_write": "system:config_write",
    },
    "users": {
        "read": "users:read",
        "create": "users:create",
        "update": "users:update",
        "delete": "users:delete",
    },
    "registrations": {
        "read": "registrations:read",
        "create": "registrations:create",
        "update": "registrations:update",
        "delete": "registrations:delete",
        "submit": "registrations:submit",
    },
}

CASBIN_MODEL = """
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch(r.obj, p.obj) && regexMatch(r.act, p.act)
"""

CASBIN_POLICIES = (
    ("super_admin", "*", ".*"),
    ("domain_admin", "domains", "read|provision_status"),
    ("domain_admin", "plans", "read"),
    ("domain_admin", "mailboxes", "read|create|update|reset_password|delete"),
    ("domain_admin", "aliases", "read|create|update|delete"),
    ("domain_admin", "credentials", "read|create|scan_zones"),
    ("domain_admin", "registrations", "read|create|update|submit"),
    ("support_admin", "domains", "read|provision_status"),
    ("support_admin", "mailboxes", "read|update|reset_password"),
    ("support_admin", "aliases", "read|update"),
    ("support_admin", "registrations", "read"),
    ("support_admin", "system", "service_logs|journal_query"),
    ("readonly_admin", "domains", "read|provision_status"),
    ("readonly_admin", "mailboxes", "read"),
    ("readonly_admin", "aliases", "read"),
    ("readonly_admin", "registrations", "read"),
)


@lru_cache(maxsize=1)
def get_enforcer() -> casbin.Enforcer:
    model = casbin.Model()
    model.load_model_from_text(CASBIN_MODEL)
    enforcer = casbin.Enforcer(model)
    for role, module, actions in CASBIN_POLICIES:
        enforcer.add_policy(role, module, actions)
    return enforcer


def is_super_admin(user: AuthUser) -> bool:
    return bool(user.is_superuser)


def role_names(user: AuthUser, db: Session) -> set[str]:
    roles = {role.role for role in getattr(user, "roles", [])}
    if is_super_admin(user):
        roles.add("super_admin")
    return roles


def can(user: AuthUser, db: Session, permission: str) -> bool:
    module, action = permission.split(":", 1)
    enforcer = get_enforcer()
    return any(enforcer.enforce(role, module, action) for role in role_names(user, db))


def require_permission(user: AuthUser, db: Session, permission: str) -> None:
    if not can(user, db, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user does not have enough privileges",
        )


def assigned_domain_names(user: AuthUser, db: Session) -> list[str]:
    assigned = db.query(DomainAssignment).filter(DomainAssignment.user_id == user.id).all()
    return [assignment.domain_name for assignment in assigned]


def can_manage_domain(user: AuthUser, db: Session, domain_name: str, permission: str) -> bool:
    if not can(user, db, permission):
        return False
    if is_super_admin(user):
        return True
    return domain_name in assigned_domain_names(user, db)


def require_domain_permission(user: AuthUser, db: Session, domain_name: str, permission: str) -> None:
    if not can_manage_domain(user, db, domain_name, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to manage this domain.",
        )


def permissions_for(user: AuthUser, db: Session) -> list[str]:
    permissions: set[str] = set()
    for module_permissions in MODULE_PERMISSIONS.values():
        for permission in module_permissions.values():
            if can(user, db, permission):
                permissions.add(permission)
    return sorted(permissions)
