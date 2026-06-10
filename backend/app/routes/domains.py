import os
import re
import logging
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.core.sudo import run_sudo
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
    UserCredentialAssignment, CredentialDomainAssignment, AdminLog,
    ManagedDomain
)
from backend.app.schemas import DomainResponse, DomainProvisionRequest, CloudflareCredentialCreate, CloudflareCredentialUpdate, MailPlanResponse, ProvisioningLogResponse, ZoneOwnershipResponse, CloudflareZoneResponse, DNSRecordInput, MailPlanCreate, DomainPlanUpdate, DomainAuditResponse, OrphanZoneResponse, UnprovisionedDomainResponse, BrokenWebmailDomainResponse
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
            
        managed = db.query(ManagedDomain).filter(ManagedDomain.domain == d.name).first()
        is_orphaned = False
        orphan_reason = None
        if not managed:
            is_orphaned = True
            orphan_reason = "Missing Cloudflare management record"
        elif not managed.zone_id or not managed.cloudflare_account_id:
            is_orphaned = True
            orphan_reason = "Missing Cloudflare zone/account link"

        response.append(DomainResponse(
            id=d.id,
            name=d.name,
            max_users=d.max_users,
            max_aliases=d.max_aliases,
            is_active=d.is_active,
            plan_name=plan_name,
            plan_id=plan_id,
            managed_source=managed.source if managed else None,
            managed_status=managed.status if managed else None,
            cloudflare_account_id=managed.cloudflare_account_id if managed else None,
            zone_id=managed.zone_id if managed else None,
            is_orphaned=is_orphaned,
            orphan_reason=orphan_reason
        ))
    return response

