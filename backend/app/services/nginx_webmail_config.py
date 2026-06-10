import os
import logging
import subprocess
from backend.app.core.sudo import run_sudo

logger = logging.getLogger(__name__)

class NginxWebmailConfigService:
    DOMAINS_DIR = "/etc/nginx/webmail.d/domains"
    SNIPPET_PATH = "/etc/nginx/snippets/webmail-proxy.conf"

    SHARED_SNIPPET_CONTENT = """# SSL Protocols and Ciphers
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

root /usr/lib/GNUstep/SOGo/WebServer/SOGo;

location / {
    proxy_pass http://127.0.0.1:20000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
    proxy_set_header x-webobjects-server-protocol HTTP/1.0;
    proxy_set_header x-webobjects-remote-host $remote_addr;
    proxy_set_header x-webobjects-server-name $server_name;
    proxy_set_header x-webobjects-server-url https://$host;
    client_max_body_size 50m;
    client_body_buffer_size 128k;
}

location ^~ /SOGo/WebServerResources/ {
    alias /usr/lib/GNUstep/SOGo/WebServerResources/;
    allow all; expires max;
}

location ^~ /SOGo.woa/WebServerResources/ {
    alias /usr/lib/GNUstep/SOGo/WebServerResources/;
    allow all; expires max;
}
"""

    def ensure_shared_snippet(self) -> bool:
        """Ensure the shared webmail proxy snippet exists in nginx."""
        try:
            dirpath = os.path.dirname(self.SNIPPET_PATH)
            run_sudo(["/usr/bin/mkdir", "-p", dirpath], check=True)
            run_sudo(["/usr/bin/tee", self.SNIPPET_PATH], input=self.SHARED_SNIPPET_CONTENT, text=True, capture_output=True, check=True)
            logger.info("Shared nginx proxy snippet verified/created successfully.")
            return True
        except Exception as e:
            logger.error(f"Failed to ensure shared snippet: {e}")
            return False

    def generate_domain_config(self, domain: str) -> str:
        """Generate the domain-specific nginx config redirecting 80 to 443 and proxying 443 using the snippet."""
        pem_path = f"/etc/ssl/cloudflare-origin/{domain}.pem"
        key_path = f"/etc/ssl/cloudflare-origin/{domain}.key"
        
        config = f"""server {{
    listen 80;
    listen [::]:80;
    server_name webmail.{domain};
    return 301 https://$host$request_uri;
}}

server {{
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name webmail.{domain};

    ssl_certificate     {pem_path};
    ssl_certificate_key {key_path};

    include {self.SNIPPET_PATH};
}}
"""
        return config

    def validate_and_reload(self) -> bool:
        """Run nginx -t and reload nginx only if successful."""
        logger.info("Validating Nginx configuration...")
        try:
            # Check if nginx binary exists (dev-mode fallback)
            if not os.path.exists("/usr/sbin/nginx") and not os.path.exists("/usr/bin/nginx"):
                logger.warning("Nginx binary not found. Skipping validation and reload (Dev Mode).")
                return True
                
            run_sudo(["/usr/sbin/nginx", "-t"], check=True, capture_output=True)
            logger.info("Nginx configuration is valid. Reloading service...")
            run_sudo(["/usr/bin/systemctl", "reload", "nginx"], check=True, capture_output=True)
            logger.info("Nginx reloaded successfully.")
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Nginx validation/reload failed (Exit Code: {e.returncode}):")
            logger.error(f"Stderr: {e.stderr}")
            return False
        except Exception as e:
            logger.error(f"Nginx validation/reload failed with error: {e}")
            return False

    def deploy_config(self, domain: str) -> bool:
        """Write domain configuration and reload nginx if validation passes."""
        logger.info(f"Deploying Nginx config for webmail.{domain}")
        self.ensure_shared_snippet()
        
        config_content = self.generate_domain_config(domain)
        config_path = f"{self.DOMAINS_DIR}/{domain}.conf"
        
        try:
            run_sudo(["/usr/bin/mkdir", "-p", self.DOMAINS_DIR], check=True)
            run_sudo(["/usr/bin/tee", config_path], input=config_content, text=True, capture_output=True, check=True)
            
            # Try to validate and reload
            if not self.validate_and_reload():
                logger.error(f"Reload failed. Reverting configuration for {domain}")
                run_sudo(["/usr/bin/rm", "-f", config_path])
                self.validate_and_reload()
                return False
                
            return True
        except Exception as e:
            logger.error(f"Failed to deploy Nginx config for {domain}: {e}")
            return False

    def remove_config(self, domain: str) -> bool:
        """Remove domain config and reload nginx."""
        config_path = f"{self.DOMAINS_DIR}/{domain}.conf"
        try:
            if os.path.exists(config_path) or True: # Force check via rm -f
                run_sudo(["/usr/bin/rm", "-f", config_path], check=True)
            return self.validate_and_reload()
        except Exception as e:
            logger.error(f"Failed to remove Nginx config for {domain}: {e}")
            return False
