from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field

# ----------------- Auth Schemas -----------------

class Token(BaseModel):
    access_token: str
    token_type: str
    email: str
    is_superuser: bool
    permissions: List[str] = []
    roles: List[str] = []

class TokenData(BaseModel):
    email: Optional[str] = None

class LoginRequest(BaseModel):
    username: str  # This is the email
    password: str
    turnstile_token: Optional[str] = None

# ----------------- Mail Plan Schemas -----------------

class MailPlanCreate(BaseModel):
    name: str = Field(..., description="The name of the mail plan")
    max_users: int = Field(..., description="Maximum allowed mailbox users")
    max_aliases: int = Field(..., description="Maximum allowed aliases")
    quota_mb: int = Field(..., description="Disk quota in MB")
    is_default: bool = Field(False, description="Whether this is the default plan for new domains")

class MailPlanResponse(BaseModel):
    id: int
    name: str
    max_users: int
    max_aliases: int
    quota_mb: int
    is_default: bool

    class Config:
        from_attributes = True

# ----------------- Domain Schemas -----------------

class DomainCreate(BaseModel):
    name: str = Field(..., description="The domain name, e.g., example.co.zw")
    plan_id: int = Field(..., description="The ID of the plan to assign")

class DomainProvisionRequest(DomainCreate):
    cred_id: Optional[int] = None
    cf_email: Optional[EmailStr] = None
    cf_key: Optional[str] = Field(None, min_length=1)
    save_cred: bool = False

class CloudflareCredentialCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    api_key: str = Field(..., min_length=1)
    is_default: bool = False

class CloudflareCredentialUpdate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    api_key: Optional[str] = Field(None, min_length=1)
    is_default: bool = False

class DomainResponse(BaseModel):
    id: int
    name: str
    max_users: int
    max_aliases: int
    is_active: bool
    plan_name: Optional[str] = None
    plan_id: Optional[int] = None
    managed_source: Optional[str] = None
    managed_status: Optional[str] = None
    cloudflare_account_id: Optional[str] = None
    zone_id: Optional[str] = None
    is_orphaned: bool = False
    orphan_reason: Optional[str] = None

    class Config:
        from_attributes = True

class DomainPlanUpdate(BaseModel):
    plan_id: int = Field(..., description="The ID of the plan to assign")
    is_active: bool = Field(..., description="Whether the domain is active")

class OrphanZoneResponse(BaseModel):
    id: int
    name: str
    max_users: int
    max_aliases: int
    is_active: bool

class UnprovisionedDomainResponse(BaseModel):
    name: str
    cloudflare_account_id: Optional[str] = None
    cloudflare_account_name: Optional[str] = None
    credential_id: Optional[int] = None
    email_provider: str
    mx_records: list[str] = []

class BrokenWebmailDomainResponse(BaseModel):
    id: int
    name: str
    cloudflare_account_id: Optional[str] = None
    zone_id: Optional[str] = None
    reason: str

class DomainAuditResponse(BaseModel):
    orphan_zones: list[OrphanZoneResponse]
    unprovisioned_domains: list[UnprovisionedDomainResponse]
    broken_webmail_domains: list[BrokenWebmailDomainResponse]


# ----------------- User (Mailbox) Schemas -----------------

class UserCreate(BaseModel):
    email: str = Field(..., description="Full email address, e.g., info@example.co.zw")
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., description="Username or system full name")
    name: Optional[str] = Field(None, description="Display Name (SOGo compatibility)")
    quota_kb: int = Field(1048576, description="Quota in KB (default 1GB)")

class UserUpdate(BaseModel):
    password: Optional[str] = None
    full_name: Optional[str] = None
    name: Optional[str] = None
    quota_kb: Optional[int] = None

class UserResponse(BaseModel):
    email: str
    full_name: str
    name: Optional[str] = None
    quota_kb: int
    used_kb: Optional[int] = 0
    domain_id: int

    class Config:
        from_attributes = True

# ----------------- Alias Schemas -----------------

class AliasCreate(BaseModel):
    source: str = Field(..., description="Source email alias, e.g., sales@example.co.zw")
    destination: str = Field(..., description="Destination email or comma-separated list of emails")

class AliasUpdate(BaseModel):
    destination: str = Field(..., description="Updated destination email(s)")

class AliasResponse(BaseModel):
    id: int
    source: str
    destination: str
    managed_by_platform: bool
    domain_id: int

    class Config:
        from_attributes = True

# ----------------- System & Log Schemas -----------------

class ServerHealthResponse(BaseModel):
    cpu_usage: float
    ram_usage: float
    disk_usage: float
    uptime: str
    updated_at: datetime

    class Config:
        from_attributes = True

class AdminLogResponse(BaseModel):
    id: int
    admin_email: str
    action: str
    target: str
    details: str
    timestamp: datetime

    class Config:
        from_attributes = True

class ProvisioningLogResponse(BaseModel):
    id: int
    domain_name: str
    step: str
    status: str
    details: str
    created_at: datetime

    class Config:
        from_attributes = True


class ZoneOwnershipResponse(BaseModel):
    domain: str
    credential_id: Optional[int] = None
    credential_label: Optional[str] = None
    cf_email: Optional[str] = None
    zone_id: Optional[str] = None
    status: str

