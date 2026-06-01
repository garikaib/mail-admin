import subprocess
from backend.app.core.sudo import run_sudo
import logging
import os

logger = logging.getLogger(__name__)

class NginxService:
    SITES_AVAILABLE = "/etc/nginx/sites-available"
    SITES_ENABLED = "/etc/nginx/sites-enabled"
    
    def generate_webmail_config(self, domain: str) -> str:
        """
        Generate Nginx config for webmail.{domain}.
        Assumes SOGo is running locally on port 20000.
        Based on pattern: server { server_name webmail.domain; ... }
        """
        # Check if wildcard file exists (if we have access, e.g. in dev/local).
        # Otherwise, default to domain (which is standard for lego run --domains domain --domains *.domain).
        wildcard_path = f"/etc/lego/certificates/_.{domain}.crt"
        selected_cert = domain
        if os.path.exists(wildcard_path):
            selected_cert = f"_.{domain}"
        else:
            selected_cert = domain

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

    ssl_certificate /etc/lego/certificates/{selected_cert}.crt;
    ssl_certificate_key /etc/lego/certificates/{selected_cert}.key;
    
    # SSL Protocols and Ciphers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    root /usr/lib/GNUstep/SOGo/WebServer/SOGo;

    location / {{
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
    }}

    location ^~ /SOGo/WebServerResources/ {{
        alias /usr/lib/GNUstep/SOGo/WebServerResources/;
        allow all; expires max;
    }}
    
    location ^~ /SOGo.woa/WebServerResources/ {{
        alias /usr/lib/GNUstep/SOGo/WebServerResources/;
        allow all; expires max;
    }}
}}
"""
        return config

    def deploy_config(self, domain: str) -> bool:
        """Write config file and enable it."""
        logger.info(f"[{domain}] Deploying Nginx config for webmail.{domain}")
        config_content = self.generate_webmail_config(domain)
        filename = f"webmail.{domain}"
        available_path = os.path.join(self.SITES_AVAILABLE, filename)
        enabled_path = os.path.join(self.SITES_ENABLED, filename)
        
        # Verify permissions/paths (Dev Mode check)
        if not os.path.exists(self.SITES_AVAILABLE):
            logger.warning(f"Nginx config dir {self.SITES_AVAILABLE} not found. Skipping Nginx deploy (Dev Mode).")
            return True

        try:
            # Write config using sudo tee
            logger.info(f"[{domain}] Writing config to {available_path}...")
            process = run_sudo(
                ["/usr/bin/tee", available_path],
                input=config_content,
                text=True,
                capture_output=True,
                check=True
            )
            logger.debug(f"[{domain}] tee output: {process.stdout}")
            
            # Link using sudo ln -sf to be completely idempotent
            logger.info(f"[{domain}] Creating/updating symlink at {enabled_path}...")
            run_sudo(
                ["/usr/bin/ln", "-sf", available_path, enabled_path],
                check=True,
                capture_output=True
            )
            
            return self.reload_nginx(domain)
        except subprocess.CalledProcessError as e:
            logger.error(f"[{domain}] Nginx deploy failed during subprocess: {e.stderr}")
            return False
        except Exception as e:
            logger.exception(f"[{domain}] Nginx deploy failed with unexpected error: {e}")
            return False

    def reload_nginx(self, domain: str = "system") -> bool:
        """Test and reload Nginx."""
        logger.info(f"[{domain}] Testing Nginx configuration (nginx -t)...")
        try:
            test_resp = run_sudo(["/usr/sbin/nginx", "-t"], check=True, capture_output=True, text=True)
            logger.info(f"[{domain}] Nginx test successful: {test_resp.stderr}")
            
            logger.info(f"[{domain}] Reloading Nginx service...")
            run_sudo(["/usr/bin/systemctl", "reload", "nginx"], check=True, capture_output=True)
            logger.info(f"[{domain}] Nginx reloaded successfully.")
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"[{domain}] Nginx config test/reload failed:")
            logger.error(f"[{domain}] Exit code: {e.returncode}")
            logger.error(f"[{domain}] Stderr: {e.stderr}")
            logger.error(f"[{domain}] Stdout: {e.stdout}")
            return False

    def remove_config(self, domain: str) -> bool:
        """Remove Nginx config (Rollback)."""
        logger.info(f"[{domain}] Rollback: Removing Nginx config for webmail.{domain}")
        filename = f"webmail.{domain}"
        available_path = os.path.join(self.SITES_AVAILABLE, filename)
        enabled_path = os.path.join(self.SITES_ENABLED, filename)
        
        try:
            # Remove link using -f to be safe against missing/broken symlinks
            logger.info(f"[{domain}] Rollback: Removing symlink {enabled_path}")
            run_sudo(["/usr/bin/rm", "-f", enabled_path], check=True)
                
            # Remove file using -f
            logger.info(f"[{domain}] Rollback: Removing file {available_path}")
            run_sudo(["/usr/bin/rm", "-f", available_path], check=True)
                
            self.reload_nginx(domain)
            return True
        except Exception as e:
            logger.exception(f"[{domain}] Failed to remove Nginx config: {e}")
            return False
