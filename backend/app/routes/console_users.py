import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.models import AuthUser, UserRole, DomainAssignment, AdminLog
from backend.app.schemas import ConsoleUserResponse, ConsoleUserCreate, ConsoleUserUpdate
from backend.app.core.permissions import require_permission, is_super_admin
from backend.app.core.security import hash_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/console-users", tags=["Console Users"])

def audit_log(db: Session, admin_email: str, action: str, target: str, details: str = ""):
    """Helper to log administrative actions."""
    try:
        log_entry = AdminLog(
            admin_email=admin_email,
            action=action,
            target=target,
            details=details,
            timestamp=datetime.utcnow()
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

@router.get("", response_model=List[ConsoleUserResponse])
def list_console_users(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    List all administrator console users.
    """
    require_permission(current_user, db, "users:read")
    users = db.query(AuthUser).order_by(AuthUser.username).all()
    return users

@router.post("", response_model=ConsoleUserResponse, status_code=status.HTTP_201_CREATED)
def create_console_user(
    req: ConsoleUserCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Create a new platform console user, assign roles and scoped domains.
    """
    require_permission(current_user, db, "users:create")

    # Check if user already exists
    email = req.username.strip().lower()
    existing = db.query(AuthUser).filter(AuthUser.username == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Console user already exists with this email address."
        )

    # Hash the password using standard sha512_crypt hash
    hashed = hash_password(req.password)

    new_user = AuthUser(
        username=email,
        email=email,
        password=hashed,
        is_superuser=req.is_superuser,
        first_name="",
        last_name="",
        is_staff=req.is_superuser, # Standard default staff setting
        is_active=True,
        date_joined=datetime.utcnow()
    )

    try:
        db.add(new_user)
        db.flush()  # Populate new_user.id

        # Insert user roles
        for role_name in req.roles:
            role_entry = UserRole(user_id=new_user.id, role=role_name, scope="global")
            db.add(role_entry)

        # Insert domain assignments
        for domain_name in req.domains:
            assignment = DomainAssignment(user_id=new_user.id, domain_name=domain_name)
            db.add(assignment)

        db.commit()
        db.refresh(new_user)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create console user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save user: {e}"
        )

    audit_log(db, current_user.username, "CREATE_CONSOLE_USER", email, f"Roles: {req.roles}, Domains: {req.domains}")
    return new_user

@router.put("/{user_id}", response_model=ConsoleUserResponse)
def update_console_user(
    user_id: int,
    req: ConsoleUserUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Update an existing console user's settings, active status, roles, or domain assignments.
    """
    require_permission(current_user, db, "users:update")

    user = db.query(AuthUser).filter(AuthUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Console user not found.")

    # Prevent self-demotion or disabling active superuser account
    if user.id == current_user.id:
        if req.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot disable your own active session account."
            )
        if req.is_superuser is False and current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot remove superuser privilege from yourself."
            )

    # Prevent demotion/deactivation of the last remaining active super admin
    if user.is_superuser and user.is_active:
        will_demote = (req.is_superuser is False)
        will_deactivate = (req.is_active is False)
        if will_demote or will_deactivate:
            other_active_supers = db.query(AuthUser).filter(
                AuthUser.is_superuser == True,
                AuthUser.is_active == True,
                AuthUser.id != user.id
            ).count()
            if other_active_supers == 0:
                action_str = "demote" if will_demote else "deactivate"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot {action_str} the last remaining active super administrator in the system."
                )

    updates = []
    if req.is_active is not None:
        user.is_active = req.is_active
        updates.append(f"is_active={req.is_active}")

    if req.is_superuser is not None:
        user.is_superuser = req.is_superuser
        user.is_staff = req.is_superuser
        updates.append(f"is_superuser={req.is_superuser}")

    if req.password is not None:
        user.password = hash_password(req.password)
        updates.append("password_changed=true")

    try:
        # Update Roles if list provided
        if req.roles is not None:
            # Cannot modify own roles to prevent lockouts
            if user.id == current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You cannot modify your own assigned Casbin roles directly."
                )
            # Remove previous roles
            db.query(UserRole).filter(UserRole.user_id == user.id).delete()
            # Add new roles
            for role_name in req.roles:
                role_entry = UserRole(user_id=user.id, role=role_name, scope="global")
                db.add(role_entry)
            updates.append(f"roles={req.roles}")

        # Update Scoped Domains if list provided
        if req.domains is not None:
            # Remove previous assignments
            db.query(DomainAssignment).filter(DomainAssignment.user_id == user.id).delete()
            # Add new assignments
            for domain_name in req.domains:
                assignment = DomainAssignment(user_id=user.id, domain_name=domain_name)
                db.add(assignment)
            updates.append(f"domains={req.domains}")

        db.commit()
        db.refresh(user)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update console user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user: {e}"
        )

    audit_log(db, current_user.username, "UPDATE_CONSOLE_USER", user.username, f"Updates: {', '.join(updates)}")
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_console_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Delete a console user account from the system.
    """
    require_permission(current_user, db, "users:delete")

    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Self-deletion of active session user is not permitted."
        )

    user = db.query(AuthUser).filter(AuthUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Console user not found.")

    # Prevent deleting the last remaining active super administrator
    if user.is_superuser and user.is_active:
        other_active_supers = db.query(AuthUser).filter(
            AuthUser.is_superuser == True,
            AuthUser.is_active == True,
            AuthUser.id != user.id
        ).count()
        if other_active_supers == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining active super administrator in the system."
            )

    username = user.username
    try:
        db.delete(user)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete console user {username}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {e}"
        )

    audit_log(db, current_user.username, "DELETE_CONSOLE_USER", username)
    return None
