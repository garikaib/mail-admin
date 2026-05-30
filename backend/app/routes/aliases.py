import re
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.models import AuthUser, MailDomain, MailAlias, DomainAllocation, AdminLog
from backend.app.schemas import AliasCreate, AliasUpdate, AliasResponse
from backend.app.core.permissions import require_domain_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aliases", tags=["aliases"])

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

@router.get("/domain/{domain_name}", response_model=List[AliasResponse])
def list_aliases(
    domain_name: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    List all aliases inside a specific domain.
    """
    require_domain_permission(current_user, db, domain_name, "aliases:read")

    domain = db.query(MailDomain).filter(MailDomain.name == domain_name).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    aliases = db.query(MailAlias).filter(MailAlias.domain_id == domain.id).order_by(MailAlias.source).all()
    return aliases

@router.post("/domain/{domain_name}", response_model=AliasResponse)
def create_alias(
    domain_name: str,
    alias_data: AliasCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Create a new alias (forwarding address) in a domain.
    """
    require_domain_permission(current_user, db, domain_name, "aliases:create")

    domain = db.query(MailDomain).filter(MailDomain.name == domain_name).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    # Check limit against plan
    alloc = db.query(DomainAllocation).filter(DomainAllocation.domain_name == domain_name).first()
    max_aliases = domain.max_aliases
    if alloc and alloc.plan:
        max_aliases = alloc.plan.max_aliases
        
    current_count = db.query(MailAlias).filter(
        MailAlias.domain_id == domain.id,
        MailAlias.managed_by_platform == True
    ).count()
    
    if current_count >= max_aliases:
        raise HTTPException(status_code=400, detail=f"Plan alias limit reached ({max_aliases}).")
        
    source_username = alias_data.source.strip().lower()
    if "@" in source_username:
        source_username = source_username.split("@")[0]
        
    # Validate source username chars
    if not re.match(r'^[a-zA-Z0-9._-]+$', source_username):
         raise HTTPException(status_code=400, detail="Invalid source alias username.")
         
    destination = alias_data.destination.strip().lower()
    # Validate destination email format (can be multiple separated by commas, or single)
    emails = [e.strip() for e in destination.split(",") if e.strip()]
    for email in emails:
        if not re.match(r'[^@]+@[^@]+\.[^@]+', email):
             raise HTTPException(status_code=400, detail=f"Invalid destination email address: '{email}'")
             
    source = f"{source_username}@{domain_name}"
    
    # Check if duplicate exists
    existing = db.query(MailAlias).filter(
        MailAlias.source == source,
        MailAlias.destination == destination
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Alias {source} -> {destination} already exists.")
        
    alias = MailAlias(
        source=source,
        destination=destination,
        domain_id=domain.id,
        managed_by_platform=True
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    
    audit_log(db, current_user.username, "CREATE_ALIAS", source, f"To: {destination}")
    return alias

@router.put("/{alias_id}", response_model=AliasResponse)
def update_alias(
    alias_id: int,
    alias_data: AliasUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Update alias destinations.
    """
    alias = db.query(MailAlias).filter(MailAlias.id == alias_id).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")
        
    domain = db.query(MailDomain).filter(MailDomain.id == alias.domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    require_domain_permission(current_user, db, domain.name, "aliases:update")
        
    if not alias.managed_by_platform:
        raise HTTPException(status_code=403, detail="System aliases cannot be modified by user.")
        
    destination = alias_data.destination.strip().lower()
    emails = [e.strip() for e in destination.split(",") if e.strip()]
    for email in emails:
        if not re.match(r'[^@]+@[^@]+\.[^@]+', email):
             raise HTTPException(status_code=400, detail=f"Invalid destination email address: '{email}'")
             
    old_dest = alias.destination
    alias.destination = destination
    db.commit()
    db.refresh(alias)
    
    audit_log(db, current_user.username, "EDIT_ALIAS", alias.source, f"Changed: {old_dest} -> {destination}")
    return alias

@router.delete("/{alias_id}")
def delete_alias(
    alias_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Delete an existing alias.
    """
    alias = db.query(MailAlias).filter(MailAlias.id == alias_id).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")
        
    domain = db.query(MailDomain).filter(MailDomain.id == alias.domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    require_domain_permission(current_user, db, domain.name, "aliases:delete")
        
    source = alias.source
    dest = alias.destination
    db.delete(alias)
    db.commit()
    
    audit_log(db, current_user.username, "DELETE_ALIAS", source, f"To: {dest}")
    return {"message": "Alias deleted successfully"}
