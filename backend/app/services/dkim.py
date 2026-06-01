import subprocess
from backend.app.core.sudo import run_sudo
import logging
import os
import re

logger = logging.getLogger(__name__)

class DKIMService:
    # Adjust paths based on server environment
    RSPAMD_CONFIG_DIR = "/etc/rspamd/local.d"
    DKIM_KEYS_DIR = "/var/lib/rspamd/dkim"
    
    def register_domain_in_rspamd(self, domain: str, selector: str, key_path: str):
        """Append domain signing configuration block to Rspamd dkim_signing.conf."""
        conf_path = os.path.join(self.RSPAMD_CONFIG_DIR, "dkim_signing.conf")
        if not os.path.exists(conf_path):
            logger.warning(f"Rspamd config {conf_path} not found. Skipping registration (Dev Mode).")
            return
            
        try:
            with open(conf_path, "r") as f:
                content = f.read()
                
            # Check if domain already exists in config
            if f"{domain} {{" in content or f'"{domain}" {{' in content:
                logger.info(f"Domain {domain} already exists in dkim_signing.conf")
                return
                
            idx = content.find("domain {")
            if idx == -1:
                logger.error("Could not find 'domain {' block in dkim_signing.conf")
                return
                
            brace_count = 0
            insert_idx = -1
            start_search = idx + len("domain {")
            for i in range(start_search, len(content)):
                if content[i] == '{':
                    brace_count += 1
                elif content[i] == '}':
                    if brace_count == 0:
                        insert_idx = i
                        break
                    else:
                        brace_count -= 1
                        
            if insert_idx == -1:
                logger.error("Could not find matching closing bracket for 'domain {' block")
                return
                
            entry = f"\n    {domain} {{\n        path = \"{key_path}\";\n        selector = \"{selector}\";\n    }}\n"
            new_content = content[:insert_idx] + entry + content[insert_idx:]
            
            run_sudo(["/usr/bin/tee", conf_path], input=new_content, text=True, check=True, capture_output=True)
            logger.info(f"Added {domain} to {conf_path} successfully")
            
            # Reload rspamd
            run_sudo(["/usr/bin/systemctl", "reload", "rspamd"], check=True, capture_output=True)
            logger.info("Reloaded rspamd service")
        except Exception as e:
            logger.exception(f"Failed to register domain in Rspamd: {e}")

    def unregister_domain_in_rspamd(self, domain: str):
        """Remove domain signing configuration block from Rspamd dkim_signing.conf."""
        conf_path = os.path.join(self.RSPAMD_CONFIG_DIR, "dkim_signing.conf")
        if not os.path.exists(conf_path):
            return
            
        try:
            with open(conf_path, "r") as f:
                content = f.read()
                
            start_pattern = f"    {domain} {{"
            idx = content.find(start_pattern)
            if idx == -1:
                start_pattern = f'"{domain}" {{'
                idx = content.find(start_pattern)
                if idx == -1:
                    return
                    
            end_idx = content.find("}", idx)
            if end_idx == -1:
                return
                
            block = content[idx:end_idx+1]
            new_content = content.replace(block, "")
            new_content = re.sub(r'\n\s*\n', '\n\n', new_content)
            
            run_sudo(["/usr/bin/tee", conf_path], input=new_content, text=True, check=True, capture_output=True)
            logger.info(f"Removed {domain} from {conf_path} successfully")
            
            # Reload rspamd
            run_sudo(["/usr/bin/systemctl", "reload", "rspamd"], check=True, capture_output=True)
            logger.info("Reloaded rspamd service")
        except Exception as e:
            logger.exception(f"Failed to unregister domain in Rspamd: {e}")

    def generate_dkim_key(self, domain: str) -> tuple[str, str]:
        """
        Generate a DKIM key pair for the domain using rspamadm.
        Returns: (selector, public_key_dns_value)
        """
        logger.info(f"[{domain}] Starting DKIM key generation...")
        # Safety check for local dev - mock if not on server
        if not os.path.exists("/usr/bin/rspamadm"):
            logger.warning(f"[{domain}] rspamadm not found. Returning mock DKIM key (Dev Mode).")
            return "mail", "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."

        selector = "mail" 
        key_dir = os.path.join(self.DKIM_KEYS_DIR, domain)
        
        # Ensure directory exists
        if not os.path.exists(key_dir):
            try:
                logger.info(f"[{domain}] Creating DKIM directory: {key_dir}")
                run_sudo(["/usr/bin/mkdir", "-p", key_dir], check=True, capture_output=True)
                run_sudo(["/usr/bin/chown", "-R", "_rspamd:_rspamd", self.DKIM_KEYS_DIR], check=False, capture_output=True) 
                run_sudo(["/usr/bin/chmod", "750", self.DKIM_KEYS_DIR], check=False, capture_output=True)
            except subprocess.CalledProcessError as e:
                logger.error(f"[{domain}] Failed to setup DKIM directory: {e.stderr}")
                return None, None
            except Exception as e:
                logger.exception(f"[{domain}] Unexpected error during DKIM dir setup: {e}")
                return None, None

        private_key_path = os.path.join(key_dir, f"{selector}.key")
        
        try:
            # 1. Generate Key
            logger.info(f"[{domain}] Generating 2048-bit RSA key for {domain} at {private_key_path}...")
            gen_resp = run_sudo([
                "/usr/bin/rspamadm", "dkim_keygen",
                "-s", selector,
                "-d", domain,
                "-k", private_key_path,
                "-b", "2048"
            ], check=True, capture_output=True, text=True)
            logger.debug(f"[{domain}] dkim_keygen stdout: {gen_resp.stdout}")
            
            # 2. Fix Permissions on the key file
            logger.info(f"[{domain}] Fixing key file permissions...")
            run_sudo(["/usr/bin/chown", "_rspamd:_rspamd", private_key_path], check=True, capture_output=True)
            run_sudo(["/usr/bin/chmod", "440", private_key_path], check=True, capture_output=True)
            logger.info(f"[{domain}] Key file permissions fixed.")

            # 3. Parse Public Key from rspamadm output. With -k, rspamadm writes
            # the private key to disk and prints the DNS TXT record to stdout.
            logger.info(f"[{domain}] Parsing public key from rspamadm output...")
            output = gen_resp.stdout.strip()
            logger.debug(f"[{domain}] dkim_keygen DNS output: {output}")
            quoted_parts = re.findall(r'"([^"]+)"', output)
            clean_value = "".join(part.strip() for part in quoted_parts)

            if clean_value.startswith("v=DKIM1;") and "p=" in clean_value:
                logger.info(f"[{domain}] Successfully extracted DKIM public key.")
                
                # Register in Rspamd config
                self.register_domain_in_rspamd(domain, selector, private_key_path)
                
                return selector, clean_value
            else:
                logger.error(f"[{domain}] Failed to parse DKIM output: {output}")
                return None, None

        except subprocess.CalledProcessError as e:
            logger.error(f"[{domain}] DKIM process failed (exit {e.returncode}): {e.stderr}")
            return None, None
        except Exception as e:
            logger.exception(f"[{domain}] Unexpected error during DKIM key generation: {e}")
            return None, None

    def remove_keys(self, domain: str) -> bool:
        """
        Remove DKIM keys and directory for a domain.
        """
        # Unregister from Rspamd first
        self.unregister_domain_in_rspamd(domain)
        
        key_dir = os.path.join(self.DKIM_KEYS_DIR, domain)
        logger.info(f"[{domain}] Removing DKIM keys at {key_dir}")
        
        if os.path.exists(key_dir):
            try:
                run_sudo(["/usr/bin/rm", "-rf", key_dir], check=True)
                logger.info(f"[{domain}] DKIM keys removed successfully.")
                return True
            except subprocess.CalledProcessError as e:
                logger.error(f"[{domain}] Failed to remove DKIM keys: {e}")
                return False
        else:
            logger.info(f"[{domain}] DKIM directory not found, skipping removal.")
            return True
