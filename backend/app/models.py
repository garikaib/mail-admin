from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

# ----------------- Mail Server Models (MariaDB Legacy) -----------------

class MailDomain(Base):
    __tablename__ = 'domains'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False)
    max_users = Column(Integer, default=50)
    max_aliases = Column(Integer, default=100)
    is_active = Column(Boolean, default=True)

    users = relationship("MailUser", back_populates="domain")
    aliases = relationship("MailAlias", back_populates="domain")


class MailUser(Base):
    __tablename__ = 'users'

    uid = Column("c_uid", String(128), primary_key=True)
    email = Column("mail", String(255), unique=True, nullable=False)
    password = Column("c_password", String(255), nullable=False)
    full_name = Column("c_name", String(128), nullable=False)
    name = Column("c_cn", String(128), nullable=True)
    domain_id = Column(Integer, ForeignKey('domains.id'), nullable=False)
    quota_kb = Column(Integer, default=1048576)

    domain = relationship("MailDomain", back_populates="users")

    @property
    def used_kb(self) -> int:
        import os
        if not self.email or '@' not in self.email:
            return 0
        username, domain_name = self.email.split('@', 1)
        path = f"/var/vmail/{domain_name}/{username}"
        if not os.path.exists(path):
            return 0
        total_size = 0
        try:
            for dirpath, dirnames, filenames in os.walk(path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    try:
                        total_size += os.path.getsize(fp)
                    except OSError:
                        pass
        except Exception:
            pass
        return int(total_size / 1024)


class MailAlias(Base):
    __tablename__ = 'aliases'

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain_id = Column(Integer, ForeignKey('domains.id'), nullable=False)
    source = Column(String(255), nullable=False)
    destination = Column(Text, nullable=False)
    managed_by_platform = Column(Boolean, default=False)

    domain = relationship("MailDomain", back_populates="aliases")


class DomainStats(Base):
    __tablename__ = 'domain_stats'

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain_name = Column(String(255), unique=True, nullable=False)
    sent_count = Column(Integer, default=0)
    received_count = Column(Integer, default=0)
    top_sender = Column(String(255), nullable=True)
    metrics_json = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ServerHealth(Base):
    __tablename__ = 'server_health'

    id = Column(Integer, primary_key=True, autoincrement=True)
    cpu_usage = Column(Float, nullable=False)
    ram_usage = Column(Float, nullable=False)
    disk_usage = Column(Float, nullable=False)
    uptime = Column(String(50), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ----------------- Management Models (Internal Tables) -----------------

class AuthUser(Base):
    """
    Internal platform account used by the FastAPI auth layer.
    """
    __tablename__ = 'auth_user'

    id = Column(Integer, primary_key=True, autoincrement=True)
    password = Column(String(128), nullable=False)
    last_login = Column(DateTime, nullable=True)
    is_superuser = Column(Boolean, default=False, nullable=False)
    username = Column(String(150), unique=True, nullable=False)
    first_name = Column(String(150), nullable=False)
    last_name = Column(String(150), nullable=False)
    email = Column(String(254), nullable=False)
    is_staff = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    date_joined = Column(DateTime, default=datetime.utcnow, nullable=False)

    assignments = relationship("DomainAssignment", back_populates="user", cascade="all, delete-orphan")
    cf_assignments = relationship("UserCredentialAssignment", back_populates="user", cascade="all, delete-orphan")
    registrations = relationship("DomainRegistration", back_populates="submitted_by_user")
    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    identities = relationship("AuthIdentity", back_populates="user", cascade="all, delete-orphan")


class AuthIdentity(Base):
    __tablename__ = 'core_authidentity'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('auth_user.id'), nullable=False)
    provider = Column(String(50), nullable=False)
    subject = Column(String(255), nullable=False)
    email = Column(String(254), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("AuthUser", back_populates="identities")

    __table_args__ = (
        UniqueConstraint('provider', 'subject', name='core_authidentity_provider_subject_key'),
    )


class UserRole(Base):
    __tablename__ = 'core_userrole'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('auth_user.id'), nullable=False)
    role = Column(String(100), nullable=False)
    scope = Column(String(255), default="global", nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("AuthUser", back_populates="roles")

    __table_args__ = (
        UniqueConstraint('user_id', 'role', 'scope', name='core_userrole_user_role_scope_key'),
    )


class AdminLog(Base):
    __tablename__ = 'core_adminlog'

    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_email = Column(String(254), nullable=False)
    action = Column(String(50), nullable=False)
    target = Column(String(255), nullable=False)
    details = Column(Text, default="")
    timestamp = Column(DateTime, default=datetime.utcnow)


class MailPlan(Base):
    __tablename__ = 'core_mailplan'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    max_users = Column(Integer, default=10)
    max_aliases = Column(Integer, default=20)
    quota_mb = Column(Integer, default=500)
    is_default = Column(Boolean, default=False)

    allocations = relationship("DomainAllocation", back_populates="plan")


class DomainAllocation(Base):
    __tablename__ = 'core_domainallocation'

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain_name = Column(String(255), unique=True, nullable=False)
    plan_id = Column(Integer, ForeignKey('core_mailplan.id'), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    plan = relationship("MailPlan", back_populates="allocations")


class EncryptedCloudflareCredential(Base):
    __tablename__ = 'core_encryptedcloudflarecredential'

    id = Column(Integer, primary_key=True, autoincrement=True)
    label = Column(String(100), nullable=False)
    email = Column(String(254), nullable=False)
    encrypted_api_key = Column(Text, nullable=False)
    salt = Column(Text, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    assignments = relationship("CredentialDomainAssignment", back_populates="credential")
    user_assignments = relationship("UserCredentialAssignment", back_populates="credential")
    registrations = relationship("DomainRegistration", back_populates="credential_used_rel")

    def set_api_key(self, api_key_cleartext: str):
        from backend.app.core.security import encrypt_secret
        import base64
        token, salt = encrypt_secret(api_key_cleartext)
        self.encrypted_api_key = base64.b64encode(token).decode('utf-8')
        self.salt = base64.b64encode(salt).decode('utf-8')

    def get_api_key(self) -> str:
        from backend.app.core.security import decrypt_secret
        import base64
        try:
            token = base64.b64decode(self.encrypted_api_key)
            salt = base64.b64decode(self.salt)
            return decrypt_secret(token, salt)
        except Exception:
            return None


class DomainZoneToken(Base):
    __tablename__ = 'core_domainzonetoken'

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain_name = Column(String(255), unique=True, nullable=False, index=True)
    cf_token_id = Column(String(64), nullable=False)
    encrypted_token = Column(Text, nullable=False)
    salt = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    def set_token(self, token_cleartext: str):
        from backend.app.core.security import encrypt_secret
        import base64
        token, salt = encrypt_secret(token_cleartext)
        self.encrypted_token = base64.b64encode(token).decode('utf-8')
        self.salt = base64.b64encode(salt).decode('utf-8')

    def get_token(self) -> str:
        from backend.app.core.security import decrypt_secret
        import base64
        try:
            token = base64.b64decode(self.encrypted_token)
            salt = base64.b64decode(self.salt)
            return decrypt_secret(token, salt)
        except Exception:
            return None


class CredentialDomainAssignment(Base):
    __tablename__ = 'core_credentialdomainassignment'

    id = Column(Integer, primary_key=True, autoincrement=True)
    credential_id = Column(Integer, ForeignKey('core_encryptedcloudflarecredential.id'), nullable=False)
    domain_name = Column(String(255), nullable=False)

    credential = relationship("EncryptedCloudflareCredential", back_populates="assignments")

    __table_args__ = (
        UniqueConstraint('credential_id', 'domain_name', name='core_credentialdomainassignment_credential_id_domain_name_key'),
    )


class DomainProvisioningLog(Base):
    __tablename__ = 'core_domainprovisioninglog'

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain_name = Column(String(255), nullable=False)
    step = Column(String(50), nullable=False)  # DNS, SSL, NGINX, POSTFIX
    status = Column(String(20), nullable=False)  # PENDING, SUCCESS, FAILED
    details = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class DomainAssignment(Base):
    __tablename__ = 'core_domainassignment'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('auth_user.id'), nullable=False)
    domain_name = Column(String(255), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("AuthUser", back_populates="assignments")

    __table_args__ = (
        UniqueConstraint('user_id', 'domain_name', name='core_domainassignment_user_id_domain_name_key'),
    )


class SystemEmailConfig(Base):
    __tablename__ = 'core_systememailconfig'

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(254), unique=True, nullable=False)
    encrypted_password = Column(Text, nullable=False)
    salt = Column(Text, nullable=False)
    smtp_host = Column(String(255), default='mail.zimpricecheck.com')
    smtp_port = Column(Integer, default=587)
    use_tls = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, password_cleartext: str):
        from backend.app.core.security import encrypt_secret
        import base64
        encrypted, salt = encrypt_secret(password_cleartext)
        self.encrypted_password = base64.b64encode(encrypted).decode('utf-8')
        self.salt = base64.b64encode(salt).decode('utf-8')

    def get_password(self) -> str:
        from backend.app.core.security import decrypt_secret
        import base64
        try:
            encrypted = base64.b64decode(self.encrypted_password)
            salt = base64.b64decode(self.salt)
            return decrypt_secret(encrypted, salt)
        except Exception:
            return None


class DomainRegistration(Base):
    __tablename__ = 'core_domainregistration'

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain_name = Column(String(255), unique=True, nullable=False)
    action = Column(String(20), default='N')  # N, M, T, bulk_edit
    cf_email = Column(String(254), nullable=True)
    
    owner_name = Column(String(255), nullable=False)
    owner_org = Column(String(255), default="")
    owner_address = Column(Text, nullable=False)
    owner_city = Column(String(100), nullable=False)
    owner_country = Column(String(100), default='Zimbabwe')
    owner_phone = Column(String(50), nullable=False)
    owner_fax = Column(String(50), default='None')
    owner_email = Column(String(254), nullable=False)
    
    zone_id = Column(String(64), nullable=True)
    ns1_hostname = Column(String(255), nullable=True)
    ns1_ip = Column(String(45), nullable=True)
    ns2_hostname = Column(String(255), nullable=True)
    ns2_ip = Column(String(45), nullable=True)
    
    status = Column(String(20), default='cf_pending')
    error_message = Column(Text, default="")
    
    submitted_by = Column("submitted_by_id", Integer, ForeignKey('auth_user.id'), nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    email_sent_at = Column(DateTime, nullable=True)
    activated_at = Column(DateTime, nullable=True)
    
    credential_used = Column("credential_used_id", Integer, ForeignKey('core_encryptedcloudflarecredential.id'), nullable=True)

    submitted_by_user = relationship("AuthUser", back_populates="registrations")
    credential_used_rel = relationship("EncryptedCloudflareCredential", back_populates="registrations")


class UserCredentialAssignment(Base):
    __tablename__ = 'core_usercredentialassignment'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('auth_user.id'), nullable=False)
    credential_id = Column(Integer, ForeignKey('core_encryptedcloudflarecredential.id'), nullable=False)
    is_owner = Column(Boolean, default=False)

    user = relationship("AuthUser", back_populates="cf_assignments")
    credential = relationship("EncryptedCloudflareCredential", back_populates="user_assignments")

    __table_args__ = (
        UniqueConstraint('user_id', 'credential_id', name='core_usercredentialassignment_user_id_credential_id_key'),
    )
