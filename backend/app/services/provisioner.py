import logging
from typing import List, Optional
import time
import secrets
import string
import subprocess
from backend.app.core.sudo import run_sudo
import os
from passlib.hash import sha512_crypt
from sqlalchemy.orm import Session
from backend.app.services.cloudflare import CloudflareService
from backend.app.services.ssl import SSLService
from backend.app.services.nginx import NginxService
from backend.app.services.dkim import DKIMService
from backend.app.models import (
    DomainProvisioningLog,
    MailDomain,
    MailAlias,
    MailUser,
    MailPlan,
    DomainAllocation,
    DomainZoneToken,
    CredentialDomainAssignment,
    DomainAssignment,
    DomainStats,
    AuthUser,
    UserRole,
)

logger = logging.getLogger(__name__)

class DomainProvisioner:
    def __init__(self, cf_email: str = None, cf_key: str = None, cf_token: str = None):
        """
        Initialize with either:
        - cf_email + cf_key (Global Key auth)
        - cf_token (Zone Token auth)
        """
        if cf_token:
            self.cf = CloudflareService(api_token=cf_token)
        else:
            self.cf = CloudflareService(email=cf_email, api_key=cf_key)
        self.ssl = SSLService()
        self.nginx = NginxService()
        self.dkim = DKIMService()
    
    def log_step(self, db: Session, domain: str, step: str, status: str, details: str = ""):
        """Helper to create log entries in SQLite/Default DB."""
        try:
            log_entry = DomainProvisioningLog(
                domain_name=domain,
                step=step,
                status=status,
                details=details
            )
            db.add(log_entry)
            db.commit()
            logger.info(f"[{domain}] {step}: {status}")
        except Exception as e:
            logger.error(f"Failed to log step {step} for {domain}: {e}")

    def generate_secure_password(self, length=16):
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(secrets.choice(alphabet) for _ in range(length))

    def rollback(self, db: Session, domain: str, zone_id: str, steps_completed: list):
        """Attempt to cleanup on failure."""
        logger.warning(f"Starting rollback for {domain} (Steps: {steps_completed})")
        
        if "DNS" in steps_completed:
            try:
                self.cf.delete_mail_dns(zone_id, domain)
                self.log_step(db, domain, "ROLLBACK", "INFO", "Removed DNS records")
            except Exception as e:
                logger.error(f"DNS Rollback failed: {e}")
                
        if "SSL" in steps_completed:
            try:
                cert_files = [
                    f"/etc/lego/certificates/{domain}.crt",
                    f"/etc/lego/certificates/{domain}.key",
                    f"/etc/lego/certificates/{domain}.issuer.crt",
                    f"/etc/lego/certificates/{domain}.json",
                    f"/etc/lego/certificates/_.{domain}.crt",
                    f"/etc/lego/certificates/_.{domain}.key",
                    f"/etc/lego/certificates/_.{domain}.issuer.crt",
                    f"/etc/lego/certificates/_.{domain}.json"
                ]
                for cert_file in cert_files:
                    run_sudo(["/usr/bin/rm", "-f", cert_file], capture_output=True)
                self.log_step(db, domain, "ROLLBACK", "INFO", "Removed SSL certificates")
            except Exception as e:
                logger.error(f"SSL Rollback failed: {e}")
                
        if "DKIM" in steps_completed:
            try:
                self.dkim.remove_keys(domain)
                self.log_step(db, domain, "ROLLBACK", "INFO", "Removed DKIM keys")
            except Exception as e:
                logger.error(f"DKIM Rollback failed: {e}")
        
        if "NGINX" in steps_completed:
            try:
                self.nginx.remove_config(domain)
                self.log_step(db, domain, "ROLLBACK", "INFO", "Removed Nginx config")
            except Exception as e:
                logger.error(f"Nginx Rollback failed: {e}")
        
        if "DB" in steps_completed or "TOKEN" in steps_completed:
            try:
                domain_ids = [row[0] for row in db.query(MailDomain.id).filter(MailDomain.name == domain).all()]
                if domain_ids:
                    db.query(MailAlias).filter(MailAlias.domain_id.in_(domain_ids)).delete(synchronize_session=False)
                # Delete MailUsers
                db.query(MailUser).filter(MailUser.email.endswith(f"@{domain}")).delete(synchronize_session=False)
                # Delete DomainAllocation
                db.query(DomainAllocation).filter(DomainAllocation.domain_name == domain).delete(synchronize_session=False)
                # Delete zone token
                db.query(DomainZoneToken).filter(DomainZoneToken.domain_name == domain).delete(synchronize_session=False)
                # Delete credential assignments and management records
                db.query(CredentialDomainAssignment).filter(CredentialDomainAssignment.domain_name == domain).delete(synchronize_session=False)
                db.query(DomainAssignment).filter(DomainAssignment.domain_name == domain).delete(synchronize_session=False)
                db.query(DomainStats).filter(DomainStats.domain_name == domain).delete(synchronize_session=False)
                # Delete MailDomain after child records
                db.query(MailDomain).filter(MailDomain.name == domain).delete(synchronize_session=False)
                db.commit()
                self.log_step(db, domain, "ROLLBACK", "INFO", "Removed Database records and Zone token")
            except Exception as e:
                db.rollback()
                logger.error(f"DB Rollback failed: {e}")

    def provision(self, db: Session, domain: str, plan_id: int, dns_records: Optional[List[dict]] = None) -> bool:
        """
        Full domain provisioning workflow:
        1. Create Zone Token (using Global Key)
        2. DNS (using Zone Token)
        3. SSL (using Zone Token)
        4. DKIM
        5. Nginx
        6. DB (MailDomain, Admin)
        """
        domain = domain.strip().lower()
        logger.info(f"[{domain}] Provisioning workflow started with plan_id={plan_id}")
        self.log_step(db, domain, "START", "PENDING", f"Starting provisioning with plan_id={plan_id}")
        steps_completed = []
        zone_id = None
        zone_token_secret = None
        
        try:
            # 1. Generate Zone-Scoped Token
            from backend.app.services.cf_token_generator import CloudflareTokenGenerator
            
            logger.info(f"[{domain}] Step 1: Handling Cloudflare Zone Token")
            # Check if token already exists (idempotency)
            existing_token = None
            dt = db.query(DomainZoneToken).filter(DomainZoneToken.domain_name == domain).first()
            if dt:
                logger.info(f"[{domain}] Found existing token record in database. Attempting to decrypt...")
                existing_token = dt.get_token()
                if not existing_token:
                    logger.warning(f"[{domain}] Existing token found but decryption failed.")
            else:
                logger.info(f"[{domain}] No existing token record found in database.")

            if existing_token:
                zone_token_secret = existing_token
                logger.info(f"[{domain}] Successfully decrypted existing zone token.")
                self.log_step(db, domain, "TOKEN", "SUCCESS", "Using existing zone token")
                # Need to fetch zone_id still
                logger.info(f"[{domain}] Fetching zone_id for existing token...")
                zone_id = self.cf.get_zone_id(domain)
                logger.info(f"[{domain}] zone_id: {zone_id}")
            else:
                logger.info(f"[{domain}] Generating new zone-scoped token...")
                email = self.cf.headers.get("X-Auth-Email")
                key = self.cf.headers.get("X-Auth-Key")
                
                if not email or not key:
                    logger.error(f"[{domain}] TOKEN FAIL: Global Key or Email missing from self.cf.headers.")
                    self.log_step(db, domain, "TOKEN", "FAILED", "Global Key required for initial token generation")
                    return False
                
                logger.info(f"[{domain}] Using global creds: {email}")
                generator = CloudflareTokenGenerator(email, key)
                
                logger.info(f"[{domain}] Fetching account_id...")
                account_id = generator.get_account_id()
                logger.info(f"[{domain}] account_id: {account_id}")
                
                logger.info(f"[{domain}] Fetching zone_id...")
                zone_id = generator.get_zone_id(domain)
                logger.info(f"[{domain}] zone_id: {zone_id}")
                
                if not zone_id:
                     logger.error(f"[{domain}] TOKEN FAIL: zone_id not found for domain.")
                     self.log_step(db, domain, "TOKEN", "FAILED", "Could not find Cloudflare Zone")
                     return False

                logger.info(f"[{domain}] Creating zone token...")
                token_id, token_secret = generator.create_zone_token(domain, zone_id, account_id)
                logger.info(f"[{domain}] Token created. token_id: {token_id}")
                
                if not token_secret:
                    logger.error(f"[{domain}] TOKEN FAIL: token_secret not returned by generator.")
                    self.log_step(db, domain, "TOKEN", "FAILED", "Failed to generate zone token")
                    return False
                
                # Store it
                logger.info(f"[{domain}] Storing new zone token in database...")
                try:
                    zt = db.query(DomainZoneToken).filter(DomainZoneToken.domain_name == domain).first()
                    if not zt:
                        zt = DomainZoneToken(domain_name=domain)
                        db.add(zt)
                    zt.cf_token_id = token_id
                    zt.set_token(token_secret)
                    db.commit()
                    logger.info(f"[{domain}] Zone token stored successfully")
                except Exception as e:
                    db.rollback()
                    logger.exception(f"[{domain}] Failed to store zone token: {e}")
                    # Recovery: try one last 'get' just in case another thread just saved it
                    dt = db.query(DomainZoneToken).filter(DomainZoneToken.domain_name == domain).first()
                    if dt:
                        logger.info(f"[{domain}] Recovered from save error by picking up existing token.")
                        token_secret = dt.get_token()
                    
                    if not token_secret:
                        self.log_step(db, domain, "TOKEN", "FAILED", "Failed to save zone token")
                        return False
                
                zone_token_secret = token_secret
                self.log_step(db, domain, "TOKEN", "SUCCESS", "Zone-scoped API token created")
                steps_completed.append("TOKEN")

            # 2. Re-initialize CF Service with Zone Token for DNS operations
            logger.info(f"[{domain}] Re-initializing CloudflareService with restricted Zone Token.")
            self.cf = CloudflareService(api_token=zone_token_secret)
            
            # DNS Configuration
            logger.info(f"[{domain}] Step 2: Configuring DNS records...")
            dns_success = True
            if dns_records:
                logger.info(f"[{domain}] Using user-confirmed DNS records...")
                for rec in dns_records:
                    if not self.cf.create_dns_record(zone_id, rec):
                        logger.error(f"[{domain}] Failed to create DNS record: {rec}")
                        dns_success = False
            else:
                dns_success = self.cf.configure_mail_dns(zone_id, domain)
                
            if not dns_success:
                self.log_step(db, domain, "DNS", "FAILED", "Failed to create DNS records")
                self.rollback(db, domain, zone_id, steps_completed)
                return False
            
            steps_completed.append("DNS")
            self.log_step(db, domain, "DNS", "SUCCESS", "DNS records configured")
            
            # 3. SSL
            logger.info(f"[{domain}] Step 3: Provisioning Wildcard SSL via Lego...")
            if not self.ssl.provision_wildcard(domain, cf_token=zone_token_secret):
                logger.error(f"[{domain}] SSL FAIL: provision_wildcard returned False.")
                self.log_step(db, domain, "SSL", "FAILED", "Lego certificate generation failed")
                self.rollback(db, domain, zone_id, steps_completed)
                return False
            
            steps_completed.append("SSL")
            self.log_step(db, domain, "SSL", "SUCCESS", "Certificates generated")

            # 4. DKIM
            logger.info(f"[{domain}] Step 4: Activating DKIM keys...")
            # Key should already be generated in stage 1, but we call generate_dkim_key (which is idempotent)
            selector, dkim_pub = self.dkim.generate_dkim_key(domain)
            if selector and dkim_pub:
                logger.info(f"[{domain}] DKIM keys ready. Selector: {selector}.")
                # Always upsert DKIM after final key activation. In DNS-review
                # provisioning the review step may have published an earlier key;
                # this keeps Cloudflare aligned with the private key Rspamd signs with.
                if self.cf.add_dkim_record(zone_id, domain, selector, dkim_pub):
                    steps_completed.append("DKIM")
                    self.log_step(db, domain, "DKIM", "SUCCESS", "DKIM key generated and DNS updated")
                else:
                    self.log_step(db, domain, "DKIM", "WARNING", "DKIM DNS update failed, but proceeding")
            else:
                self.log_step(db, domain, "DKIM", "WARNING", "DKIM generation failed, but proceeding")
            
            # 5. Nginx
            logger.info(f"[{domain}] Step 5: Deploying Nginx configuration...")
            if not self.nginx.deploy_config(domain):
                logger.error(f"[{domain}] NGINX FAIL: deploy_config returned False.")
                self.log_step(db, domain, "NGINX", "FAILED", "Nginx config deploy failed")
                self.rollback(db, domain, zone_id, steps_completed)
                return False
            
            steps_completed.append("NGINX")
            self.log_step(db, domain, "NGINX", "SUCCESS", "Webmail config active")
            
            # 6. Database Setup
            logger.info(f"[{domain}] Step 6: Setting up database records...")
            try:
                # Create/Get MailDomain
                logger.info(f"[{domain}] Creating/updating MailDomain...")
                mail_domain = db.query(MailDomain).filter(MailDomain.name == domain).first()
                if not mail_domain:
                    mail_domain = MailDomain(name=domain, max_users=10, max_aliases=20)
                    db.add(mail_domain)
                    db.commit()
                    logger.info(f"[{domain}] MailDomain created")
                
                # Assign Plan
                logger.info(f"[{domain}] Updating plan allocation for plan_id={plan_id}...")
                plan = db.query(MailPlan).filter(MailPlan.id == plan_id).first()
                if not plan:
                    raise Exception(f"MailPlan with id {plan_id} not found")
                
                allocation = db.query(DomainAllocation).filter(DomainAllocation.domain_name == domain).first()
                if not allocation:
                    allocation = DomainAllocation(domain_name=domain)
                    db.add(allocation)
                allocation.plan_id = plan.id
                
                # Update Domain Limits
                mail_domain.max_users = plan.max_users
                mail_domain.max_aliases = plan.max_aliases
                db.commit()
                logger.info(f"[{domain}] Domain limits updated in DB.")
                
                steps_completed.append("DB")
                
                # Create Default Admin User
                admin_email = f"admin@{domain}"
                logger.info(f"[{domain}] Creating default admin user: {admin_email}")
                admin_password = self.generate_secure_password()
                hashed_password = sha512_crypt.hash(admin_password)

                exists = db.query(MailUser).filter(MailUser.email == admin_email).first() is not None
                if not exists:
                    # Construct UID (normally same as email or username)
                    admin_user = MailUser(
                        email=admin_email,
                        password=hashed_password,
                        domain_id=mail_domain.id,
                        uid=admin_email,
                        full_name="Domain Admin"
                    )
                    db.add(admin_user)
                    db.commit()
                    logger.info(f"[{domain}] Admin user created successfully.")
                    # Log credentials briefly so the user can copy it once in the UI logs
                    self.log_step(db, domain, "DB", "SUCCESS", f"Admin: {admin_email} | Password: {admin_password}")
                else:
                    logger.info(f"[{domain}] Admin user already exists.")
                    self.log_step(db, domain, "DB", "SUCCESS", "Domain setup complete (Admin already exists)")

                # Ensure local AuthUser and support_admin role / DomainAssignment exist
                from datetime import datetime
                auth_user = db.query(AuthUser).filter(AuthUser.username == admin_email).first()
                if not auth_user:
                    logger.info(f"[{domain}] Creating AuthUser for default admin: {admin_email}")
                    auth_user = AuthUser(
                        username=admin_email,
                        password="",  # Managed via mail_user
                        email=admin_email,
                        first_name="Domain",
                        last_name="Admin",
                        is_superuser=False,
                        is_staff=False,
                        is_active=True,
                        date_joined=datetime.utcnow()
                    )
                    db.add(auth_user)
                    db.flush()

                # Give default admin support_admin privileges
                has_role = db.query(UserRole).filter(
                    UserRole.user_id == auth_user.id,
                    UserRole.role == "support_admin"
                ).first() is not None
                if not has_role:
                    logger.info(f"[{domain}] Assigning support_admin role to default admin")
                    role_entry = UserRole(user_id=auth_user.id, role="support_admin", scope="global")
                    db.add(role_entry)

                # Ensure domain assignment is mapped to this user
                has_assignment = db.query(DomainAssignment).filter(
                    DomainAssignment.user_id == auth_user.id,
                    DomainAssignment.domain_name == domain
                ).first() is not None
                if not has_assignment:
                    logger.info(f"[{domain}] Mapping domain assignment to default admin")
                    assignment = DomainAssignment(user_id=auth_user.id, domain_name=domain)
                    db.add(assignment)

                db.commit()

            except Exception as e:
                db.rollback()
                logger.exception(f"[{domain}] DB FAIL: unexpected error during DB setup.")
                self.log_step(db, domain, "DB", "FAILED", f"Database error: {str(e)}")
                self.rollback(db, domain, zone_id, steps_completed)
                return False
                
            logger.info(f"[{domain}] Provisioning workflow completed successfully.")
            self.log_step(db, domain, "COMPLETE", "SUCCESS", "Provisioning finished successfully")
            return True

        except Exception as global_e:
            logger.exception(f"[{domain}] CRITICAL FAIL: Global exception in provisioning workflow.")
            self.log_step(db, domain, "CRITICAL", "FAILED", f"System Error: {global_e}")
            if zone_id:
                self.rollback(db, domain, zone_id, steps_completed)
            return False

    def delete_domain(self, db: Session, domain: str) -> bool:
        """
        Comprehensive domain deletion workflow:
        1. Fetch zone token for DNS cleanup
        2. Delete DNS records (MX, SPF, DMARC, DKIM, CNAME)
        3. Delete SSL certificates
        4. Delete Nginx configuration
        5. Delete DKIM keys
        6. Delete database records (both tables)
        7. Delete zone token
        """
        domain = domain.strip().lower()
        logger.info(f"[{domain}] Starting domain deletion workflow")
        self.log_step(db, domain, "DELETE_START", "PENDING", "Starting domain deletion")
        
        deletion_errors = []
        global_cf_email = self.cf.headers.get("X-Auth-Email")
        global_cf_key = self.cf.headers.get("X-Auth-Key")
        
        try:
            # Step 1: Get zone token for DNS operations
            zone_token_record = db.query(DomainZoneToken).filter(DomainZoneToken.domain_name == domain).first()
            zone_token_id = zone_token_record.cf_token_id if zone_token_record else None
            
            if zone_token_record:
                logger.info(f"[{domain}] Found zone token record, decrypting...")
                zone_token = zone_token_record.get_token()
                
                if zone_token:
                    logger.info(f"[{domain}] Successfully decrypted zone token")
                    # Re-initialize CloudflareService with zone token
                    self.cf = CloudflareService(api_token=zone_token)
                    
                    # Get zone ID
                    zone_id = self.cf.get_zone_id(domain)
                    if zone_id:
                        logger.info(f"[{domain}] Found zone_id: {zone_id}")
                        
                        # Step 2: Delete DNS records
                        try:
                            logger.info(f"[{domain}] Deleting DNS records...")
                            self.cf.delete_mail_dns(zone_id, domain)
                            self.log_step(db, domain, "DELETE_DNS", "SUCCESS", "DNS records removed")
                        except Exception as e:
                            error_msg = f"DNS deletion failed: {e}"
                            logger.error(f"[{domain}] {error_msg}")
                            deletion_errors.append(error_msg)
                            self.log_step(db, domain, "DELETE_DNS", "FAILED", error_msg)
                    else:
                        logger.warning(f"[{domain}] Could not find zone_id, skipping DNS deletion")
                else:
                    logger.warning(f"[{domain}] Could not decrypt zone token, skipping DNS deletion")
            else:
                logger.warning(f"[{domain}] No zone token found, skipping DNS deletion")
            
            # Step 3: Delete SSL certificates
            try:
                logger.info(f"[{domain}] Deleting SSL certificates...")
                
                # Try both naming conventions
                cert_files = [
                    f"/etc/lego/certificates/{domain}.crt",
                    f"/etc/lego/certificates/{domain}.key",
                    f"/etc/lego/certificates/{domain}.issuer.crt",
                    f"/etc/lego/certificates/{domain}.json",
                    f"/etc/lego/certificates/_.{domain}.crt",
                    f"/etc/lego/certificates/_.{domain}.key",
                    f"/etc/lego/certificates/_.{domain}.issuer.crt",
                    f"/etc/lego/certificates/_.{domain}.json"
                ]
                
                for cert_file in cert_files:
                    run_sudo(
                        ["/usr/bin/rm", "-f", cert_file],
                        capture_output=True,
                        text=True
                    )
                
                logger.info(f"[{domain}] SSL certificate cleanup completed")
                self.log_step(db, domain, "DELETE_SSL", "SUCCESS", "SSL certificates removed")
            except Exception as e:
                error_msg = f"SSL deletion failed: {e}"
                logger.error(f"[{domain}] {error_msg}")
                deletion_errors.append(error_msg)
                self.log_step(db, domain, "DELETE_SSL", "FAILED", error_msg)
            
            # Step 4: Delete Nginx configuration
            try:
                logger.info(f"[{domain}] Deleting Nginx configuration...")
                self.nginx.remove_config(domain)
                self.log_step(db, domain, "DELETE_NGINX", "SUCCESS", "Nginx config removed")
            except Exception as e:
                error_msg = f"Nginx deletion failed: {e}"
                logger.error(f"[{domain}] {error_msg}")
                deletion_errors.append(error_msg)
                self.log_step(db, domain, "DELETE_NGINX", "FAILED", error_msg)
            
            # Step 5: Delete DKIM keys
            try:
                logger.info(f"[{domain}] Deleting DKIM keys...")
                self.dkim.remove_keys(domain)
                self.log_step(db, domain, "DELETE_DKIM", "SUCCESS", "DKIM keys removed")
            except Exception as e:
                error_msg = f"DKIM deletion failed: {e}"
                logger.error(f"[{domain}] {error_msg}")
                deletion_errors.append(error_msg)
                self.log_step(db, domain, "DELETE_DKIM", "FAILED", error_msg)
            
            # Step 6: Delete database records
            try:
                logger.info(f"[{domain}] Deleting database records...")
                
                domain_ids = [row[0] for row in db.query(MailDomain.id).filter(MailDomain.name == domain).all()]

                aliases_deleted = 0
                if domain_ids:
                    aliases_deleted = db.query(MailAlias).filter(MailAlias.domain_id.in_(domain_ids)).delete(synchronize_session=False)
                logger.info(f"[{domain}] Deleted MailAliases count: {aliases_deleted}")

                # Delete MailUsers
                mail_users_deleted = db.query(MailUser).filter(MailUser.email.endswith(f"@{domain}")).delete(synchronize_session=False)
                logger.info(f"[{domain}] Deleted MailUsers count: {mail_users_deleted}")
                
                # Delete DomainAllocation
                domain_allocation_deleted = db.query(DomainAllocation).filter(DomainAllocation.domain_name == domain).delete(synchronize_session=False)
                logger.info(f"[{domain}] Deleted DomainAllocation count: {domain_allocation_deleted}")
                
                # Revoke and delete zone token
                if zone_token_record:
                    if zone_token_id and global_cf_email and global_cf_key:
                        try:
                            from backend.app.services.cf_token_generator import CloudflareTokenGenerator
                            generator = CloudflareTokenGenerator(global_cf_email, global_cf_key)
                            if generator.revoke_token(zone_token_id):
                                logger.info(f"[{domain}] Revoked Cloudflare zone token {zone_token_id}")
                            else:
                                error_msg = "Cloudflare zone token revocation failed"
                                logger.error(f"[{domain}] {error_msg}")
                                deletion_errors.append(error_msg)
                        except Exception as e:
                            error_msg = f"Cloudflare zone token revocation failed: {e}"
                            logger.error(f"[{domain}] {error_msg}")
                            deletion_errors.append(error_msg)
                    else:
                        logger.warning(f"[{domain}] Missing global Cloudflare credentials; skipping zone token revocation")
                    db.delete(zone_token_record)
                    logger.info(f"[{domain}] Deleted DomainZoneToken")
                
                # Delete credential assignments
                cred_assignments_deleted = db.query(CredentialDomainAssignment).filter(CredentialDomainAssignment.domain_name == domain).delete(synchronize_session=False)
                logger.info(f"[{domain}] Deleted CredentialDomainAssignments count: {cred_assignments_deleted}")

                domain_assignments_deleted = db.query(DomainAssignment).filter(DomainAssignment.domain_name == domain).delete(synchronize_session=False)
                logger.info(f"[{domain}] Deleted DomainAssignments count: {domain_assignments_deleted}")

                domain_stats_deleted = db.query(DomainStats).filter(DomainStats.domain_name == domain).delete(synchronize_session=False)
                logger.info(f"[{domain}] Deleted DomainStats count: {domain_stats_deleted}")

                # Delete MailDomain after child records
                mail_domain_deleted = db.query(MailDomain).filter(MailDomain.name == domain).delete(synchronize_session=False)
                logger.info(f"[{domain}] Deleted MailDomain count: {mail_domain_deleted}")
                
                db.commit()
                self.log_step(db, domain, "DELETE_DB", "SUCCESS", "Database records removed")
            except Exception as e:
                db.rollback()
                error_msg = f"Database deletion failed: {e}"
                logger.error(f"[{domain}] {error_msg}")
                deletion_errors.append(error_msg)
                self.log_step(db, domain, "DELETE_DB", "FAILED", error_msg)

            # Step 7: Delete physical mailboxes from disk
            try:
                vmail_path = f"/var/vmail/{domain}"
                logger.info(f"[{domain}] Removing mail directory {vmail_path}...")
                run_sudo(
                    ["/usr/bin/rm", "-rf", vmail_path],
                    check=True,
                    capture_output=True
                )
                self.log_step(db, domain, "DELETE_VMAIL", "SUCCESS", "Physical mailboxes removed")
            except Exception as e:
                error_msg = f"Physical mailbox deletion failed: {e}"
                logger.error(f"[{domain}] {error_msg}")
                deletion_errors.append(error_msg)
                self.log_step(db, domain, "DELETE_VMAIL", "FAILED", error_msg)

            # Step 8: Purge SOGo folders and profiles from database
            try:
                from sqlalchemy import text
                logger.info(f"[{domain}] Cleaning up SOGo folders and user profiles...")
                
                # Delete user profiles
                sogo_profiles_deleted = db.execute(
                    text("DELETE FROM sogo_user_profile WHERE c_uid LIKE :uid_pattern"),
                    {"uid_pattern": f"%@{domain}"}
                ).rowcount
                logger.info(f"[{domain}] Deleted SOGo profiles: {sogo_profiles_deleted}")

                # Find and drop folder tables
                folders = db.execute(
                    text("SELECT c_folder_id, c_location FROM sogo_folder_info WHERE c_path LIKE :path_pattern"),
                    {"path_pattern": f"/Users/%@{domain}/%"}
                ).all()

                for folder in folders:
                    c_location = folder[1]
                    if c_location and "mailserver/" in c_location:
                        table_name = c_location.split("mailserver/")[-1]
                        if table_name:
                            logger.info(f"[{domain}] Dropping SOGo table {table_name}...")
                            db.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
                            db.execute(text(f"DROP TABLE IF EXISTS {table_name}_acl"))
                            db.execute(text(f"DROP TABLE IF EXISTS {table_name}_quick"))

                # Delete from sogo_folder_info
                sogo_folders_deleted = db.execute(
                    text("DELETE FROM sogo_folder_info WHERE c_path LIKE :path_pattern"),
                    {"path_pattern": f"/Users/%@{domain}/%"}
                ).rowcount
                logger.info(f"[{domain}] Deleted sogo_folder_info entries: {sogo_folders_deleted}")
                
                db.commit()
                self.log_step(db, domain, "DELETE_SOGO", "SUCCESS", "SOGo metadata and tables cleared")
            except Exception as e:
                db.rollback()
                error_msg = f"SOGo cleanup failed: {e}"
                logger.error(f"[{domain}] {error_msg}")
                deletion_errors.append(error_msg)
                self.log_step(db, domain, "DELETE_SOGO", "FAILED", error_msg)
            
            # Final status
            if deletion_errors:
                error_summary = "; ".join(deletion_errors)
                self.log_step(db, domain, "DELETE_COMPLETE", "PARTIAL", f"Completed with errors: {error_summary}")
                logger.warning(f"[{domain}] Domain deletion completed with errors: {error_summary}")
                return False
            else:
                self.log_step(db, domain, "DELETE_COMPLETE", "SUCCESS", "Domain fully deleted")
                logger.info(f"[{domain}] Domain deletion completed successfully")
                return True
                
        except Exception as e:
            logger.exception(f"[{domain}] Unexpected error during deletion: {e}")
            self.log_step(db, domain, "DELETE_COMPLETE", "FAILED", f"Unexpected error: {str(e)}")
            return False
