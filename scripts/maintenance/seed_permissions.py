#!/usr/bin/env python3
"""Seed explicit admin roles after RBAC/ABAC hardening.

Dry-run by default. Use --apply to write changes.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_environment() -> None:
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError:
        return
    load_dotenv(ROOT / ".env")
    load_dotenv("/opt/mail_admin/.env")


def ensure_role(db, user, role: str, scope: str, apply: bool, UserRole) -> bool:
    if not user.id:
        return False
    exists = db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role == role,
        UserRole.scope == scope,
    ).first()
    if exists:
        return False
    print(f"ADD role={role} scope={scope} user={user.username}")
    if apply:
        db.add(UserRole(user_id=user.id, role=role, scope=scope))
    return True



def main() -> int:
    parser = argparse.ArgumentParser(description="Seed explicit RBAC roles for mail admin users.")
    parser.add_argument("--apply", action="store_true", help="Write changes. Without this flag, only prints a dry run.")
    parser.add_argument(
        "--default-assigned-role",
        default="readonly_admin",
        choices=("readonly_admin", "support_admin", "domain_admin"),
        help="Role assigned to users with domain assignments but no explicit role.",
    )
    args = parser.parse_args()

    load_environment()
    from backend.app.core.database import SessionLocal
    from backend.app.models import AuthUser, DomainAssignment, UserRole

    db = SessionLocal()
    from backend.app.core.database import Base, engine
    Base.metadata.create_all(bind=engine)
    changes = 0
    try:
        # 1. Seed super_admin role for database superusers
        superusers = db.query(AuthUser).filter(AuthUser.is_superuser == True).all()
        for su in superusers:
            changes += ensure_role(db, su, "super_admin", "global", args.apply, UserRole)


        assigned_user_ids = [row[0] for row in db.query(DomainAssignment.user_id).distinct().all()]
        for user_id in assigned_user_ids:
            user = db.query(AuthUser).filter(AuthUser.id == user_id).first()
            if not user:
                continue
            has_role = db.query(UserRole).filter(UserRole.user_id == user.id).first() is not None
            if has_role:
                continue
            changes += ensure_role(db, user, args.default_assigned_role, "global", args.apply, UserRole)

        if args.apply:
            db.commit()
            print(f"Applied {changes} changes.")
        else:
            db.rollback()
            print(f"Dry run complete. {changes} changes would be applied. Re-run with --apply to write.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
