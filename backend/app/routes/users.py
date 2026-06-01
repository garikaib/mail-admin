import re
import os
import logging
from backend.app.core.sudo import run_sudo
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.hash import sha512_crypt
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.models import AuthUser, MailDomain, MailUser, MailPlan, DomainAllocation, AdminLog
from backend.app.schemas import UserCreate, UserUpdate, UserResponse
from backend.app.core.permissions import is_super_admin, require_domain_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

def audit_log(db: Session, admin_email: str, action: str, target: str, details: str = ""):
    """Helper to log administrative actions."""
    try:
        log_entry = AdminLog(
            admin_email=admin_email,
            action=action,
            target=target,
            details=details
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

def is_protected_account(email: str, db: Session) -> bool:
    """Check if the email belongs to a superuser or staff platform admin."""
    user = db.query(AuthUser).filter(AuthUser.username == email).first()
    return user is not None and user.is_superuser

def generate_random_password(length=16):
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@router.get("/domain/{domain_name}", response_model=List[UserResponse])
def list_mailbox_users(
    domain_name: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    List all mailbox users inside a specific domain.
    """
    require_domain_permission(current_user, db, domain_name, "mailboxes:read")

    domain = db.query(MailDomain).filter(MailDomain.name == domain_name).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    users = db.query(MailUser).filter(MailUser.domain_id == domain.id).order_by(MailUser.email).all()
    
    # Hide protected accounts (superusers) if requester is not a superuser
    if not is_super_admin(current_user):
        filtered_users = []
        for u in users:
            if not is_protected_account(u.email, db):
                filtered_users.append(u)
        return filtered_users
        
    return users

@router.post("/domain/{domain_name}", response_model=UserResponse)
def create_mailbox_user(
    domain_name: str,
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Create a new mailbox user in a domain.
    Automatically generates a secure Maildir folder and hashes the password with SHA512-CRYPT.
    """
    require_domain_permission(current_user, db, domain_name, "mailboxes:create")

    domain = db.query(MailDomain).filter(MailDomain.name == domain_name).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    # Check limit against plan
    alloc = db.query(DomainAllocation).filter(DomainAllocation.domain_name == domain_name).first()
    max_users = domain.max_users
    quota_kb = user_data.quota_kb
    
    if alloc and alloc.plan:
        max_users = alloc.plan.max_users
        quota_kb = alloc.plan.quota_mb * 1024
        
    current_users_count = db.query(MailUser).filter(MailUser.domain_id == domain.id).count()
    if current_users_count >= max_users:
        raise HTTPException(
            status_code=400, 
            detail=f"Plan mailbox limit reached ({max_users}). Upgrade your plan to add more."
        )
        
    # Extract local part from email
    email = user_data.email.strip().lower()
    if "@" not in email:
        email = f"{email}@{domain_name}"
        
    username = email.split("@")[0]
    
    # Validate username to prevent path traversal
    if not re.match(r'^[a-zA-Z0-9._-]+$', username):
        raise HTTPException(status_code=400, detail="Invalid username. Only letters, numbers, dots, underscores, and hyphens are allowed.")
        
    if db.query(MailUser).filter(MailUser.email == email).first():
        raise HTTPException(status_code=400, detail=f"Mailbox {email} already exists.")
        
    # Hash password (using rounds=5000)
    pwd = user_data.password
    hashed_pwd = sha512_crypt.using(rounds=5000).hash(pwd)
    if not hashed_pwd.startswith('{SHA512-CRYPT}'):
        hashed_pwd = f"{{SHA512-CRYPT}}{hashed_pwd}"
        
    # Create DB entry
    db_user = MailUser(
        uid=email,
        email=email,
        password=hashed_pwd,
        full_name=user_data.full_name or username,
        name=user_data.name,
        domain_id=domain.id,
        quota_kb=quota_kb
    )
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save user to database: {e}")
        
    # Generate maildir
    maildir_path = f"/var/vmail/{domain_name}/{username}"
    try:
        run_sudo(["/usr/bin/mkdir", "-p", maildir_path], check=True)
        run_sudo(["/usr/bin/chown", "-R", "vmail:vmail", f"/var/vmail/{domain_name}"], check=True)
    except Exception as e:
        logger.error(f"Maildir creation failed for {email}: {e}")
        # We don't rollback the DB transaction as the mailbox is already created and can be fixed later
        
    audit_log(db, current_user.username, "CREATE_USER", email, f"Hashed with SHA512-CRYPT. Quota: {quota_kb}KB")
    return db_user

@router.put("/{email}", response_model=UserResponse)
def update_mailbox_user(
    email: str,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Update an existing mailbox user's settings.
    """
    email = email.strip().lower()
    db_user = db.query(MailUser).filter(MailUser.email == email).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Mailbox user not found.")
        
    domain = db.query(MailDomain).filter(MailDomain.id == db_user.domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    require_domain_permission(current_user, db, domain.name, "mailboxes:update")
        
    if is_protected_account(email, db) and not is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Cannot manage protected administrator accounts.")
        
    updates = {}
    if user_data.password:
        hashed_pwd = sha512_crypt.using(rounds=5000).hash(user_data.password)
        if not hashed_pwd.startswith('{SHA512-CRYPT}'):
            hashed_pwd = f"{{SHA512-CRYPT}}{hashed_pwd}"
        db_user.password = hashed_pwd
        updates["password"] = "Updated"
        
    if user_data.full_name is not None:
        db_user.full_name = user_data.full_name
        updates["full_name"] = user_data.full_name
        
    if user_data.name is not None:
        db_user.name = user_data.name
        updates["name"] = user_data.name
        
    if user_data.quota_kb is not None:
        db_user.quota_kb = user_data.quota_kb
        updates["quota_kb"] = user_data.quota_kb
        
    db.commit()
    db.refresh(db_user)
    
    audit_log(db, current_user.username, "EDIT_USER", email, f"Updates: {updates}")
    return db_user

@router.post("/{email}/reset-password")
def reset_mailbox_password(
    email: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Reset a mailbox user's password to a newly generated secure random one.
    """
    email = email.strip().lower()
    db_user = db.query(MailUser).filter(MailUser.email == email).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Mailbox user not found.")
        
    domain = db.query(MailDomain).filter(MailDomain.id == db_user.domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    require_domain_permission(current_user, db, domain.name, "mailboxes:reset_password")
        
    if is_protected_account(email, db) and not is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Cannot manage protected administrator accounts.")
        
    new_pwd = generate_random_password()
    hashed_pwd = sha512_crypt.using(rounds=5000).hash(new_pwd)
    if not hashed_pwd.startswith('{SHA512-CRYPT}'):
        hashed_pwd = f"{{SHA512-CRYPT}}{hashed_pwd}"
        
    db_user.password = hashed_pwd
    db.commit()
    
    audit_log(db, current_user.username, "RESET_PASSWORD", email)
    return {"message": "Password reset successfully", "new_password": new_pwd}

@router.delete("/{email}")
def delete_mailbox_user(
    email: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Delete a mailbox user and purge their physical directories from the server.
    """
    email = email.strip().lower()
    db_user = db.query(MailUser).filter(MailUser.email == email).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Mailbox user not found.")
        
    domain = db.query(MailDomain).filter(MailDomain.id == db_user.domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    require_domain_permission(current_user, db, domain.name, "mailboxes:delete")
        
    if email == current_user.username:
        raise HTTPException(status_code=400, detail="Self-deletion of active session user is not permitted.")
        
    if is_protected_account(email, db) and not is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Cannot manage protected administrator accounts.")
        
    # Check format to prevent command injection/path traversal
    if not re.match(r'^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$', email):
        raise HTTPException(status_code=400, detail="Security violation: malformed email username.")
        
    username = email.split("@")[0]
    
    # 1. Physical Purge (Maildir)
    maildir_path = f"/var/vmail/{domain.name}/{username}"
    try:
        run_sudo(["/usr/bin/rm", "-rf", maildir_path], check=True)
    except Exception as e:
        logger.error(f"Failed to purge Maildir for {email}: {e}")
        
    # 2. Database purge
    db.delete(db_user)
    
    # 3. Clean local platform user if present
    auth_user = db.query(AuthUser).filter(AuthUser.username == email).first()
    if auth_user:
        db.delete(auth_user)
        
    db.commit()
    
    audit_log(db, current_user.username, "PURGE_USER", email)
    return {"message": f"User {email} has been completely purged."}