class CloudflareZoneResponse(BaseModel):
    name: str
    zone_id: str
    status: Optional[str] = None
    credential_id: int
    credential_label: str
    cf_email: str


class DNSRecordInput(BaseModel):
    type: str
    name: str
    content: str
    priority: Optional[int] = None
    proxied: Optional[bool] = False
    ttl: Optional[int] = 3600



class PasswordChangeRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str


# ----------------- Console User Management Schemas -----------------

class ConsoleUserRoleResponse(BaseModel):
    id: int
    role: str
    scope: str

    class Config:
        from_attributes = True

class ConsoleUserAssignmentResponse(BaseModel):
    id: int
    domain_name: str

    class Config:
        from_attributes = True

class ConsoleUserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_superuser: bool
    is_active: bool
    date_joined: datetime
    roles: List[ConsoleUserRoleResponse] = []
    assignments: List[ConsoleUserAssignmentResponse] = []

    class Config:
        from_attributes = True

class ConsoleUserCreate(BaseModel):
    username: EmailStr
    password: str = Field(..., min_length=8)
    is_superuser: bool = False
    roles: List[str] = []
    domains: List[str] = []

class ConsoleUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    roles: Optional[List[str]] = None
    domains: Optional[List[str]] = None
    password: Optional[str] = Field(None, min_length=8)


# ----------------- Domain Registration Schemas -----------------

class DomainCheckRequest(BaseModel):
    domain: str = Field(..., description="The domain name, e.g., example.co.zw")

class DomainCheckResponse(BaseModel):
    domain: str
    exists: bool
    is_valid: bool = True
    error_message: Optional[str] = None

class DomainAddCloudflareRequest(BaseModel):
    domain: str = Field(..., description="The domain name, e.g., example.co.zw")
    credential_id: int = Field(..., description="The ID of the Cloudflare credential to use")

class CloudflareAddResponse(BaseModel):
    domain: str
    zone_id: Optional[str] = None
    ns1_hostname: Optional[str] = None
    ns1_ip: Optional[str] = None
    ns2_hostname: Optional[str] = None
    ns2_ip: Optional[str] = None
    default_owner: dict = {}

class DomainRegistrationCreate(BaseModel):
    domain_name: str
    action: str = 'N'
    cf_email: Optional[EmailStr] = None
    owner_name: str
    owner_org: Optional[str] = ""
    owner_address: str
    owner_city: str
    owner_country: str = "Zimbabwe"
    owner_phone: str
    owner_fax: Optional[str] = "None"
    owner_email: EmailStr
    zone_id: Optional[str] = None
    ns1_hostname: Optional[str] = None
    ns1_ip: Optional[str] = None
    ns2_hostname: Optional[str] = None
    ns2_ip: Optional[str] = None
    credential_id: Optional[int] = None

class BulkRegistrationRequest(BaseModel):
    domains: List[str]
    credential_id: int
    action: str = 'bulk_edit'
    owner_name: str
    owner_org: Optional[str] = "Civil Engineering Projects"
    owner_address: str
    owner_city: str
    owner_country: str = "Zimbabwe"
    owner_phone: str
    owner_fax: Optional[str] = "None"
    owner_email: EmailStr

class BulkRegistrationResponse(BaseModel):
    success_count: int
    failed_count: int
    groups_created: int
    failed_domains: List[str]

class DomainRegistrationResponse(BaseModel):
    id: int
    domain_name: str
    action: str
    cf_email: Optional[str] = None
    owner_name: str
    owner_org: Optional[str] = None
    owner_address: str
    owner_city: str
    owner_country: str
    owner_phone: str
    owner_fax: Optional[str] = None
    owner_email: str
    zone_id: Optional[str] = None
    ns1_hostname: Optional[str] = None
    ns1_ip: Optional[str] = None
    ns2_hostname: Optional[str] = None
    ns2_ip: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    submitted_by: Optional[int] = None
    submitted_at: datetime
    email_sent_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    credential_used: Optional[int] = None

    class Config:
        from_attributes = True


# ----------------- Geolocation Auth Schemas -----------------

class GeoDomainPolicyUpdate(BaseModel):
    allowed_countries: str = Field("", description="Comma-separated ISO country codes")
    allowed_regions: str = Field("SADC", description="Comma-separated regions (e.g., SADC)")

class GeoDomainPolicyResponse(BaseModel):
    id: int
    domain_id: int
    allowed_countries: str
    allowed_regions: str

    class Config:
        from_attributes = True

class GeoUserExceptionCreate(BaseModel):
    username: str = Field(..., description="Full email address of the user")
    allowed_countries: str = Field(..., description="Comma-separated ISO country codes")
    expires_at: Optional[datetime] = Field(None, description="Expiration datetime for the exception")

class GeoUserExceptionResponse(BaseModel):
    id: int
    username: str
    allowed_countries: str
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True

class GeoActiveBanResponse(BaseModel):
    id: int
    ip_address: str
    service: str
    banned_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True

class GeoVerifyRequest(BaseModel):
    username: str = Field(..., description="Username/Email being checked")
    ip_address: str = Field(..., description="Remote IP address of the client")
    service: str = Field(..., description="Service being accessed: imap, smtp, ssh")


