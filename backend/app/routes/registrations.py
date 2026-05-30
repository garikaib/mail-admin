import socket
import logging
from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.core.permissions import require_permission
from backend.app.models import AuthUser, DomainRegistration, EncryptedCloudflareCredential, MailDomain
from backend.app.schemas import (
    DomainCheckRequest,
    DomainCheckResponse,
    DomainAddCloudflareRequest,
    CloudflareAddResponse,
    DomainRegistrationCreate,
    DomainRegistrationResponse,
    BulkRegistrationRequest,
    BulkRegistrationResponse
)
from backend.app.services.cloudflare import CloudflareService
from backend.app.services.template_service import generate_zispa_template
from backend.app.services.email_service import send_zispa_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/registrations", tags=["registrations"])

def _credential_allowed(current_user: AuthUser, db: Session, credential_id: int) -> bool:
    if current_user.is_superuser:
        return True
    from backend.app.models import UserCredentialAssignment
    return db.query(UserCredentialAssignment).filter(
        UserCredentialAssignment.user_id == current_user.id,
        UserCredentialAssignment.credential_id == credential_id
    ).first() is not None

def check_domain_registered(domain: str) -> bool:
    import dns.resolver
    resolver = dns.resolver.Resolver()
    resolver.timeout = 2.0
    resolver.lifetime = 2.0
    try:
        resolver.resolve(domain, 'NS')
        return True
    except dns.resolver.NXDOMAIN:
        return False
    except (dns.resolver.NoNameservers, dns.resolver.NoAnswer):
        try:
            resolver.resolve(domain, 'SOA')
            return True
        except dns.resolver.NXDOMAIN:
            return False
        except Exception:
            return False
    except Exception:
        try:
            resolver.resolve(domain, 'SOA')
            return True
        except Exception:
            return False

