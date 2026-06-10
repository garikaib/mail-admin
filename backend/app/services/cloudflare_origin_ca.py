import os
import requests
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from backend.app.core.sudo import run_sudo
from backend.app.models import DomainTlsAsset

logger = logging.getLogger(__name__)

class CloudflareOriginCAService:
    API_URL = "https://api.cloudflare.com/client/v4"

    def __init__(self, email: str = None, api_key: str = None, api_token: str = None):
        """
        Initialize Cloudflare Origin CA service with either:
        - email + api_key (Global Key / Origin CA API access)
        - api_token (Zone Token)
        """
        self.headers = {}
        if api_token:
            self.headers["Authorization"] = f"Bearer {api_token.strip()}"
        elif api_key:
            api_key = api_key.strip()
            if len(api_key) > 37 or '-' in api_key:
                self.headers["Authorization"] = f"Bearer {api_key}"
            else:
                self.headers["X-Auth-Email"] = email.strip() if email else ""
                self.headers["X-Auth-Key"] = api_key
        self.headers["Content-Type"] = "application/json"

    def generate_key_and_csr(self, domain: str) -> tuple[str, str]:
        """Generate a 2048-bit RSA Private Key and CSR for domain + wildcard."""
        logger.info(f"Generating private key and CSR for domain: {domain}")
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        
        csr = x509.CertificateSigningRequestBuilder().subject_name(x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, f"*.{domain}"),
        ])).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName(domain),
                x509.DNSName(f"*.{domain}"),
            ]),
            critical=False,
        ).sign(private_key, hashes.SHA256())
        
        key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ).decode('utf-8')
        
        csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode('utf-8')
        return key_pem, csr_pem

    def request_origin_certificate(self, domain: str, csr_pem: str, validity_days: int = 5475) -> dict:
        """Call Cloudflare API to issue an Origin CA certificate."""
        url = f"{self.API_URL}/certificates"
        payload = {
            "hostnames": [domain, f"*.{domain}"],
            "requested_validity": validity_days,
            "request_type": "origin-rsa",
            "csr": csr_pem
        }
        
        logger.info(f"POST {url} for domain {domain}")
        try:
            resp = requests.post(url, headers=self.headers, json=payload)
            logger.info(f"Cloudflare certificates response status: {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                logger.error(f"Failed to obtain Origin CA certificate: {data}")
                return None
            return data.get("result", {})
        except Exception as e:
            logger.exception(f"Error requesting Origin CA certificate: {e}")
            return None

    def write_file_via_sudo(self, filepath: str, content: str) -> bool:
        """Helper to write file content securely using sudo tee."""
        try:
            dirpath = os.path.dirname(filepath)
            run_sudo(["/usr/bin/mkdir", "-p", dirpath], check=True)
            run_sudo(["/usr/bin/tee", filepath], input=content, text=True, capture_output=True, check=True)
            run_sudo(["/usr/bin/chmod", "0600", filepath], check=True)
            return True
        except Exception as e:
            logger.error(f"Failed to write file {filepath} via sudo: {e}")
            return False

    def deploy_origin_certificate(self, db: Session, domain: str, cloudflare_account_id: str = None) -> bool:
        """
        Full certificate provisioning:
        1. Generate private key & CSR.
        2. Post CSR to Cloudflare.
        3. Save PEM & KEY to /etc/ssl/cloudflare-origin/.
        4. Record or update DomainTlsAsset in DB.
        """
        logger.info(f"Deploying Cloudflare Origin CA certificate for {domain}")
        cert_path = f"/etc/ssl/cloudflare-origin/{domain}.pem"
        key_path = f"/etc/ssl/cloudflare-origin/{domain}.key"

        # Check if assets exist and are still valid
        asset = db.query(DomainTlsAsset).filter(DomainTlsAsset.domain == domain).first()
        if asset and os.path.exists(cert_path) and os.path.exists(key_path):
            if asset.expires_at and asset.expires_at > datetime.utcnow():
                logger.info(f"Valid Origin CA certificate already deployed for {domain}")
                return True

        key_pem, csr_pem = self.generate_key_and_csr(domain)
        result = self.request_origin_certificate(domain, csr_pem)
        if not result:
            logger.error(f"Could not request Origin CA certificate for {domain}")
            return False

        cert_pem = result.get("certificate")
        cert_id = result.get("id")
        expires_on_str = result.get("expires_on")
        
        # Parse expiry date
        expires_at = None
        if expires_on_str:
            try:
                # Format: "2036-01-01T00:00:00Z"
                expires_at = datetime.strptime(expires_on_str.replace("Z", ""), "%Y-%m-%dT%H:%M:%S")
            except Exception:
                logger.warning(f"Failed to parse expiry date string: {expires_on_str}")

        # Write to filesystem
        if not self.write_file_via_sudo(cert_path, cert_pem):
            return False
        if not self.write_file_via_sudo(key_path, key_pem):
            # Cleanup cert
            run_sudo(["/usr/bin/rm", "-f", cert_path])
            return False

        # Store in DB
        if not asset:
            asset = DomainTlsAsset(domain=domain)
            db.add(asset)

        asset.cloudflare_account_id = cloudflare_account_id
        asset.origin_cert_id = cert_id
        asset.cert_path = cert_path
        asset.key_path = key_path
        asset.covers_wildcard = True
        asset.expires_at = expires_at
        asset.status = "active"
        
        db.commit()
        logger.info(f"Successfully deployed Origin CA certificate and saved to DB for {domain}")
        return True

    def remove_certificate_files(self, domain: str) -> bool:
        """Remove certificate and key files from filesystem (Rollback/Delete)."""
        cert_path = f"/etc/ssl/cloudflare-origin/{domain}.pem"
        key_path = f"/etc/ssl/cloudflare-origin/{domain}.key"
        try:
            run_sudo(["/usr/bin/rm", "-f", cert_path], check=True)
            run_sudo(["/usr/bin/rm", "-f", key_path], check=True)
            logger.info(f"Removed Origin CA cert files for {domain}")
            return True
        except Exception as e:
            logger.error(f"Failed to remove Origin CA files for {domain}: {e}")
            return False
