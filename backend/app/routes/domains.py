import os
import re
import logging
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.core.permissions import (
    assigned_domain_names,
    is_super_admin,
    require_domain_permission,
    require_permission,
    can_manage_domain,
)
from backend.app.models import (
    MailDomain, MailUser, MailAlias, AuthUser, DomainAllocation, 
    MailPlan, EncryptedCloudflareCredential, 
    DomainProvisioningLog, DomainZoneToken,
    UserCredentialAssignment, CredentialDomainAssignment, AdminLog
)
from backend.app.schemas import DomainResponse, DomainProvisionRequest, CloudflareCredentialCreate, CloudflareCredentialUpdate, MailPlanResponse, ProvisioningLogResponse, ZoneOwnershipResponse, CloudflareZoneResponse, DNSRecordInput
from backend.app.services.provisioner import DomainProvisioner
from backend.app.services.cloudflare import CloudflareService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/domains", tags=["domains"])



def _credential_allowed(current_user: AuthUser, db: Session, credential_id: int) -> bool:
    if is_super_admin(current_user):
        return True
    return db.query(UserCredentialAssignment).filter(
        UserCredentialAssignment.user_id == current_user.id,
        UserCredentialAssignment.credential_id == credential_id
    ).first() is not None

def _credentials_for_user(current_user: AuthUser, db: Session) -> list[EncryptedCloudflareCredential]:
    if is_super_admin(current_user):
        return db.query(EncryptedCloudflareCredential).all()
    assignments = db.query(UserCredentialAssignment).filter(UserCredentialAssignment.user_id == current_user.id).all()
    return [a.credential for a in assignments if a.credential]

def _default_client_credential(current_user: AuthUser, db: Session) -> Optional[EncryptedCloudflareCredential]:
    default_email = os.getenv("DEFAULT_CLIENT_CLOUDFLARE_EMAIL", "gbdzoma@gmail.com").strip().lower()
    for cred in _credentials_for_user(current_user, db):
        if (cred.email or "").strip().lower() == default_email:
            return cred
    return None

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

def get_user_allowed_domains(user: AuthUser, db: Session) -> List[str]:
    """Return domain names in the user's object scope."""
    if is_super_admin(user):
        domains = db.query(MailDomain).all()
        return [d.name for d in domains]
    return assigned_domain_names(user, db)

