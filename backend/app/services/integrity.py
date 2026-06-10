import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict
from sqlalchemy.orm import Session
import requests

from backend.app.models import (
    CloudflareAccount,
    ManagedDomain,
    CloudflareWebmailPrimary,
    DomainTlsAsset,
    DomainZoneToken,
    EncryptedCloudflareCredential
)
from backend.app.services.cloudflare import CloudflareService
from backend.app.services.cloudflare_grouping_service import CloudflareGroupingService
from backend.app.services.cloudflare_origin_ca import CloudflareOriginCAService
from backend.app.services.nginx_webmail_config import NginxWebmailConfigService

logger = logging.getLogger(__name__)

class WebmailIntegrityWorker:
    def __init__(self):
        self.grouping_service = CloudflareGroupingService()
        self.nginx_service = NginxWebmailConfigService()

    def run_checks(self, db: Session, auto_repair: bool = False) -> List[dict]:
        """
        Run integrity checks across accounts, domains, DNS records, SSL/TLS, and Nginx.
        Optionally repair identified issues.
        Returns a list of warnings found.
        """
        logger.info(f"Running webmail integrity checks (auto_repair={auto_repair})...")
        warnings = []

        # 1. Fetch all managed domains
        managed_domains = db.query(ManagedDomain).filter(ManagedDomain.status.in_(["active", "managed", "provisioning"])).all()

        # Group domains by Cloudflare account for account-level checks
        domains_by_account = {}
        for md in managed_domains:
            acc_id = md.cloudflare_account_id
            if acc_id:
                domains_by_account.setdefault(acc_id, []).append(md)

        # 2. Check each Cloudflare account with managed domains
        for account_id, domains in domains_by_account.items():
            primary = db.query(CloudflareWebmailPrimary).filter(
                CloudflareWebmailPrimary.cloudflare_account_id == account_id
            ).first()

            if not primary or primary.status == "missing" or primary.status == "retired":
                warning = {
                    "severity": "high",
                    "cloudflare_account_id": account_id,
                    "affected_domains": [d.domain for d in domains],
                    "code": "missing_webmail_primary",
                    "message": f"Cloudflare account {account_id} is missing an active webmail primary.",
                    "recommended_fix": "Allocate/promote a webmail primary domain for this account.",
                    "auto_fix_eligible": True
                }
                warnings.append(warning)

                if auto_repair:
                    logger.info(f"Auto-repair: Promoting new primary for account {account_id}")
                    primary = self.grouping_service.promote_new_primary(db, account_id)

            # If primary domain is gone from DB/retired
            if primary:
                primary_domain_record = db.query(ManagedDomain).filter(
                    ManagedDomain.domain == primary.primary_domain
                ).first()
                if not primary_domain_record or primary_domain_record.status == "retired":
                    warning = {
                        "severity": "high",
                        "cloudflare_account_id": account_id,
                        "affected_domains": [d.domain for d in domains],
                        "code": "primary_domain_retired",
                        "message": f"Primary domain {primary.primary_domain} is retired or missing.",
                        "recommended_fix": "Promote a new primary domain for this account.",
                        "auto_fix_eligible": True
                    }
                    warnings.append(warning)

                    if auto_repair:
                        logger.info(f"Auto-repair: Primary domain retired, promoting new primary for account {account_id}")
                        primary = self.grouping_service.promote_new_primary(db, account_id)

        # 3. Check individual domains
        for md in managed_domains:
            domain = md.domain
            account_id = md.cloudflare_account_id
            zone_id = md.zone_id

            if not account_id or not zone_id:
                continue

            cf = self.grouping_service._get_cf_service_for_account(db, account_id)
            if not cf:
                logger.warning(f"No credentials found for account {account_id}, skipping Cloudflare DNS/SSL checks for {domain}.")
                continue

            # Resolve current active primary for the account
            primary = db.query(CloudflareWebmailPrimary).filter(
                CloudflareWebmailPrimary.cloudflare_account_id == account_id,
                CloudflareWebmailPrimary.status == "active"
            ).first()

            # A. Check CNAME and DNS targets
            if primary:
                webmail_cname = f"webmail.{domain}"
                correct_target = primary.primary_hostname
                
                try:
                    records = cf.list_dns_records(zone_id)
                    cname_record = None
                    for r in records:
                        if r["type"] == "CNAME" and r["name"] == webmail_cname:
                            cname_record = r
                            break

                    if not cname_record:
                        warning = {
                            "severity": "medium",
                            "cloudflare_account_id": account_id,
                            "affected_domains": [domain],
                            "code": "missing_webmail_cname",
                            "message": f"Missing CNAME record for webmail.{domain}.",
                            "recommended_fix": f"Create webmail.{domain} CNAME pointing to {correct_target}.",
                            "auto_fix_eligible": True
                        }
                        warnings.append(warning)

                        if auto_repair:
                            logger.info(f"Auto-repair: Creating webmail CNAME for {domain}")
                            cf.create_dns_record(zone_id, {
                                "type": "CNAME",
                                "name": webmail_cname,
                                "content": correct_target,
                                "proxied": True,
                                "ttl": 1
                            })
                    else:
                        cname_target = cname_record.get("content", "").strip().lower()
                        if cname_target != correct_target.strip().lower():
                            is_cross_account = False
                            # Detect if target belongs to a different primary domain in another account
                            target_domain = cname_target.replace("webmail-origin.", "")
                            target_md = db.query(ManagedDomain).filter(ManagedDomain.domain == target_domain).first()
                            if target_md and target_md.cloudflare_account_id != account_id:
                                is_cross_account = True

                            code = "cross_account_cname" if is_cross_account else "incorrect_cname_target"
                            msg = f"Webmail CNAME for {domain} points across Cloudflare accounts." if is_cross_account else f"Webmail CNAME for {domain} points to non-primary target."
                            
                            warning = {
                                "severity": "high" if is_cross_account else "medium",
                                "cloudflare_account_id": account_id,
                                "affected_domains": [domain],
                                "code": code,
                                "message": msg,
                                "recommended_fix": f"Update webmail.{domain} CNAME to point to {correct_target}.",
                                "auto_fix_eligible": True
                            }
                            warnings.append(warning)

                            if auto_repair:
                                logger.info(f"Auto-repair: Correcting webmail CNAME target for {domain}")
                                cf.update_dns_record(zone_id, cname_record["id"], {
                                    "type": "CNAME",
                                    "name": webmail_cname,
                                    "content": correct_target,
                                    "proxied": True,
                                    "ttl": 1
                                })

                except Exception as dns_err:
                    logger.error(f"Error checking DNS for {domain}: {dns_err}")

            # B. Check wildcard Origin CA cert presence and expiry
            cert_path = f"/etc/ssl/cloudflare-origin/{domain}.pem"
            key_path = f"/etc/ssl/cloudflare-origin/{domain}.key"
            legacy_cert_path = f"/etc/lego/certificates/{domain}.crt"
            legacy_key_path = f"/etc/lego/certificates/{domain}.key"
            legacy_config_paths = [
                f"/etc/nginx/sites-available/webmail.{domain}.conf",
                f"/etc/nginx/sites-enabled/webmail.{domain}.conf",
            ]
            asset = db.query(DomainTlsAsset).filter(DomainTlsAsset.domain == domain).first()

            has_origin_cert = os.path.exists(cert_path) and os.path.exists(key_path) and asset
            has_legacy_cert = (os.path.exists(legacy_cert_path) and os.path.exists(legacy_key_path)) or any(os.path.exists(path) for path in legacy_config_paths)
            cert_missing = not (has_origin_cert or has_legacy_cert)
            cert_expired = False
            cert_expiring_soon = False

            if has_origin_cert and asset:
                if asset.expires_at:
                    if asset.expires_at < datetime.utcnow():
                        cert_expired = True
                    elif asset.expires_at < datetime.utcnow() + timedelta(days=30):
                        cert_expiring_soon = True

            if cert_missing or cert_expired or cert_expiring_soon:
                code = "missing_origin_cert"
                msg = f"Missing wildcard Origin CA certificate for {domain}."
                if cert_expired:
                    code = "expired_origin_cert"
                    msg = f"Expired wildcard Origin CA certificate for {domain}."
                elif cert_expiring_soon:
                    code = "expiring_origin_cert"
                    msg = f"Wildcard Origin CA certificate for {domain} is expiring soon."

                warning = {
                    "severity": "high" if (cert_missing or cert_expired) else "medium",
                    "cloudflare_account_id": account_id,
                    "affected_domains": [domain],
                    "code": code,
                    "message": msg,
                    "recommended_fix": "Generate and deploy a new wildcard Cloudflare Origin CA certificate.",
                    "auto_fix_eligible": True
                }
                warnings.append(warning)

                if auto_repair:
                    logger.info(f"Auto-repair: Re-generating Origin CA certificate for {domain}")
                    origin_ca = CloudflareOriginCAService(
                        email=cf.headers.get("X-Auth-Email"),
                        api_key=cf.headers.get("X-Auth-Key"),
                        api_token=cf.headers.get("Authorization", "").replace("Bearer ", "").strip() if "Authorization" in cf.headers else None
                    )
                    origin_ca.deploy_origin_certificate(db, domain, cloudflare_account_id=account_id)

            # C. Check Nginx config presence
            config_path = f"{self.nginx_service.DOMAINS_DIR}/{domain}.conf"
            legacy_config_paths = [
                f"/etc/nginx/sites-available/webmail.{domain}.conf",
                f"/etc/nginx/sites-enabled/webmail.{domain}.conf",
            ]
            has_nginx_config = os.path.exists(config_path) or any(os.path.exists(path) for path in legacy_config_paths)
            if not has_nginx_config:
                warning = {
                    "severity": "high",
                    "cloudflare_account_id": account_id,
                    "affected_domains": [domain],
                    "code": "missing_nginx_config",
                    "message": f"Missing Nginx server configuration block for webmail.{domain}.",
                    "recommended_fix": f"Deploy webmail Nginx server block config to {config_path}.",
                    "auto_fix_eligible": True
                }
                warnings.append(warning)

                if auto_repair:
                    logger.info(f"Auto-repair: Deploying missing Nginx config for {domain}")
                    self.nginx_service.deploy_config(domain)

            # D. Cloudflare SSL/TLS mode check (should be strict)
            try:
                url = f"{cf.API_URL}/zones/{zone_id}/settings/ssl"
                resp = requests.get(url, headers=cf.headers)
                if resp.status_code == 200:
                    ssl_mode = resp.json().get("result", {}).get("value")
                    if ssl_mode != "strict":
                        warning = {
                            "severity": "high",
                            "cloudflare_account_id": account_id,
                            "affected_domains": [domain],
                            "code": "ssl_mode_not_strict",
                            "message": f"Cloudflare SSL/TLS mode is '{ssl_mode}' (expected 'Full (strict)').",
                            "recommended_fix": "Set Cloudflare SSL/TLS setting to Full (strict).",
                            "auto_fix_eligible": True
                        }
                        warnings.append(warning)

                        if auto_repair:
                            logger.info(f"Auto-repair: Setting Cloudflare SSL mode to strict for {domain}")
                            patch_url = f"{cf.API_URL}/zones/{zone_id}/settings/ssl"
                            requests.patch(patch_url, headers=cf.headers, json={"value": "strict"})
            except Exception as ssl_err:
                logger.error(f"Error checking SSL mode for {domain}: {ssl_err}")

        # E. Validate Nginx config globally
        if not self.nginx_service.validate_and_reload():
            warning = {
                "severity": "critical",
                "cloudflare_account_id": None,
                "affected_domains": [d.domain for d in managed_domains],
                "code": "failed_nginx_validation",
                "message": "Nginx global configuration validation failed.",
                "recommended_fix": "Run nginx -t and fix syntax errors.",
                "auto_fix_eligible": False
            }
            warnings.append(warning)

        # F. If auto-repair is disabled while repairable warnings exist
        has_repairable = any(w["auto_fix_eligible"] for w in warnings)
        if not auto_repair and has_repairable:
            warnings.append({
                "severity": "medium",
                "cloudflare_account_id": None,
                "affected_domains": [],
                "code": "auto_repair_disabled",
                "message": "Auto-repair is disabled while repairable issues exist.",
                "recommended_fix": "Enable auto-repair or execute manual repair actions.",
                "auto_fix_eligible": False
            })

        return warnings
