import logging
import requests
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.models import (
    CloudflareAccount,
    CloudflareCredentialAccount,
    ManagedDomain,
    CloudflareWebmailPrimary,
    EncryptedCloudflareCredential,
    MailDomain
)
from backend.app.services.cloudflare import CloudflareService

logger = logging.getLogger(__name__)

class CloudflareGroupingService:
    MAIL_SERVER_IP = "51.77.222.232"
    MAIL_SERVER_IPV6 = "2001:41d0:305:2100::8406"

    def discover_and_sync_accounts_and_zones(self, db: Session) -> dict:
        """
        Enumerate all global credentials, fetch their visible zones, and sync them to DB.
        Returns a summary of the sync execution.
        """
        logger.info("Starting Cloudflare account and zone discovery/sync...")
        credentials = db.query(EncryptedCloudflareCredential).all()
        synced_accounts = 0
        synced_domains = 0
        errors = []

        for cred in credentials:
            try:
                decrypted_key = cred.get_api_key()
                if not decrypted_key:
                    logger.warning(f"Failed to decrypt API key/token for credential: {cred.label}")
                    continue

                # Detect if the API key is a token vs global
                if len(decrypted_key) > 37 or '-' in decrypted_key:
                    cf_service = CloudflareService(api_token=decrypted_key)
                else:
                    cf_service = CloudflareService(email=cred.email, api_key=decrypted_key)

                zones = cf_service.list_all_zones()
                logger.info(f"Credential {cred.label} sees {len(zones)} zones.")

                for zone in zones:
                    account_data = zone.get("account", {})
                    account_id = account_data.get("id")
                    account_name = account_data.get("name")

                    if not account_id:
                        logger.warning(f"Zone {zone.get('name')} does not have an account ID associated.")
                        continue

                    # 1. Sync CloudflareAccount
                    cf_acc = db.query(CloudflareAccount).filter(CloudflareAccount.cloudflare_account_id == account_id).first()
                    if not cf_acc:
                        cf_acc = CloudflareAccount(cloudflare_account_id=account_id, name=account_name)
                        db.add(cf_acc)
                        db.flush()
                        synced_accounts += 1
                    elif cf_acc.name != account_name:
                        cf_acc.name = account_name
                        db.flush()

                    # 2. Sync CredentialAccount relation
                    cca = db.query(CloudflareCredentialAccount).filter(
                        CloudflareCredentialAccount.credential_id == cred.id,
                        CloudflareCredentialAccount.cloudflare_account_id == account_id
                    ).first()
                    if not cca:
                        cca = CloudflareCredentialAccount(credential_id=cred.id, cloudflare_account_id=account_id)
                        db.add(cca)
                        db.flush()

                    # 3. Sync ManagedDomain (Source/Status: discovered/discovered if not already present)
                    domain_name = zone["name"].strip().lower()
                    md = db.query(ManagedDomain).filter(ManagedDomain.domain == domain_name).first()
                    
                    # Also sync relation with MailDomain if MailDomain is already provisioned
                    mail_dom_exists = db.query(MailDomain).filter(MailDomain.name == domain_name).first() is not None

                    if not md:
                        md = ManagedDomain(
                            domain=domain_name,
                            zone_id=zone["id"],
                            cloudflare_account_id=account_id,
                            credential_id_last_used=cred.id,
                            source="discovered" if not mail_dom_exists else "provisioned",
                            status="discovered" if not mail_dom_exists else "active"
                        )
                        db.add(md)
                        synced_domains += 1
                    else:
                        if md.zone_id != zone["id"]:
                            md.zone_id = zone["id"]
                        if md.cloudflare_account_id != account_id:
                            md.cloudflare_account_id = account_id
                        md.credential_id_last_used = cred.id
                        if mail_dom_exists and md.status == "discovered":
                            md.status = "active"
                            md.source = "provisioned"
                        
                    db.flush()

            except Exception as e:
                logger.exception(f"Error syncing credentials for {cred.label}: {e}")
                errors.append(f"{cred.label}: {str(e)}")

        db.commit()
        return {
            "synced_accounts": synced_accounts,
            "synced_domains": synced_domains,
            "errors": errors
        }

    def _get_cf_service_for_account(self, db: Session, cloudflare_account_id: str) -> Optional[CloudflareService]:
        """Find any healthy credential linked to this account and return a CloudflareService instance."""
        links = db.query(CloudflareCredentialAccount).filter(
            CloudflareCredentialAccount.cloudflare_account_id == cloudflare_account_id
        ).all()
        
        for link in links:
            cred = db.query(EncryptedCloudflareCredential).filter(EncryptedCloudflareCredential.id == link.credential_id).first()
            if cred:
                decrypted_key = cred.get_api_key()
                if decrypted_key:
                    if len(decrypted_key) > 37 or '-' in decrypted_key:
                        return CloudflareService(api_token=decrypted_key)
                    else:
                        return CloudflareService(email=cred.email, api_key=decrypted_key)
        return None

    def resolve_or_allocate_primary(self, db: Session, cloudflare_account_id: str, fallback_domain: str = None, cf_override: Optional[CloudflareService] = None) -> Optional[CloudflareWebmailPrimary]:
        """
        Resolve the active webmail primary for a Cloudflare account.
        If none exists, allocate/promote one (using fallback_domain or discovery).
        """
        primary = db.query(CloudflareWebmailPrimary).filter(
            CloudflareWebmailPrimary.cloudflare_account_id == cloudflare_account_id,
            CloudflareWebmailPrimary.status == "active"
        ).first()

        if primary:
            return primary

        # No active primary. Let's allocate one.
        return self.promote_new_primary(db, cloudflare_account_id, fallback_domain, cf_override=cf_override)

    def promote_new_primary(self, db: Session, cloudflare_account_id: str, replacement_domain: str = None, cf_override: Optional[CloudflareService] = None) -> Optional[CloudflareWebmailPrimary]:
        """
        Promote a managed domain in the Cloudflare account to be the webmail primary.
        Creates A/AAAA records on the primary domain and registers it in DB.
        """
        if not cloudflare_account_id:
            logger.error("Cannot promote webmail primary without a Cloudflare account ID")
            return None

        logger.info(f"Promoting new webmail primary for account: {cloudflare_account_id}")
        
        # 1. Select candidate domain
        candidate = None
        if replacement_domain:
            candidate = db.query(ManagedDomain).filter(
                ManagedDomain.domain == replacement_domain,
                ManagedDomain.cloudflare_account_id == cloudflare_account_id
            ).first()

        if not candidate:
            # Candidate selection order:
            # - Active managed domains in the same account
            # - Sorted by oldest (lowest ID / created_at)
            candidates = db.query(ManagedDomain).filter(
                ManagedDomain.cloudflare_account_id == cloudflare_account_id,
                ManagedDomain.status.in_(["active", "managed", "provisioning"])
            ).order_by(ManagedDomain.id.asc()).all()
            
            if candidates:
                candidate = candidates[0]

        if not candidate:
            logger.error(f"No suitable primary candidate found for Cloudflare account: {cloudflare_account_id}")
            return None

        cf = cf_override or self._get_cf_service_for_account(db, cloudflare_account_id)
        if not cf:
            logger.error(f"No valid Cloudflare credentials found to configure primary for account {cloudflare_account_id}")
            return None

        # Build primary records
        primary_domain = candidate.domain
        primary_zone_id = candidate.zone_id
        primary_hostname = f"webmail-origin.{primary_domain}"

        # 2. Add DNS A and AAAA records under primary domain
        logger.info(f"Creating primary A/AAAA records for {primary_hostname} in zone {primary_zone_id}")
        ipv4_record = {
            "type": "A",
            "name": primary_hostname,
            "content": self.MAIL_SERVER_IP,
            "proxied": True,
            "ttl": 1
        }
        ipv6_record = {
            "type": "AAAA",
            "name": primary_hostname,
            "content": self.MAIL_SERVER_IPV6,
            "proxied": True,
            "ttl": 1
        }

        # Clear existing webmail-origin record to avoid conflicts
        try:
            records = cf.list_dns_records(primary_zone_id)
            for r in records:
                if r["name"] == primary_hostname:
                    cf.delete_dns_record(primary_zone_id, r["id"])
        except Exception:
            pass

        # Create new DNS records
        ipv4_id = None
        ipv6_id = None

        url = f"{cf.API_URL}/zones/{primary_zone_id}/dns_records"
        try:
            # Create A record
            resp = requests.post(url, headers=cf.headers, json=ipv4_record)
            if resp.status_code in (200, 201):
                data = resp.json()
                if data.get("success"):
                    ipv4_id = data.get("result", {}).get("id")
                else:
                    logger.error(f"Failed to create primary A record: {data}")
            else:
                logger.error(f"Failed to create primary A record. HTTP {resp.status_code}: {resp.text}")
            
            # Create AAAA record
            resp_v6 = requests.post(url, headers=cf.headers, json=ipv6_record)
            if resp_v6.status_code in (200, 201):
                data_v6 = resp_v6.json()
                if data_v6.get("success"):
                    ipv6_id = data_v6.get("result", {}).get("id")
                else:
                    logger.error(f"Failed to create primary AAAA record: {data_v6}")
            else:
                logger.error(f"Failed to create primary AAAA record. HTTP {resp_v6.status_code}: {resp_v6.text}")

            if not ipv4_id and not ipv6_id:
                logger.error(f"No primary DNS records were created for {primary_hostname}")
                return None
        except Exception as e:
            logger.exception(f"Failed to create primary DNS records: {e}")
            return None

        # 3. Create or update CloudflareWebmailPrimary DB record
        primary = db.query(CloudflareWebmailPrimary).filter(
            CloudflareWebmailPrimary.cloudflare_account_id == cloudflare_account_id
        ).first()

        if not primary:
            primary = CloudflareWebmailPrimary(cloudflare_account_id=cloudflare_account_id)
            db.add(primary)

        primary.primary_domain = primary_domain
        primary.primary_zone_id = primary_zone_id
        primary.primary_hostname = primary_hostname
        primary.ipv4_record_id = ipv4_id
        primary.ipv6_record_id = ipv6_id
        primary.status = "active"
        primary.auto_promote_enabled = True
        primary.auto_repair_dns_enabled = True
        
        db.commit()
        logger.info(f"Successfully promoted {primary_domain} as the primary for account {cloudflare_account_id}")
        return primary