@router.post("/check-domain", response_model=DomainCheckResponse)
def check_domain(
    payload: DomainCheckRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if domain is registered publicly or exists in local domains database."""
    require_permission(current_user, db, "registrations:create")
    domain = payload.domain.strip().lower()
    
    # Validate format
    if not domain.endswith(".co.zw") or len(domain) < 8:
        return DomainCheckResponse(domain=domain, exists=False, is_valid=False, error_message="Domain must be a valid .co.zw domain")
        
    # Check local database
    exists_local = db.query(MailDomain).filter(MailDomain.name == domain).first() is not None
    if exists_local:
        return DomainCheckResponse(domain=domain, exists=True)
        
    # Check public DNS
    is_registered = check_domain_registered(domain)
    return DomainCheckResponse(domain=domain, exists=is_registered)

@router.post("/add-cloudflare", response_model=CloudflareAddResponse)
def add_cloudflare(
    payload: DomainAddCloudflareRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify zone on Cloudflare, creating it if missing, and resolve nameservers."""
    require_permission(current_user, db, "registrations:create")
    domain = payload.domain.strip().lower()
    
    # Check credentials authorization
    if not _credential_allowed(current_user, db, payload.credential_id):
        raise HTTPException(status_code=403, detail="Not authorized to use this credential")
        
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == payload.credential_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    api_key = cred.get_api_key()
    cf = CloudflareService(email=cred.email, api_key=api_key)
    
    zone_id = None
    nameservers = []
    
    # Check if zone already exists on Cloudflare
    try:
        zone_id = cf.get_zone_id(domain)
    except Exception:
        zone_id = None
        
    if zone_id:
        # Zone exists, get zone details to retrieve nameservers
        zone_details = cf.get_zone(zone_id)
        if zone_details:
            nameservers = zone_details.get("name_servers", [])
    else:
        # Zone doesn't exist, create it
        account_id = cf.get_first_account_id()
        if not account_id:
            raise HTTPException(status_code=400, detail="Could not resolve Cloudflare account ID to create zone")
            
        zone_result = cf.create_zone(domain, account_id)
        if not zone_result:
            raise HTTPException(status_code=400, detail="Failed to create zone on Cloudflare")
            
        zone_id = zone_result.get("id")
        nameservers = zone_result.get("name_servers", [])
        
    if not zone_id or not nameservers:
        raise HTTPException(status_code=500, detail="Failed to obtain zone details and nameservers from Cloudflare")
        
    # Get NS hostnames and IPs
    ns1_hostname = nameservers[0] if len(nameservers) > 0 else None
    ns2_hostname = nameservers[1] if len(nameservers) > 1 else None
    
    ns1_ip = ""
    if ns1_hostname:
        try:
            ns1_ip = socket.gethostbyname(ns1_hostname)
        except Exception:
            ns1_ip = ""
            
    ns2_ip = ""
    if ns2_hostname:
        try:
            ns2_ip = socket.gethostbyname(ns2_hostname)
        except Exception:
            ns2_ip = ""
            
    # Default owner details to pre-populate the UI form
    default_owner = {
        "owner_name": "",
        "owner_org": "Civil Engineering Projects",
        "owner_address": "",
        "owner_city": "Harare",
        "owner_country": "Zimbabwe",
        "owner_phone": "",
        "owner_fax": "None",
        "owner_email": current_user.email or ""
    }
    
    return CloudflareAddResponse(
        domain=domain,
        zone_id=zone_id,
        ns1_hostname=ns1_hostname,
        ns1_ip=ns1_ip,
        ns2_hostname=ns2_hostname,
        ns2_ip=ns2_ip,
        default_owner=default_owner
    )

@router.get("", response_model=List[DomainRegistrationResponse])
def list_registrations(
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all registrations submitted by the user or all for super_admin."""
    require_permission(current_user, db, "registrations:read")
    if current_user.is_superuser:
        return db.query(DomainRegistration).order_by(DomainRegistration.submitted_at.desc()).all()
    else:
        return db.query(DomainRegistration).filter(DomainRegistration.submitted_by == current_user.id).order_by(DomainRegistration.submitted_at.desc()).all()

@router.post("/submit", response_model=DomainRegistrationResponse)
def submit_registration(
    payload: DomainRegistrationCreate,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Store registration, generate ZISPA plain ASCII file, and email it."""
    require_permission(current_user, db, "registrations:submit")
    domain = payload.domain_name.strip().lower()
    
    # Check if duplicate registration log exists
    existing_reg = db.query(DomainRegistration).filter(DomainRegistration.domain_name == domain).first()
    if existing_reg:
        raise HTTPException(status_code=400, detail="A registration record for this domain already exists")
        
    # Check credentials authorization if provided
    if payload.credential_id and not _credential_allowed(current_user, db, payload.credential_id):
        raise HTTPException(status_code=403, detail="Not authorized to use this credential")
        
    # Create DB entry
    reg = DomainRegistration(
        domain_name=domain,
        action=payload.action,
        cf_email=payload.cf_email,
        owner_name=payload.owner_name,
        owner_org=payload.owner_org,
        owner_address=payload.owner_address,
        owner_city=payload.owner_city,
        owner_country=payload.owner_country,
        owner_phone=payload.owner_phone,
        owner_fax=payload.owner_fax,
        owner_email=payload.owner_email,
        zone_id=payload.zone_id,
        ns1_hostname=payload.ns1_hostname,
        ns1_ip=payload.ns1_ip,
        ns2_hostname=payload.ns2_hostname,
        ns2_ip=payload.ns2_ip,
        status="email_pending",
        submitted_by=current_user.id,
        credential_used=payload.credential_id
    )
    
    db.add(reg)
    db.commit()
    db.refresh(reg)
    
    # Generate and email ZISPA template
    template_content = generate_zispa_template(reg)
    success, msg = send_zispa_email(db, domain, template_content, reg.action)
    
    if success:
        reg.status = "submitted"
        reg.email_sent_at = datetime.utcnow()
    else:
        reg.status = "failed"
        reg.error_message = msg
        
    db.commit()
    db.refresh(reg)
    return reg

@router.post("/{reg_id}/email-template", response_model=DomainRegistrationResponse)
def email_template(
    reg_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually regenerate and email the registration template."""
    require_permission(current_user, db, "registrations:submit")
    
    reg = db.query(DomainRegistration).filter(DomainRegistration.id == reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration record not found")
        
    if not current_user.is_superuser and reg.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to resubmit this registration")
        
    # Generate and email
    template_content = generate_zispa_template(reg)
    success, msg = send_zispa_email(db, reg.domain_name, template_content, reg.action)
    
    if success:
        reg.status = "submitted"
        reg.email_sent_at = datetime.utcnow()
        reg.error_message = ""
    else:
        reg.status = "failed"
        reg.error_message = msg
        
    db.commit()
    db.refresh(reg)
    return reg

@router.post("/bulk", response_model=BulkRegistrationResponse)
def bulk_register_domains(
    payload: BulkRegistrationRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Process domains in bulk: Add to Cloudflare (up to 50), group by nameservers, and register."""
    require_permission(current_user, db, "registrations:submit")
    
    # Check credentials authorization
    if not _credential_allowed(current_user, db, payload.credential_id):
        raise HTTPException(status_code=403, detail="Not authorized to use this credential")
        
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == payload.credential_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    api_key = cred.get_api_key()
    cf = CloudflareService(email=cred.email, api_key=api_key)
    
    # Cloudflare account ID (needed to add zone)
    account_id = None
    try:
        account_id = cf.get_first_account_id()
    except Exception as e:
        logger.error(f"Failed to retrieve Cloudflare account ID: {e}")
        
    if not account_id:
        raise HTTPException(status_code=400, detail="Could not resolve Cloudflare account ID to process zones")
        
    success_domains = []
    failed_domains = []
    
    # Process up to 50 domains
    domains_to_process = [d.strip().lower() for d in payload.domains if d.strip()][:50]
    
    for domain in domains_to_process:
        # Validate format
        if not domain.endswith(".co.zw") or len(domain) < 8:
            failed_domains.append(f"{domain} (invalid format)")
            continue
            
        # Check if already exists in DB
        exists_local = db.query(DomainRegistration).filter(DomainRegistration.domain_name == domain).first() is not None
        if exists_local:
            failed_domains.append(f"{domain} (already in registrations)")
            continue
            
        zone_id = None
        nameservers = []
        
        # Check or Create zone in Cloudflare
        try:
            zone_id = cf.get_zone_id(domain)
        except Exception:
            zone_id = None
            
        if not zone_id:
            try:
                zone_result = cf.create_zone(domain, account_id)
                if zone_result:
                    zone_id = zone_result.get("id")
                    nameservers = zone_result.get("name_servers", [])
            except Exception as e:
                logger.error(f"Failed to create zone for {domain} in bulk process: {e}")
                
        if zone_id and not nameservers:
            try:
                zone_details = cf.get_zone(zone_id)
                if zone_details:
                    nameservers = zone_details.get("name_servers", [])
            except Exception as e:
                logger.error(f"Failed to get zone details for {domain}: {e}")
                
        if not zone_id or not nameservers:
            failed_domains.append(f"{domain} (Cloudflare zone setup failed)")
            continue
            
        # Resolve NS IPs
        ns1_hostname = nameservers[0] if len(nameservers) > 0 else None
        ns2_hostname = nameservers[1] if len(nameservers) > 1 else None
        
        ns1_ip = ""
        if ns1_hostname:
            try:
                ns1_ip = socket.gethostbyname(ns1_hostname)
            except Exception:
                ns1_ip = ""
                
        ns2_ip = ""
        if ns2_hostname:
            try:
                ns2_ip = socket.gethostbyname(ns2_hostname)
            except Exception:
                ns2_ip = ""
                
        success_domains.append({
            "domain": domain,
            "zone_id": zone_id,
            "ns1_hostname": ns1_hostname,
            "ns1_ip": ns1_ip,
            "ns2_hostname": ns2_hostname,
            "ns2_ip": ns2_ip
        })
        
    # Group successful domains by nameserver combination
    groups = {}
    for item in success_domains:
        key = (item["ns1_hostname"], item["ns1_ip"], item["ns2_hostname"], item["ns2_ip"])
        if key not in groups:
            groups[key] = []
        groups[key].append(item)
        
    # 1. Create DB registrations for all successful domains
    all_success_domain_names = []
    db_regs = []
    for item in success_domains:
        reg = DomainRegistration(
            domain_name=item["domain"],
            action=payload.action,
            cf_email=cred.email,
            owner_name=payload.owner_name,
            owner_org=payload.owner_org,
            owner_address=payload.owner_address,
            owner_city=payload.owner_city,
            owner_country=payload.owner_country,
            owner_phone=payload.owner_phone,
            owner_fax=payload.owner_fax,
            owner_email=payload.owner_email,
            zone_id=item["zone_id"],
            ns1_hostname=item["ns1_hostname"],
            ns1_ip=item["ns1_ip"],
            ns2_hostname=item["ns2_hostname"],
            ns2_ip=item["ns2_ip"],
            status="submitted",
            submitted_by=current_user.id,
            credential_used=payload.credential_id,
            email_sent_at=datetime.utcnow()
        )
        db.add(reg)
        db_regs.append(reg)
        all_success_domain_names.append(item["domain"])
        
    db.commit()

    # 2. Build single consolidated text attachment grouping domains by nameservers
    attachment_groups = []
    for key, items in groups.items():
        ns1_h, ns1_i, ns2_h, ns2_i = key
        group_lines = [
            f"{ns1_h or 'None'} ({ns1_i or 'Unresolved'})",
            f"{ns2_h or 'None'} ({ns2_i or 'Unresolved'})",
            ""
        ]
        for item in items:
            group_lines.append(item["domain"])
        attachment_groups.append("\n".join(group_lines))
        
    attachment_content = "\n\n".join(attachment_groups)

    # 3. Send a single email with the consolidated attachment
    from backend.app.services.email_service import send_bulk_edit_email
    success, msg = send_bulk_edit_email(
        db,
        all_success_domain_names,
        attachment_content
    )
    
    if not success:
        logger.error(f"Failed to send consolidated bulk edit email: {msg}")
        # Mark registrations as failed instead of submitted
        for r in db_regs:
            r.status = "failed"
            r.error_message = f"Email dispatch failed: {msg}"
        db.commit()
        
    return BulkRegistrationResponse(
        success_count=len(success_domains),
        failed_count=len(failed_domains) + (len(payload.domains) - len(domains_to_process)),
        groups_created=len(groups),
        failed_domains=failed_domains
    )

@router.post("/{reg_id}/poll", response_model=DomainRegistrationResponse)
def poll_registration_status(
    reg_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Recheck if domain has been registered/activated publicly on DNS."""
    require_permission(current_user, db, "registrations:submit")
    
    reg = db.query(DomainRegistration).filter(DomainRegistration.id == reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration record not found")
        
    # Check if domain exists on public DNS resolver
    is_registered = check_domain_registered(reg.domain_name)
    if is_registered:
        reg.status = "active"
        reg.activated_at = datetime.utcnow()
        db.commit()
        db.refresh(reg)
    
    return reg

@router.delete("/{reg_id}")
def delete_registration(
    reg_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a registration record from log."""
    require_permission(current_user, db, "registrations:delete")
    
    reg = db.query(DomainRegistration).filter(DomainRegistration.id == reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration record not found")
        
    if not current_user.is_superuser and reg.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this registration")
        
    db.delete(reg)
    db.commit()
    return {"status": "success", "message": "Registration record deleted"}
