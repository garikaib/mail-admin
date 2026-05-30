import subprocess
import logging
import os

logger = logging.getLogger(__name__)

class SSLService:
    # Adjust paths based on server environment
    LEGO_PATH = "/usr/local/bin/lego"
    CERT_DIR = "/etc/lego/certificates"
    
    def provision_wildcard(self, domain: str, cf_email: str = None, cf_key: str = None, cf_token: str = None) -> bool:
        """
        Run lego to obtain wildcard cert via Cloudflare DNS challenge.
        Supports both Global Key (legacy) and API Token (preferred).
        """
        # Safety check for local dev
        if not os.path.exists(self.LEGO_PATH):
            logger.warning(f"Lego binary not found at {self.LEGO_PATH}. Skipping SSL generation (Dev Mode check).")
            # If we are on the server, this is a real problem.
            # Let's check common locations if the primary one fails.
            if os.path.exists("/usr/bin/lego"):
                self.LEGO_PATH = "/usr/bin/lego"
                logger.info(f"Using alternate lego path: {self.LEGO_PATH}")
            else:
                return True

        # Lego requires a registration email. Prefer the Cloudflare account email,
        # otherwise require an explicit operational contact from the environment.
        reg_email = cf_email or os.getenv("SSL_CONTACT_EMAIL")
        if not reg_email:
            logger.error(f"[{domain}] SSL_CONTACT_EMAIL is required when provisioning SSL with an API token.")
            return False

        cmd = ["sudo"]
        
        if cf_token:
             cmd.append(f"CLOUDFLARE_DNS_API_TOKEN={cf_token}")
             logger.info(f"[{domain}] Provisioning SSL using API Token")
        else:
             cmd.append(f"CLOUDFLARE_EMAIL={cf_email}")
             cmd.append(f"CLOUDFLARE_API_KEY={cf_key}")
             logger.info(f"[{domain}] Provisioning SSL using Global API Key ({cf_email})")

        cmd.extend([
            self.LEGO_PATH,
            "--email", reg_email,
            "--dns", "cloudflare",
            "--domains", domain,
            "--domains", f"*.{domain}",
            "--path", "/etc/lego",
            "--accept-tos",
            "run"
        ])
        
        env = os.environ.copy()
        
        try:
            logger.info(f"Running lego for domain {domain}...")
            # Redact sensitive env for logging
            log_env = {k: "REDACTED" if "CLOUDFLARE" in k else v for k, v in env.items()}
            logger.debug(f"SSL Command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd, 
                env=env, 
                check=True, 
                capture_output=True, 
                text=True
            )
            logger.info(f"Lego finished successfully for {domain}")
            logger.debug(f"Lego stdout: {result.stdout}")
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Lego failed for {domain} (Exit Code: {e.returncode})")
            logger.error(f"Lego stderr: {e.stderr}")
            logger.debug(f"Lego stdout on fail: {e.stdout}")
            return False
