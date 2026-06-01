from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.core.permissions import require_permission, can
from backend.app.core.sudo import run_sudo
from backend.app.models import AuthUser, GeoDomainPolicy, GeoUserException, GeoActiveBan, MailDomain, AdminLog, GeoSshPolicy
from backend.app.services.geo_policy import check_login_policy, remove_ip_from_nftables

router = APIRouter(prefix="/geo-auth", tags=["geo-auth"])

# --- Request/Response Schemas ---
class DovecotVerifyRequest(BaseModel):
    # Support both direct root keys and nested structures (Dovecot HTTP auth protocol)
    login: Optional[str] = None
    rip: Optional[str] = None
    protocol: Optional[str] = None
    attributes: Optional[dict] = None

class SSHVerifyRequest(BaseModel):
    username: str
    remote_ip: str

class DomainPolicySchema(BaseModel):
    domain_id: int
    allowed_countries: str = Field(description="Comma-separated country ISO codes")
    allowed_regions: str = Field(description="Comma-separated region codes (SADC, EUROPE)")
    augment_default: bool = True

class SshPolicySchema(BaseModel):
    allowed_countries: str = Field(description="Comma-separated country ISO codes")
    allowed_regions: str = Field(description="Comma-separated region codes (SADC, EUROPE)")
    augment_default: bool = True

class UserExceptionSchema(BaseModel):
    username: str
    service: str = "all"
    allowed_countries: str
    expires_at: Optional[datetime] = None

class BanResponseSchema(BaseModel):
    id: int
    ip_address: str
    service: str
    banned_at: datetime
    expires_at: datetime
    country_code: Optional[str] = "UNKNOWN"

class BanClearRequest(BaseModel):
    ip_address: str
    service: str

class GeoRegionSchema(BaseModel):
    name: str
    countries: str

# --- Endpoints ---

@router.post("/verify")
async def verify_dovecot_login(payload: DovecotVerifyRequest, db: Session = Depends(get_db)):
    """
    Dovecot HTTP auth policy callback verification hook.
    """
    # Extract properties from standard payload or attributes dictionary
    username = payload.login
    remote_ip = payload.rip
    protocol = payload.protocol or "imap"

    if payload.attributes:
        username = username or payload.attributes.get("login") or payload.attributes.get("user")
        remote_ip = remote_ip or payload.attributes.get("rip") or payload.attributes.get("remote_ip")
        protocol = protocol or payload.attributes.get("protocol") or payload.attributes.get("service")

    if not username or not remote_ip:
        # If parameters are completely missing, don't fail closed to avoid bricking Dovecot
        return {"status": 0, "msg": "Missing verification parameters"}

    allowed, reason = check_login_policy(db, username, remote_ip, service="mail")
    if allowed:
        return {"status": 0, "msg": reason}
    else:
        return {"status": -1, "msg": reason}

@router.post("/verify-ssh")
async def verify_ssh_login(payload: SSHVerifyRequest, db: Session = Depends(get_db)):
    """
    PAM Exec hook callback verification endpoint.
    """
    allowed, reason = check_login_policy(db, payload.username, payload.remote_ip, service="ssh")
    return {"allowed": allowed, "reason": reason}