@router.get("/audit", response_model=DomainAuditResponse)
def audit_domains(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Perform a domain configuration audit (Superusers or domain managers).
    - Orphan Zones: MailDomain exists, but no Cloudflare zone matches it in known credentials.
    - Unprovisioned Domains: Discovered Cloudflare zones that don't have a MailDomain configured, with live check of their MX records to detect if they use third-party email.
    - Broken Webmail: MailDomain exists and is in a known Cloudflare account, but the Cloudflare account has no active primary webmail origin.
    """
    require_permission(current_user, db, "domains:read")
    
    # 1. Fetch relevant domains
    allowed_domains = get_user_allowed_domains(current_user, db)
    if is_super_admin(current_user):
        mail_domains = db.query(MailDomain).all()
        managed_domains = db.query(ManagedDomain).all()
    else:
        mail_domains = db.query(MailDomain).filter(MailDomain.name.in_(allowed_domains)).all()
        managed_domains = db.query(ManagedDomain).filter(ManagedDomain.domain.in_(allowed_domains)).all()
        
    # 2. Get active credentials and map account/credential/zone relations
    credentials = db.query(EncryptedCloudflareCredential).all()
    
    # Pre-cache zones per credential / account info
    managed_by_name = {md.domain.lower().strip(): md for md in managed_domains}
    mail_domains_by_name = {d.name.lower().strip(): d for d in mail_domains}
    
    orphan_zones = []
    broken_webmail_domains = []
    unprovisioned_domains = []
    
    # Check each MailDomain to identify if it is an Orphan Zone or has Broken Webmail
    from backend.app.models import CloudflareWebmailPrimary
    
    for d in mail_domains:
        d_name_lower = d.name.lower().strip()
        md = managed_by_name.get(d_name_lower)
        
        # Determine if it's an Orphan Zone
        if not md or not md.zone_id or not md.cloudflare_account_id:
            orphan_zones.append(OrphanZoneResponse(
                id=d.id,
                name=d.name,
                max_users=d.max_users,
                max_aliases=d.max_aliases,
                is_active=d.is_active
            ))
            continue
            
        # Verify the Cloudflare account associated with the managed domain
        account_id = md.cloudflare_account_id
        
        # Check if the account has an active primary webmail domain
        primary = db.query(CloudflareWebmailPrimary).filter(
            CloudflareWebmailPrimary.cloudflare_account_id == account_id,
            CloudflareWebmailPrimary.status == "active"
        ).first()
        
        # If no primary is active, then webmail CNAME doesn't work (broken webmail, SMTP/IMAP only works)
        if not primary:
            broken_webmail_domains.append(BrokenWebmailDomainResponse(
                id=d.id,
                name=d.name,
                cloudflare_account_id=account_id,
                zone_id=md.zone_id,
                reason="No active primary webmail origin is allocated for this Cloudflare account. Webmail CNAME is invalid/missing target."
            ))
            
    # Check ManagedDomain zones to find Unprovisioned Domains (zone exists in Cloudflare but no MailDomain exists)
    for md in managed_domains:
        domain_name = md.domain.lower().strip()
        if domain_name not in mail_domains_by_name:
            # This is unprovisioned!
            # Let's detect if it uses third-party email
            cred_id = md.credential_id_last_used
            
            # Find account name if available
            account_name = None
            if md.account:
                account_name = md.account.name
                
            email_provider = "No MX Records"
            mx_records = []
            
            # Find any credential that has access to this zone/account
            cred = None
            if cred_id:
                cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cred_id).first()
            if not cred and credentials:
                from backend.app.models import CloudflareCredentialAccount
                cca = db.query(CloudflareCredentialAccount).filter(CloudflareCredentialAccount.cloudflare_account_id == md.cloudflare_account_id).first()
                if cca:
                    cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == cca.credential_id).first()
            
            if cred:
                try:
                    decrypted_key = cred.get_api_key()
                    if decrypted_key:
                        if len(decrypted_key) > 37 or '-' in decrypted_key:
                            cf_service = CloudflareService(api_token=decrypted_key)
                        else:
                            cf_service = CloudflareService(email=cred.email, api_key=decrypted_key)
                        
                        records = cf_service.list_dns_records(md.zone_id)
                        mx_recs = [r for r in records if r.get("type") == "MX"]
                        if mx_recs:
                            mx_records = [f"Priority {r.get('priority', 10)}: {r.get('content')}" for r in mx_recs]
                            
                            combined_targets = " ".join([r.get("content", "").lower() for r in mx_recs])
                            if "google.com" in combined_targets or "googlemail.com" in combined_targets:
                                email_provider = "Google Workspace"
                            elif "outlook.com" in combined_targets:
                                email_provider = "Microsoft 365"
                            elif "zoho" in combined_targets:
                                email_provider = "Zoho Mail"
                            elif "mail.zimprices.co.zw" in combined_targets:
                                email_provider = "ZimPrices Mail"
                            else:
                                primary_mx = mx_recs[0].get("content")
                                email_provider = f"Third-party ({primary_mx})"
                except Exception as e:
                    logger.warning(f"Failed to query MX records from Cloudflare for {domain_name}: {e}")
                    email_provider = "Query Error (MX)"
            
            unprovisioned_domains.append(UnprovisionedDomainResponse(
                name=md.domain,
                cloudflare_account_id=md.cloudflare_account_id,
                cloudflare_account_name=account_name,
                credential_id=cred.id if cred else None,
                email_provider=email_provider,
                mx_records=mx_records
            ))
            
    return DomainAuditResponse(
        orphan_zones=orphan_zones,
        unprovisioned_domains=unprovisioned_domains,
        broken_webmail_domains=broken_webmail_domains
    )

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
    payload: MailPlanCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Create a new mail plan (Superusers only).
    """
    require_permission(current_user, db, "plans:create")
    existing = db.query(MailPlan).filter(MailPlan.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Plan '{payload.name}' already exists.")
        
    plan = MailPlan(
        name=payload.name,
        max_users=payload.max_users,
        max_aliases=payload.max_aliases,
        quota_mb=payload.quota_mb,
        is_default=payload.is_default
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    audit_log(db, current_user.username, "CREATE_PLAN", payload.name, f"Users: {payload.max_users}, Aliases: {payload.max_aliases}, Quota: {payload.quota_mb}MB")
    return plan

@router.put("/plans/{plan_id}", response_model=MailPlanResponse)
def update_plan(
    plan_id: int,
    payload: MailPlanCreate,
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
    existing = db.query(MailPlan).filter(MailPlan.name == payload.name, MailPlan.id != plan_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Plan '{payload.name}' already exists.")
        
    plan.name = payload.name
    plan.max_users = payload.max_users
    plan.max_aliases = payload.max_aliases
    plan.quota_mb = payload.quota_mb
    plan.is_default = payload.is_default
    
    db.commit()
    db.refresh(plan)
    audit_log(db, current_user.username, "UPDATE_PLAN", payload.name, f"Users: {payload.max_users}, Aliases: {payload.max_aliases}, Quota: {payload.quota_mb}MB")
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
    dt = db.query(DomainZoneToken).filter(DomainZoneToken.domain_name == domain).first()
    
    try:
        account_id = None
        if dt:
            zone_token_secret = dt.get_token()
            zone_id = provisioner.cf.get_zone_id(domain)
            zone_details = provisioner.cf.get_zone(zone_id)
            account_id = zone_details.get("account", {}).get("id") if zone_details else None
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
        
        # Ensure CloudflareAccount and ManagedDomain records exist/are synced
        from backend.app.models import CloudflareAccount, ManagedDomain
        if account_id:
            cf_acc = db.query(CloudflareAccount).filter(CloudflareAccount.cloudflare_account_id == account_id).first()
            if not cf_acc:
                account_name = "Discovered Account"
                if dt:
                    try:
                        zone_details = provisioner.cf.get_zone(zone_id)
                        account_name = zone_details.get("account", {}).get("name", "Discovered Account")
                    except Exception:
                        pass
                cf_acc = CloudflareAccount(cloudflare_account_id=account_id, name=account_name)
                db.add(cf_acc)
                db.commit()

        md = db.query(ManagedDomain).filter(ManagedDomain.domain == domain).first()
        if not md:
            md = ManagedDomain(domain=domain, zone_id=zone_id, cloudflare_account_id=account_id, source="provisioned", status="provisioning")
            db.add(md)
        else:
            md.status = "provisioning"
            if zone_id:
                md.zone_id = zone_id
            if account_id:
                md.cloudflare_account_id = account_id
        db.commit()

        # Resolve or allocate primary webmail origin
        from backend.app.services.cloudflare_grouping_service import CloudflareGroupingService
        grouping_service = CloudflareGroupingService()
        primary = grouping_service.resolve_or_allocate_primary(
            db,
            account_id,
            fallback_domain=domain,
            cf_override=CloudflareService(email=email, api_key=api_key)
        )
        if not primary:
            raise HTTPException(status_code=500, detail="Could not allocate account-local webmail primary")
        webmail_cname_target = primary.primary_hostname
        
        # Pre-generate DKIM key so we have the actual public key record
        selector, dkim_pub = provisioner.dkim.generate_dkim_key(domain)
        if not selector or not dkim_pub:
            raise HTTPException(status_code=500, detail="Failed to generate DKIM key pair")
            
        # Get proposed DNS records with account-aware target
        records = provisioner.cf.get_default_mail_records(zone_id, domain, webmail_cname_target=webmail_cname_target)
        
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
    payload: DomainPlanUpdate,
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
        
    plan = db.query(MailPlan).filter(MailPlan.id == payload.plan_id).first()
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
    domain.is_active = payload.is_active
    db.commit()
    
    # Sync quotas of all users in domain
    new_quota_kb = plan.quota_mb * 1024
    db.query(MailUser).filter(MailUser.domain_id == domain.id).update({MailUser.quota_kb: new_quota_kb})
    db.commit()
    
    # Reload dovecot
    try:
        run_sudo(["/usr/sbin/doveadm", "reload"], check=True, timeout=10)
    except Exception as e:
        logger.error(f"Quotas updated but Dovecot reload failed: {e}")
        
    audit_log(db, current_user.username, "UPDATE_DOMAIN", domain.name, f"Plan: {plan.name}, Active: {payload.is_active}")
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


@router.post("/sync")
def sync_cloudflare_accounts_and_zones(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Sync Cloudflare accounts and zones visible to global credentials."""
    require_permission(current_user, db, "domains:provision")
    from backend.app.services.cloudflare_grouping_service import CloudflareGroupingService
    service = CloudflareGroupingService()
    res = service.discover_and_sync_accounts_and_zones(db)
    audit_log(db, current_user.username, "SYNC_CLOUDFLARE_ACCOUNTS", "system", f"Accounts synced: {res['synced_accounts']}, Domains: {res['synced_domains']}")
    return res


@router.get("/warnings")
def get_webmail_integrity_warnings(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Run integrity worker in dry-run mode to get active warnings."""
    require_permission(current_user, db, "domains:read")
    from backend.app.services.integrity import WebmailIntegrityWorker
    worker = WebmailIntegrityWorker()
    warnings = worker.run_checks(db, auto_repair=False)
    return {"warnings": warnings}


@router.post("/repair")
def run_webmail_integrity_repair(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Run integrity worker in apply/auto-repair mode."""
    require_permission(current_user, db, "domains:provision")
    from backend.app.services.integrity import WebmailIntegrityWorker
    worker = WebmailIntegrityWorker()
    warnings_before = worker.run_checks(db, auto_repair=True)
    warnings_after = worker.run_checks(db, auto_repair=False)
    audit_log(db, current_user.username, "REPAIR_WEBMAIL_INTEGRITY", "system", f"Repaired warnings. Before: {len(warnings_before)}, After: {len(warnings_after)}")
    return {
        "message": "Integrity repair executed successfully",
        "warnings_repaired": len(warnings_before) - len(warnings_after),
        "active_warnings": warnings_after
    }


@router.post("/migrate")
def migrate_existing_domains(
    dry_run: bool = Query(True, description="Run in dry-run mode (no changes written)"),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """Dry-run or apply migration of existing domains to new grouping and routing structure."""
    require_permission(current_user, db, "domains:provision")
    
    from backend.app.services.cloudflare_grouping_service import CloudflareGroupingService
    from backend.app.services.integrity import WebmailIntegrityWorker
    
    grouping_service = CloudflareGroupingService()
    worker = WebmailIntegrityWorker()
    
    # 1. Sync accounts
    sync_res = grouping_service.discover_and_sync_accounts_and_zones(db)
    
    # 2. Check warnings
    warnings_before = worker.run_checks(db, auto_repair=False)
    
    if not dry_run:
        # Run in apply/repair mode
        worker.run_checks(db, auto_repair=True)
        warnings_after = worker.run_checks(db, auto_repair=False)
        audit_log(db, current_user.username, "MIGRATE_WEBMAIL_GROUPING", "system", "Applied webmail account grouping migration")
        return {
            "message": "Migration applied successfully",
            "sync_details": sync_res,
            "repaired_count": len(warnings_before) - len(warnings_after),
            "remaining_warnings": warnings_after
        }
    else:
        audit_log(db, current_user.username, "MIGRATE_WEBMAIL_GROUPING_DRYRUN", "system", "Dry-run webmail account grouping migration")
        return {
            "message": "Migration dry-run completed",
            "sync_details": sync_res,
            "detected_issues": warnings_before
        }