@router.get("", response_model=List[DomainResponse])
def list_domains(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    List all domains the current user is authorized to manage.
    """
    require_permission(current_user, db, "domains:read")
    allowed_domains = get_user_allowed_domains(current_user, db)
    
    if is_super_admin(current_user):
        domains = db.query(MailDomain).all()
    else:
        domains = db.query(MailDomain).filter(MailDomain.name.in_(allowed_domains)).all()
        
    response = []
    for d in domains:
        alloc = db.query(DomainAllocation).filter(DomainAllocation.domain_name == d.name).first()
        plan_name = "Custom"
        plan_id = None
        if alloc and alloc.plan:
            plan_name = alloc.plan.name
            plan_id = alloc.plan.id
            
        response.append(DomainResponse(
            id=d.id,
            name=d.name,
            max_users=d.max_users,
            max_aliases=d.max_aliases,
            is_active=d.is_active,
            plan_name=plan_name,
            plan_id=plan_id
        ))
    return response

@router.get("/plans", response_model=List[MailPlanResponse])
def get_plans(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    List all hosting/mailbox plans available.
    """
    require_permission(current_user, db, "plans:read")
    plans = db.query(MailPlan).all()
    return plans

@router.post("/plans", response_model=MailPlanResponse)
def create_plan(
    name: str,
    max_users: int,
    max_aliases: int,
    quota_mb: int,
    is_default: bool = False,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Create a new mail plan (Superusers only).
    """
    require_permission(current_user, db, "plans:create")
    existing = db.query(MailPlan).filter(MailPlan.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Plan '{name}' already exists.")
        
    plan = MailPlan(
        name=name,
        max_users=max_users,
        max_aliases=max_aliases,
        quota_mb=quota_mb,
        is_default=is_default
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    audit_log(db, current_user.username, "CREATE_PLAN", name, f"Users: {max_users}, Aliases: {max_aliases}, Quota: {quota_mb}MB")
    return plan

@router.put("/plans/{plan_id}", response_model=MailPlanResponse)
def update_plan(
    plan_id: int,
    name: str,
    max_users: int,
    max_aliases: int,
    quota_mb: int,
    is_default: bool = False,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Update an existing mail plan (Superusers only).
    """
    require_permission(current_user, db, "plans:update")
    
    plan = db.query(MailPlan).filter(MailPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    # Check if name is taken by another plan
    existing = db.query(MailPlan).filter(MailPlan.name == name, MailPlan.id != plan_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Plan '{name}' already exists.")
        
    plan.name = name
    plan.max_users = max_users
    plan.max_aliases = max_aliases
    plan.quota_mb = quota_mb
    plan.is_default = is_default
    
    db.commit()
    db.refresh(plan)
    audit_log(db, current_user.username, "UPDATE_PLAN", name, f"Users: {max_users}, Aliases: {max_aliases}, Quota: {quota_mb}MB")
    return plan

@router.delete("/plans/{plan_id}")
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Delete a mail plan (Superusers only).
    """
    require_permission(current_user, db, "plans:delete")
    plan = db.query(MailPlan).filter(MailPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    # Check if plan is allocated
    allocated = db.query(DomainAllocation).filter(DomainAllocation.plan_id == plan_id).first()
    if allocated:
        raise HTTPException(status_code=400, detail="Cannot delete plan that is currently assigned to domains.")
        
    db.delete(plan)
    db.commit()
    audit_log(db, current_user.username, "DELETE_PLAN", plan.name, f"Deleted plan ID {plan_id}")
    return {"message": "Plan deleted successfully"}

@router.get("/credentials")
def list_credentials(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    List Cloudflare credentials.
    """
    require_permission(current_user, db, "credentials:read")
    if is_super_admin(current_user):
        creds = db.query(EncryptedCloudflareCredential).all()
    else:
        # Get credentials linked to this user
        assignments = db.query(UserCredentialAssignment).filter(UserCredentialAssignment.user_id == current_user.id).all()
        creds = [a.credential for a in assignments]
        
    return [{"id": c.id, "label": c.label, "email": c.email, "created_at": c.created_at} for c in creds]

@router.get("/cloudflare-zones", response_model=List[CloudflareZoneResponse])
def list_cloudflare_zones(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """List Cloudflare zones visible to saved credentials the user may access."""
    require_permission(current_user, db, "credentials:read")
    zones = []
    seen = set()
    for cred in _credentials_for_user(current_user, db):
        api_key = cred.get_api_key()
        if not api_key:
            continue
        cf = CloudflareService(cred.email, api_key)
        for zone in cf.list_all_zones():
            zone_id = zone.get("id")
            key = (cred.id, zone_id)
            if not zone_id or key in seen:
                continue
            seen.add(key)
            zones.append(CloudflareZoneResponse(
                name=zone.get("name", ""),
                zone_id=zone_id,
                status=zone.get("status"),
                credential_id=cred.id,
                credential_label=cred.label,
                cf_email=cred.email,
            ))
    return sorted(zones, key=lambda z: (z.cf_email, z.name))

@router.post("/zone-ownership/scan", response_model=List[ZoneOwnershipResponse])
def scan_zone_ownership(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Match current mail domains to the saved Cloudflare credential that owns each zone."""
    require_permission(current_user, db, "credentials:scan_zones")
    allowed_domains = get_user_allowed_domains(current_user, db)
    if is_super_admin(current_user):
        domains = db.query(MailDomain).order_by(MailDomain.name).all()
    else:
        domains = db.query(MailDomain).filter(MailDomain.name.in_(allowed_domains)).order_by(MailDomain.name).all()
    credentials = _credentials_for_user(current_user, db)
    results = []

    for domain in domains:
        matched = None
        for cred in credentials:
            api_key = cred.get_api_key()
            if not api_key:
                continue
            try:
                cf = CloudflareService(cred.email, api_key)
                zone_id = cf.get_zone_id(domain.name)
            except Exception:
                zone_id = None
            if zone_id:
                exists = db.query(CredentialDomainAssignment).filter(
                    CredentialDomainAssignment.credential_id == cred.id,
                    CredentialDomainAssignment.domain_name == domain.name
                ).first()
                if not exists:
                    db.add(CredentialDomainAssignment(credential_id=cred.id, domain_name=domain.name))
                    db.commit()
                matched = ZoneOwnershipResponse(
                    domain=domain.name,
                    credential_id=cred.id,
                    credential_label=cred.label,
                    cf_email=cred.email,
                    zone_id=zone_id,
                    status="matched",
                )
                break
        results.append(matched or ZoneOwnershipResponse(domain=domain.name, status="unmatched"))

    audit_log(db, current_user.username, "SCAN_CF_ZONE_OWNERSHIP", "cloudflare", f"Scanned {len(domains)} domains")
    return results

@router.post("/credentials")
def add_credential(
    credential_data: CloudflareCredentialCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Add a new encrypted Cloudflare credential set.
    """
    require_permission(current_user, db, "credentials:create")
    cred = EncryptedCloudflareCredential(
        label=credential_data.label,
        email=str(credential_data.email),
        is_default=credential_data.is_default
    )
    try:
        cred.set_api_key(credential_data.api_key)
        db.add(cred)
        db.commit()
        db.refresh(cred)
        
        # Create assignment
        assignment = UserCredentialAssignment(
            user_id=current_user.id,
            credential_id=cred.id,
            is_owner=True
        )
        db.add(assignment)
        db.commit()
        
        audit_log(db, current_user.username, "CREATE_CF_CREDENTIAL", credential_data.label, f"Cloudflare email: {credential_data.email}")
        return {"id": cred.id, "label": cred.label, "email": cred.email}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to save credential: {e}")

@router.put("/credentials/{cred_id}")
def update_credential(
    cred_id: int,
    credential_data: CloudflareCredentialUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Update an existing Cloudflare credential set.
    """
    require_permission(current_user, db, "credentials:create")
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    if not _credential_allowed(current_user, db, cred_id):
        raise HTTPException(status_code=403, detail="Not authorized to edit this credential")

    try:
        cred.label = credential_data.label
        cred.email = str(credential_data.email)
        cred.is_default = credential_data.is_default
        
        if credential_data.api_key:
            cred.set_api_key(credential_data.api_key)
            
        db.commit()
        db.refresh(cred)
        
        audit_log(db, current_user.username, "UPDATE_CF_CREDENTIAL", cred.label, f"Updated Cloudflare email: {cred.email}")
        return {"id": cred.id, "label": cred.label, "email": cred.email}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to update credential: {e}")

@router.delete("/credentials/{cred_id}")
def delete_credential(
    cred_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Delete a Cloudflare credential set.
    """
    require_permission(current_user, db, "credentials:delete")
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    # Check ownership for non-global administrators
    if not is_super_admin(current_user):
        assignment = db.query(UserCredentialAssignment).filter(
            UserCredentialAssignment.user_id == current_user.id,
            UserCredentialAssignment.credential_id == cred_id
        ).first()
        if not assignment or not assignment.is_owner:
            raise HTTPException(status_code=403, detail="Unauthorized to delete this credential")
            
    db.delete(cred)
    db.commit()
    audit_log(db, current_user.username, "DELETE_CF_CREDENTIAL", cred.label)
    return {"message": "Credential deleted successfully"}

def _validate_domain_request(domain: str, cf_email: str, cf_key: str, db: Session) -> tuple[bool, str]:
    """Helper to validate domain request before standard provisioning."""
    # 1. Format validation
    pattern = r'^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})+$'
    if not re.match(pattern, domain):
        return False, f"Invalid domain format: '{domain}'"
    
    # 2. Uniqueness check in our DB
    if db.query(MailDomain).filter(MailDomain.name == domain).first() is not None:
        return False, f"Domain '{domain}' already exists in the system."
    
    # 3. Cloudflare zone check
    try:
        cf = CloudflareService(cf_email, cf_key)
        zone_id = cf.get_zone_id(domain)
        if not zone_id:
            # Domain not in Cloudflare, check if it's registered
            try:
                import dns.resolver
                import dns.exception
                
                resolver = dns.resolver.Resolver()
                resolver.timeout = 5.0
                resolver.lifetime = 5.0
                
                is_registered = False
                try:
                    resolver.resolve(domain, 'NS')
                    is_registered = True
                except dns.resolver.NXDOMAIN:
                    is_registered = False
                except (dns.resolver.NoNameservers, dns.resolver.NoAnswer):
                    try:
                        resolver.resolve(domain, 'SOA')
                        is_registered = True
                    except dns.resolver.NXDOMAIN:
                        is_registered = False
                    except Exception:
                        is_registered = False
                
                if not is_registered:
                    return False, "Domain is not registered yet. Please register it first."
                else:
                    return False, "Domain is registered, but it is not present in the selected Cloudflare account. Please add it to Cloudflare first."
            except dns.exception.Timeout:
                return False, "Unable to verify domain registration status right now. DNS timeout."
            except Exception as dns_e:
                return False, f"Unable to verify domain registration status right now. DNS error: {str(dns_e)}"
    except Exception as e:
        return False, f"Cloudflare API Error: {str(e)}"
    
    return True, ""



class DomainProvisionConfirmRequest(BaseModel):
    domain: str
    plan_id: int
    cred_id: Optional[int] = None
    cf_email: Optional[str] = None
    cf_key: Optional[str] = None
    dns_records: List[DNSRecordInput]

def background_provision(domain: str, plan_id: int, email: str, api_key: str, db_session_factory, cred_id: Optional[int], dns_records: Optional[List[dict]] = None):
    """Background provisioning thread runner."""
    logger.info(f"Background provisioning started for {domain}")
    db: Session = db_session_factory()
    try:
        provisioner = DomainProvisioner(cf_email=email, cf_key=api_key)
        success = provisioner.provision(db, domain, plan_id, dns_records=dns_records)
        logger.info(f"Provisioning completed for {domain}. Success: {success}")
        
        if success and cred_id:
            try:
                # Link credential to domain
                exists = db.query(CredentialDomainAssignment).filter(
                    CredentialDomainAssignment.credential_id == cred_id,
                    CredentialDomainAssignment.domain_name == domain
                ).first() is not None
                if not exists:
                    assignment = CredentialDomainAssignment(credential_id=cred_id, domain_name=domain)
                    db.add(assignment)
                    db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to link credential to domain {domain}: {e}")
    except Exception as e:
        logger.error(f"Error in background provisioning for {domain}: {e}")
    finally:
        db.close()

@router.post("/provision")
def provision_domain(
    domain_data: DomainProvisionRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Generate proposed Cloudflare DNS records for review (Superusers only).
    """
    require_permission(current_user, db, "domains:provision")
    domain = domain_data.name.strip().lower()
    plan_id = domain_data.plan_id
    cred_id = domain_data.cred_id
    cf_email = str(domain_data.cf_email) if domain_data.cf_email else None
    cf_key = domain_data.cf_key
    save_cred = domain_data.save_cred
    
    # 0. Basic Concurrency Check
    recent_threshold = datetime.utcnow() - timedelta(minutes=5)
    stale_pending = db.query(DomainProvisioningLog).filter(
        DomainProvisioningLog.domain_name == domain,
        DomainProvisioningLog.status == "PENDING",
        DomainProvisioningLog.created_at >= recent_threshold
    ).first() is not None
    
    if stale_pending:
        latest = db.query(DomainProvisioningLog).filter(DomainProvisioningLog.domain_name == domain).order_by(DomainProvisioningLog.created_at.desc()).first()
        if latest and latest.status == "PENDING":
            raise HTTPException(status_code=400, detail="Provisioning is currently in progress for this domain.")

    email = None
    api_key = None
    
    # 1. Resolve Credentials
    if not cred_id and not cf_email and not cf_key:
        default_cred = _default_client_credential(current_user, db)
        if default_cred:
            cred_id = default_cred.id

    if cred_id:
        cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
        if not cred:
            raise HTTPException(status_code=404, detail="Credential not found")
        if not _credential_allowed(current_user, db, cred_id):
            raise HTTPException(status_code=403, detail="Unauthorized to use this credential")
        api_key = cred.get_api_key()
        if not api_key:
            raise HTTPException(status_code=400, detail="Credential could not be decrypted by the server")
        email = cred.email
    else:
        email = cf_email
        api_key = cf_key
        if save_cred and email and api_key:
            try:
                new_cred = EncryptedCloudflareCredential(
                    label=f"Account ({email})",
                    email=email
                )
                new_cred.set_api_key(api_key)
                db.add(new_cred)
                db.commit()
                db.refresh(new_cred)
                cred_id = new_cred.id
                
                # Assign to current user
                assignment = UserCredentialAssignment(user_id=current_user.id, credential_id=new_cred.id, is_owner=True)
                db.add(assignment)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to auto-save credential: {e}")
                
    if not email or not api_key:
        raise HTTPException(status_code=400, detail="Cloudflare email and API key / API token are required.")
        
    # 2. Pre-flight check
    is_valid, err = _validate_domain_request(domain, email, api_key, db)
    if not is_valid:
        raise HTTPException(status_code=400, detail=err)
        
    # 3. Synchronous Setup for Zone Token and DKIM Key
    provisioner = DomainProvisioner(cf_email=email, cf_key=api_key)
    zone_id = None
    zone_token_secret = None
    
    try:
        dt = db.query(DomainZoneToken).filter(DomainZoneToken.domain_name == domain).first()
        if dt:
            zone_token_secret = dt.get_token()
            zone_id = provisioner.cf.get_zone_id(domain)
        else:
            # Generate new zone token
            from backend.app.services.cf_token_generator import CloudflareTokenGenerator
            generator = CloudflareTokenGenerator(email, api_key)
            account_id = generator.get_account_id()
            zone_id = generator.get_zone_id(domain)
            if not zone_id:
                raise HTTPException(status_code=400, detail="Could not find Cloudflare Zone for domain")
            
            token_id, token_secret = generator.create_zone_token(domain, zone_id, account_id)
            if not token_secret:
                raise HTTPException(status_code=500, detail="Failed to generate zone token")
                
            dt = DomainZoneToken(domain_name=domain)
            dt.cf_token_id = token_id
            dt.set_token(token_secret)
            db.add(dt)
            db.commit()
            zone_token_secret = token_secret
            
        provisioner.cf = CloudflareService(api_token=zone_token_secret)
        
        # Pre-generate DKIM key so we have the actual public key record
        selector, dkim_pub = provisioner.dkim.generate_dkim_key(domain)
        if not selector or not dkim_pub:
            raise HTTPException(status_code=500, detail="Failed to generate DKIM key pair")
            
        # Get proposed DNS records
        records = provisioner.cf.get_default_mail_records(zone_id, domain)
        
        # Add the DKIM TXT record to proposed list
        records.append({
            "type": "TXT",
            "name": f"{selector}._domainkey.{domain}",
            "content": dkim_pub,
            "proxied": False,
            "ttl": 3600
        })
        
        # Log PENDING state
        provisioner.log_step(db, domain, "START", "PENDING", f"Starting provisioning (requires DNS confirmation)")
        provisioner.log_step(db, domain, "TOKEN", "SUCCESS", "Zone token created/loaded")
        provisioner.log_step(db, domain, "DNS_REVIEW", "PENDING", "Awaiting manual DNS confirmation")
        
        audit_log(db, current_user.username, "PROVISION_DOMAIN_START", domain, f"Plan ID: {plan_id}")
        return {
            "status": "pending_dns_review",
            "domain": domain,
            "plan_id": plan_id,
            "cred_id": cred_id,
            "cf_email": email,
            "cf_key": api_key,
            "dns_records": records
        }
    except Exception as e:
        logger.exception(f"Error in synchronous provisioning setup: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to prepare domain provisioning: {str(e)}")

@router.post("/provision/confirm")
def confirm_provision_domain(
    confirm_data: DomainProvisionConfirmRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Confirm and apply edited DNS records, continuing the domain provisioning in background.
    """
    require_permission(current_user, db, "domains:provision")
    domain = confirm_data.domain.strip().lower()
    plan_id = confirm_data.plan_id
    cred_id = confirm_data.cred_id
    cf_email = confirm_data.cf_email
    cf_key = confirm_data.cf_key
    dns_records = [rec.model_dump() if hasattr(rec, 'model_dump') else rec.dict() for rec in confirm_data.dns_records]
    
    # Resolve API credentials
    if not cred_id and not cf_email and not cf_key:
        default_cred = _default_client_credential(current_user, db)
        if default_cred:
            cred_id = default_cred.id

    if cred_id:
        cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
        if not cred:
            raise HTTPException(status_code=404, detail="Credential not found")
        api_key = cred.get_api_key()
        email = cred.email
    else:
        email = cf_email
        api_key = cf_key

    if not email or not api_key:
        raise HTTPException(status_code=400, detail="Cloudflare credentials missing")

    # Schedule background provision using confirmed DNS records
    from backend.app.core.database import SessionLocal
    background_tasks.add_task(
        background_provision,
        domain=domain,
        plan_id=plan_id,
        email=email,
        api_key=api_key,
        db_session_factory=SessionLocal,
        cred_id=cred_id,
        dns_records=dns_records
    )
    
    audit_log(db, current_user.username, "CONFIRM_PROVISION_DOMAIN", domain, f"Plan ID: {plan_id}")
    return {"message": "Provisioning resumed in background with confirmed DNS records", "domain": domain}

@router.get("/provision/status/{domain}", response_model=List[ProvisioningLogResponse])
def get_provision_status(
    domain: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Get provisioning logs/status for a domain.
    """
    domain = domain.strip().lower()
    require_domain_permission(current_user, db, domain, "domains:provision_status")
    logs = db.query(DomainProvisioningLog).filter(DomainProvisioningLog.domain_name == domain).order_by(DomainProvisioningLog.created_at.desc()).all()
    return logs

@router.put("/{domain_id}")
def update_domain_plan(
    domain_id: int,
    plan_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Update domain plan allocation and active status (Superusers only).
    """
    require_permission(current_user, db, "domains:update")
    domain = db.query(MailDomain).filter(MailDomain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    plan = db.query(MailPlan).filter(MailPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    # Update allocation
    alloc = db.query(DomainAllocation).filter(DomainAllocation.domain_name == domain.name).first()
    if not alloc:
        alloc = DomainAllocation(domain_name=domain.name)
        db.add(alloc)
    alloc.plan_id = plan.id
    
    # Update limits
    domain.max_users = plan.max_users
    domain.max_aliases = plan.max_aliases
    domain.is_active = is_active
    db.commit()
    
    # Sync quotas of all users in domain
    new_quota_kb = plan.quota_mb * 1024
    db.query(MailUser).filter(MailUser.domain_id == domain.id).update({MailUser.quota_kb: new_quota_kb})
    db.commit()
    
    # Reload dovecot
    try:
        import subprocess
        subprocess.run(["/usr/bin/sudo", "/usr/sbin/doveadm", "reload"], check=True, timeout=10)
    except Exception as e:
        logger.error(f"Quotas updated but Dovecot reload failed: {e}")
        
    audit_log(db, current_user.username, "UPDATE_DOMAIN", domain.name, f"Plan: {plan.name}, Active: {is_active}")
    return {"message": "Domain updated successfully"}

@router.delete("/{domain_id}")
def delete_domain(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Completely delete a domain and its infrastructure (Superusers only).
    """
    require_permission(current_user, db, "domains:delete")
    domain = db.query(MailDomain).filter(MailDomain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    domain_name = domain.name

    cf_email = None
    cf_key = None
    assignment = db.query(CredentialDomainAssignment).filter(
        CredentialDomainAssignment.domain_name == domain_name
    ).first()
    if assignment and assignment.credential:
        cf_email = assignment.credential.email
        cf_key = assignment.credential.get_api_key()
    
    provisioner = DomainProvisioner(cf_email=cf_email, cf_key=cf_key)
    success = provisioner.delete_domain(db, domain_name)
    
    if success:
        audit_log(db, current_user.username, "DELETE_DOMAIN", domain_name, "Domain and infrastructure deleted")
        return {"message": "Domain fully deleted"}
    else:
        audit_log(db, current_user.username, "DELETE_DOMAIN_FAILED", domain_name, "Deletion finished with errors")
        return {"message": "Domain deleted, but some infrastructure cleanup failed. Check logs."}


@router.get("/credentials/{cred_id}/zones/{zone_id}/dns-records")
def list_zone_dns_records(
    cred_id: int,
    zone_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """List DNS records for a given Cloudflare zone with ABAC verification."""
    require_permission(current_user, db, "credentials:read")
    if not _credential_allowed(current_user, db, cred_id):
        raise HTTPException(status_code=403, detail="Unauthorized to use this credential")
        
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    api_key = cred.get_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Credential API key decryption failed")
        
    cf = CloudflareService(cred.email, api_key)
    zone_details = cf.get_zone(zone_id)
    if not zone_details:
        raise HTTPException(status_code=404, detail="Zone not found in Cloudflare")
    zone_name = zone_details.get("name")
    if not zone_name:
        raise HTTPException(status_code=400, detail="Could not resolve zone domain name")
        
    # Scoped non-superuser check
    if not is_super_admin(current_user):
        if not can_manage_domain(current_user, db, zone_name, "credentials:read"):
            raise HTTPException(status_code=403, detail=f"Unauthorized to manage zone {zone_name}")
            
    return cf.list_dns_records(zone_id)


@router.post("/credentials/{cred_id}/zones/{zone_id}/dns-records")
def create_zone_dns_record(
    cred_id: int,
    zone_id: str,
    record: DNSRecordInput,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Create a new DNS record in a Cloudflare zone with ABAC verification and audit logs."""
    require_permission(current_user, db, "credentials:create")
    if not _credential_allowed(current_user, db, cred_id):
        raise HTTPException(status_code=403, detail="Unauthorized to use this credential")
        
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    api_key = cred.get_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Credential API key decryption failed")
        
    cf = CloudflareService(cred.email, api_key)
    zone_details = cf.get_zone(zone_id)
    if not zone_details:
        raise HTTPException(status_code=404, detail="Zone not found in Cloudflare")
    zone_name = zone_details.get("name")
    if not zone_name:
        raise HTTPException(status_code=400, detail="Could not resolve zone domain name")
        
    # Scoped non-superuser check
    if not is_super_admin(current_user):
        if not can_manage_domain(current_user, db, zone_name, "credentials:create"):
            raise HTTPException(status_code=403, detail=f"Unauthorized to manage zone {zone_name}")
            
    payload = {
        "type": record.type.strip().upper(),
        "name": record.name.strip(),
        "content": record.content.strip(),
        "proxied": record.proxied,
        "ttl": record.ttl
    }
    if record.priority is not None:
        payload["priority"] = record.priority
        
    success = cf.create_dns_record(zone_id, payload)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to create DNS record in Cloudflare")
        
    audit_log(db, current_user.username, "CREATE_CF_DNS_RECORD", zone_name, f"Record: {record.type} {record.name} -> {record.content}")
    return {"message": "DNS record created successfully"}


@router.put("/credentials/{cred_id}/zones/{zone_id}/dns-records/{record_id}")
def update_zone_dns_record(
    cred_id: int,
    zone_id: str,
    record_id: str,
    record: DNSRecordInput,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Update an existing DNS record in a Cloudflare zone with ABAC verification and audit logs."""
    require_permission(current_user, db, "credentials:create")
    if not _credential_allowed(current_user, db, cred_id):
        raise HTTPException(status_code=403, detail="Unauthorized to use this credential")
        
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    api_key = cred.get_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Credential API key decryption failed")
        
    cf = CloudflareService(cred.email, api_key)
    zone_details = cf.get_zone(zone_id)
    if not zone_details:
        raise HTTPException(status_code=404, detail="Zone not found in Cloudflare")
    zone_name = zone_details.get("name")
    if not zone_name:
        raise HTTPException(status_code=400, detail="Could not resolve zone domain name")
        
    # Scoped non-superuser check
    if not is_super_admin(current_user):
        if not can_manage_domain(current_user, db, zone_name, "credentials:create"):
            raise HTTPException(status_code=403, detail=f"Unauthorized to manage zone {zone_name}")
            
    payload = {
        "type": record.type.strip().upper(),
        "name": record.name.strip(),
        "content": record.content.strip(),
        "proxied": record.proxied,
        "ttl": record.ttl
    }
    if record.priority is not None:
        payload["priority"] = record.priority
        
    success = cf.update_dns_record(zone_id, record_id, payload)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update DNS record in Cloudflare")
        
    audit_log(db, current_user.username, "UPDATE_CF_DNS_RECORD", zone_name, f"Record ID {record_id}: {record.type} {record.name} -> {record.content}")
    return {"message": "DNS record updated successfully"}


@router.delete("/credentials/{cred_id}/zones/{zone_id}/dns-records/{record_id}")
def delete_zone_dns_record(
    cred_id: int,
    zone_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Delete a DNS record in a Cloudflare zone with ABAC verification and audit logs."""
    require_permission(current_user, db, "credentials:create")
    if not _credential_allowed(current_user, db, cred_id):
        raise HTTPException(status_code=403, detail="Unauthorized to use this credential")
        
    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    api_key = cred.get_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Credential API key decryption failed")
        
    cf = CloudflareService(cred.email, api_key)
    zone_details = cf.get_zone(zone_id)
    if not zone_details:
        raise HTTPException(status_code=404, detail="Zone not found in Cloudflare")
    zone_name = zone_details.get("name")
    if not zone_name:
        raise HTTPException(status_code=400, detail="Could not resolve zone domain name")
        
    # Scoped non-superuser check
    if not is_super_admin(current_user):
        if not can_manage_domain(current_user, db, zone_name, "credentials:create"):
            raise HTTPException(status_code=403, detail=f"Unauthorized to manage zone {zone_name}")
            
    success = cf.delete_dns_record(zone_id, record_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete DNS record in Cloudflare")
        
    audit_log(db, current_user.username, "DELETE_CF_DNS_RECORD", zone_name, f"Record ID {record_id}")
    return {"message": "DNS record deleted successfully"}