@router.get("/settings", response_model=List[DomainPolicySchema])
def get_domain_settings(db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    require_permission(current_user, db, "geo_mail:view")
    return db.query(GeoDomainPolicy).all()

@router.post("/settings")
def update_domain_settings(payload: DomainPolicySchema, db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    require_permission(current_user, db, "geo_mail:manage_countries")
    
    # Validate regions against existing GeoRegions
    from backend.app.models import GeoRegion
    import re
    valid_regions = {r.name.upper() for r in db.query(GeoRegion).all()}
    regions = [r.strip().upper() for r in payload.allowed_regions.split(",") if r.strip()]
    invalid_regions = [r for r in regions if r not in valid_regions]
    if invalid_regions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid region(s): {', '.join(invalid_regions)}. Please define the region first."
        )

    # Validate country codes (must be 2-letter ISO codes)
    countries = [c.strip().upper() for c in payload.allowed_countries.split(",") if c.strip()]
    invalid_countries = [c for c in countries if not re.match(r"^[A-Z]{2}$", c)]
    if invalid_countries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid country code(s): {', '.join(invalid_countries)}. Must be 2-letter ISO codes."
        )

    # Verify domain exists
    domain = db.query(MailDomain).filter(MailDomain.id == payload.domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")

    policy = db.query(GeoDomainPolicy).filter(GeoDomainPolicy.domain_id == payload.domain_id).first()
    if policy:
        policy.allowed_countries = payload.allowed_countries
        policy.allowed_regions = payload.allowed_regions
        policy.augment_default = payload.augment_default
    else:
        policy = GeoDomainPolicy(
            domain_id=payload.domain_id,
            allowed_countries=payload.allowed_countries,
            allowed_regions=payload.allowed_regions,
            augment_default=payload.augment_default
        )
        db.add(policy)
    
    db.add(AdminLog(
        admin_email=current_user.username,
        action="UPDATE_GEO_POLICY",
        target=domain.name,
        details=f"Allowed Countries: {payload.allowed_countries}, Regions: {payload.allowed_regions}, Augment: {payload.augment_default}"
    ))
    db.commit()
    return {"status": "success", "message": "Domain policy updated successfully"}

@router.get("/ssh-logs")
def get_ssh_logs(db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    require_permission(current_user, db, "geo_ssh:view")
    import os
    import subprocess
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    if not is_prod:
        return {
            "logs": (
                "May 31 01:46:10 mail.zimprices.co.zw sshd[75264]: Failed password for invalid user student from 223.76.158.107 port 46556 ssh2\n"
                "May 31 01:46:57 mail.zimprices.co.zw sshd[75266]: Failed password for invalid user edwin from 58.224.62.29 port 47152 ssh2\n"
                "May 31 01:48:59 mail.zimprices.co.zw sshd[75303]: Failed password for root from 58.224.62.29 port 50884 ssh2\n"
                "May 31 01:49:41 mail.zimprices.co.zw sshd[75309]: Failed password for root from 155.4.245.222 port 2717 ssh2\n"
                "May 31 02:07:16 mail.zimprices.co.zw sshd[75864]: Accepted publickey for ubuntu from 74.244.195.1 port 25247 ssh2\n"
            )
        }
    try:
        proc = run_sudo(
            ["/usr/bin/journalctl", "-u", "ssh", "--since", "3 days ago", "--no-pager"],
            capture_output=True,
            text=True,
            timeout=10
        )
        return {"logs": proc.stdout}
    except Exception as e:
        return {"logs": f"Failed to retrieve SSH logs: {e}"}

@router.get("/ssh-settings", response_model=SshPolicySchema)
def get_ssh_settings(db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):

    require_permission(current_user, db, "geo_ssh:view")
    policy = db.query(GeoSshPolicy).first()
    if not policy:
        return SshPolicySchema(allowed_countries="", allowed_regions="SADC", augment_default=True)
    return SshPolicySchema(
        allowed_countries=policy.allowed_countries,
        allowed_regions=policy.allowed_regions,
        augment_default=policy.augment_default
    )

@router.post("/ssh-settings")
def update_ssh_settings(payload: SshPolicySchema, db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    require_permission(current_user, db, "geo_ssh:manage_countries")

    # Validate regions against existing GeoRegions
    from backend.app.models import GeoRegion
    import re
    valid_regions = {r.name.upper() for r in db.query(GeoRegion).all()}
    regions = [r.strip().upper() for r in payload.allowed_regions.split(",") if r.strip()]
    invalid_regions = [r for r in regions if r not in valid_regions]
    if invalid_regions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid region(s): {', '.join(invalid_regions)}. Please define the region first."
        )

    # Validate country codes (must be 2-letter ISO codes)
    countries = [c.strip().upper() for c in payload.allowed_countries.split(",") if c.strip()]
    invalid_countries = [c for c in countries if not re.match(r"^[A-Z]{2}$", c)]
    if invalid_countries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid country code(s): {', '.join(invalid_countries)}. Must be 2-letter ISO codes."
        )

    policy = db.query(GeoSshPolicy).first()
    if policy:
        policy.allowed_countries = payload.allowed_countries
        policy.allowed_regions = payload.allowed_regions
        policy.augment_default = payload.augment_default
    else:
        policy = GeoSshPolicy(
            allowed_countries=payload.allowed_countries,
            allowed_regions=payload.allowed_regions,
            augment_default=payload.augment_default
        )
        db.add(policy)
    
    db.add(AdminLog(
        admin_email=current_user.username,
        action="UPDATE_SSH_GEO_POLICY",
        target="SSH_GLOBAL",
        details=f"Allowed Countries: {payload.allowed_countries}, Regions: {payload.allowed_regions}, Augment: {payload.augment_default}"
    ))
    db.commit()
    return {"status": "success", "message": "SSH global policy updated successfully"}

@router.get("/regions", response_model=List[GeoRegionSchema])
def get_regions(db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    if not (can(current_user, db, "geo_mail:view") or can(current_user, db, "geo_ssh:view")):
        raise HTTPException(status_code=403, detail="Permission denied")
    from backend.app.models import GeoRegion
    return db.query(GeoRegion).all()

@router.post("/regions")
def create_or_update_region(payload: GeoRegionSchema, db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    if not (can(current_user, db, "geo_mail:manage_countries") or can(current_user, db, "geo_ssh:manage_countries")):
        raise HTTPException(status_code=403, detail="Permission denied")
    from backend.app.models import GeoRegion
    region_name = payload.name.strip().upper()
    region = db.query(GeoRegion).filter(GeoRegion.name == region_name).first()
    if region:
        region.countries = payload.countries
    else:
        region = GeoRegion(name=region_name, countries=payload.countries)
        db.add(region)
    
    db.add(AdminLog(
        admin_email=current_user.username,
        action="UPDATE_GEO_REGION",
        target=region_name,
        details=f"Countries: {payload.countries}"
    ))
    db.commit()
    return {"status": "success", "message": f"Region {region_name} updated successfully"}

@router.delete("/regions/{name}")
def delete_region(name: str, db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    if not (can(current_user, db, "geo_mail:manage_countries") or can(current_user, db, "geo_ssh:manage_countries")):
        raise HTTPException(status_code=403, detail="Permission denied")
    from backend.app.models import GeoRegion
    region_name = name.strip().upper()
    region = db.query(GeoRegion).filter(GeoRegion.name == region_name).first()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
        
    db.delete(region)
    db.add(AdminLog(
        admin_email=current_user.username,
        action="DELETE_GEO_REGION",
        target=region_name,
        details=""
    ))
    db.commit()
    return {"status": "success", "message": f"Region {region_name} deleted successfully"}

@router.post("/regions/reset")
def reset_regions(db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    if not (can(current_user, db, "geo_mail:manage_countries") or can(current_user, db, "geo_ssh:manage_countries")):
        raise HTTPException(status_code=403, detail="Permission denied")
    from backend.app.models import GeoRegion
    
    # Clear existing regions
    db.query(GeoRegion).delete()
    
    default_regions = {
        "SADC": "AO,BW,KM,CD,SZ,LS,MG,MW,MU,MZ,NA,SC,ZA,TZ,ZM,ZW",
        "EUROPE": "AL,AD,AT,BY,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IS,IE,IT,LV,LI,LT,LU,MT,MD,MC,ME,NL,MK,NO,PL,PT,RO,RU,SM,RS,SK,SI,ES,SE,CH,UA,GB,VA",
        "NORTH AMERICA": "US,CA,MX",
        "MIDDLE EAST": "AE,SA,QA,BH,OM,YE,IL,JO,LB,SY,IQ,IR,TR",
        "WESTERN EUROPE": "BE,FR,DE,LU,NL,CH,GB,IE,AT,LI",
        "NORTH AFRICA": "EG,LY,TN,DZ,MA,EH,SD",
        "SOUTHERN AFRICA": "ZA,LS,SZ,NA,BW,MZ,ZW,ZM,AO,MW",
        "ASIA": "CN,JP,KR,IN,PK,BD,LK,NP,MM,TH,VN,MY,SG,ID,PH"
    }
    for name, countries in default_regions.items():
        db.add(GeoRegion(name=name, countries=countries))
        
    db.add(AdminLog(
        admin_email=current_user.username,
        action="RESET_GEO_REGIONS",
        target="ALL_REGIONS",
        details="Restored default region templates"
    ))
    db.commit()
    return {"status": "success", "message": "All geo regions reset to default successfully"}


@router.get("/exceptions", response_model=List[UserExceptionSchema])
def get_user_exceptions(db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    has_mail = can(current_user, db, "geo_mail:view")
    has_ssh = can(current_user, db, "geo_ssh:view")
    
    if not has_mail and not has_ssh:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    all_exceptions = db.query(GeoUserException).all()
    filtered = []
    for exc in all_exceptions:
        if exc.service == "ssh" and has_ssh:
            filtered.append(exc)
        elif exc.service in ("mail", "all") and has_mail:
            filtered.append(exc)
        elif exc.service == "all" and has_ssh:
            filtered.append(exc)
    return filtered

@router.post("/exceptions")
def create_user_exception(payload: UserExceptionSchema, db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    if payload.service == "ssh":
        require_permission(current_user, db, "geo_ssh:override_user_policy")
    elif payload.service == "mail":
        require_permission(current_user, db, "geo_mail:override_user_policy")
    elif payload.service == "all":
        require_permission(current_user, db, "geo_mail:override_user_policy")
        require_permission(current_user, db, "geo_ssh:override_user_policy")
    else:
        raise HTTPException(status_code=400, detail="Invalid service type")

    exc = db.query(GeoUserException).filter(
        GeoUserException.username == payload.username,
        GeoUserException.service == payload.service
    ).first()
    if exc:
        exc.allowed_countries = payload.allowed_countries
        exc.expires_at = payload.expires_at
    else:
        exc = GeoUserException(
            username=payload.username,
            service=payload.service,
            allowed_countries=payload.allowed_countries,
            expires_at=payload.expires_at
        )
        db.add(exc)

    db.add(AdminLog(
        admin_email=current_user.username,
        action="CREATE_GEO_EXCEPTION",
        target=payload.username,
        details=f"Service: {payload.service}, Countries: {payload.allowed_countries}, Expires: {payload.expires_at}"
    ))
    db.commit()
    return {"status": "success", "message": "User geolocation exception updated successfully"}

@router.get("/bans", response_model=List[BanResponseSchema])
def get_active_bans(db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    has_mail = can(current_user, db, "geo_mail:clear_bans")
    has_ssh = can(current_user, db, "geo_ssh:clear_bans")
    
    if not has_mail and not has_ssh:
        has_mail_view = can(current_user, db, "geo_mail:view")
        has_ssh_view = can(current_user, db, "geo_ssh:view")
        if not has_mail_view and not has_ssh_view:
            raise HTTPException(status_code=403, detail="Permission denied")
        has_mail = has_mail_view
        has_ssh = has_ssh_view

    active_bans = db.query(GeoActiveBan).filter(GeoActiveBan.expires_at > datetime.utcnow()).all()
    filtered = []
    from backend.app.services.geo_policy import get_country_code
    for ban in active_bans:
        if (ban.service == "ssh" and has_ssh) or (ban.service == "mail" and has_mail):
            ban.country_code = get_country_code(ban.ip_address)
            filtered.append(ban)
    return filtered

@router.post("/bans/clear")
def clear_active_ban(payload: BanClearRequest, db: Session = Depends(get_db), current_user: AuthUser = Depends(get_current_user)):
    if payload.service == "ssh":
        require_permission(current_user, db, "geo_ssh:clear_bans")
    elif payload.service == "mail":
        require_permission(current_user, db, "geo_mail:clear_bans")
    else:
        raise HTTPException(status_code=400, detail="Invalid service type")
    
    ban = db.query(GeoActiveBan).filter(
        GeoActiveBan.ip_address == payload.ip_address,
        GeoActiveBan.service == payload.service
    ).first()
    
    if ban:
        db.delete(ban)
        db.commit()

    # Clear from kernel nftables set
    remove_ip_from_nftables(payload.ip_address, payload.service)

    db.add(AdminLog(
        admin_email=current_user.username,
        action="CLEAR_GEO_BAN",
        target=payload.ip_address,
        details=f"Cleared ban for service: {payload.service}"
    ))
    db.commit()
    return {"status": "success", "message": "Ban cleared successfully"}
