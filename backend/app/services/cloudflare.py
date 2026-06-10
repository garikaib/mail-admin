import requests
import logging

logger = logging.getLogger(__name__)

class CloudflareService:
    API_URL = "https://api.cloudflare.com/client/v4"
    
    # DNS Constants based on honeyscoop.co.zw pattern
    MAIL_SERVER_HOST = "mail.zimprices.co.zw"
    MAIL_SERVER_IP = "51.77.222.232"
    MAIL_SERVER_IPV6 = "2001:41d0:305:2100::8406"

    def __init__(self, email: str = None, api_key: str = None, api_token: str = None):
        """
        Initialize with either:
        - email + api_key (Global Key auth)
        - api_token (Zone Token auth - preferred)
        - api_key (Auto-detects if it's a Token or Global Key)
        """
        if api_token:
            self.headers = {
                "Authorization": f"Bearer {api_token.strip()}",
                "Content-Type": "application/json"
            }
            self.auth_type = "token"
            logger.debug(f"CloudflareService initialized with API Token (redacted).")
        elif api_key:
            api_key = api_key.strip()
            # Auto-detect if api_key is actually a token
            if len(api_key) > 37 or '-' in api_key:
                self.headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                self.auth_type = "token"
                logger.debug("CloudflareService initialized with API Token (passed as key).")
            else:
                self.headers = {
                    "X-Auth-Email": email.strip() if email else None,
                    "X-Auth-Key": api_key,
                    "Content-Type": "application/json"
                }
                self.auth_type = "global"
                logger.debug(f"CloudflareService initialized with Global Key for {email}.")
        else:
            self.headers = {}
            self.auth_type = "none"

    def _redact_headers(self, headers):
        """Return a copy of headers with sensitive keys redacted."""
        redacted = headers.copy()
        if "X-Auth-Key" in redacted:
            redacted["X-Auth-Key"] = "REDACTED"
        if "Authorization" in redacted:
            redacted["Authorization"] = "Bearer REDACTED"
        return redacted


    def list_zones(self, page: int = 1, per_page: int = 50) -> list[dict]:
        """List Cloudflare zones visible to this credential."""
        url = f"{self.API_URL}/zones"
        logger.info(f"CF API GET: {url} (page={page}, per_page={per_page})")
        try:
            resp = requests.get(url, headers=self.headers, params={"page": page, "per_page": per_page})
            logger.info(f"CF API Response Status: {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                logger.error(f"Failed to list zones: {data}")
                return []
            return data.get("result", [])
        except Exception as e:
            logger.exception(f"Cloudflare API Error (list_zones): {e}")
            return []

    def list_all_zones(self) -> list[dict]:
        """List all Cloudflare zones visible to this credential."""
        zones = []
        page = 1
        while True:
            batch = self.list_zones(page=page, per_page=50)
            zones.extend(batch)
            if len(batch) < 50:
                return zones
            page += 1

    def get_zone_id(self, domain: str) -> str:
        """Fetch zone ID for the domain."""
        url = f"{self.API_URL}/zones?name={domain}"
        logger.info(f"CF API GET: {url}")
        try:
            resp = requests.get(url, headers=self.headers)
            logger.info(f"CF API Response Status: {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            
            if not data.get("success") or not data.get("result"):
                logger.error(f"Failed to find zone for {domain}: {data}")
                return None
                
            zone_id = data["result"][0]["id"]
            logger.info(f"Found zone_id {zone_id} for {domain}")
            return zone_id
        except Exception as e:
            logger.exception(f"Cloudflare API Error (get_zone_id) for {domain}: {e}")
            raise

    def get_first_account_id(self) -> str:
        """Fetch the first account ID visible to these credentials."""
        url = f"{self.API_URL}/accounts"
        logger.info(f"CF API GET: {url}")
        try:
            resp = requests.get(url, headers=self.headers)
            logger.info(f"CF API Response Status: {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            if data.get("success") and data.get("result"):
                return data["result"][0]["id"]
        except Exception as e:
            logger.exception(f"Failed to fetch CF accounts: {e}")
        return None

    def create_zone(self, domain: str, account_id: str) -> dict:
        """Create a new zone in Cloudflare."""
        url = f"{self.API_URL}/zones"
        payload = {
            "name": domain,
            "account": {"id": account_id},
            "type": "full"
        }
        logger.info(f"CF API POST: {url} | payload: {payload}")
        try:
            resp = requests.post(url, headers=self.headers, json=payload)
            logger.info(f"CF API Response Status: {resp.status_code}")
            data = resp.json()
            if not data.get("success"):
                logger.error(f"Failed to create zone for {domain}: {data}")
                return None
            return data.get("result", {})
        except Exception as e:
            logger.exception(f"Cloudflare API Error (create_zone) for {domain}: {e}")
            return None

    def get_zone(self, zone_id: str) -> dict:
        """Fetch details for a specific zone, including nameservers."""
        url = f"{self.API_URL}/zones/{zone_id}"
        logger.info(f"CF API GET: {url}")
        try:
            resp = requests.get(url, headers=self.headers)
            logger.info(f"CF API Response Status: {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            if data.get("success"):
                return data.get("result", {})
        except Exception as e:
            logger.exception(f"Cloudflare API Error (get_zone) for {zone_id}: {e}")
        return None

    def create_dns_record(self, zone_id: str, record: dict) -> bool:
        """Create a single DNS record."""
        url = f"{self.API_URL}/zones/{zone_id}/dns_records"
        logger.info(f"CF API POST: {url} | Record: {record}")
        try:
            resp = requests.post(url, headers=self.headers, json=record)
            logger.info(f"CF API Response Status: {resp.status_code}")
            data = resp.json()
            
            if not data.get("success"):
                # Check if it's a "Record already exists" error (code 81053, 81057 etc)
                errors = data.get("errors", [])
                for err in errors:
                    if "already exists" in err.get("message", "").lower():
                        logger.info(f"Record {record['type']} {record['name']} already exists. Skipping.")
                        return True
                
                logger.error(f"Failed to create record {record}: {data}")
                return False
                
            logger.info(f"Successfully created {record['type']} record for {record['name']}")
            return True
        except Exception as e:
            logger.exception(f"Cloudflare API Error (create_dns_record) for {zone_id}: {e}")
            return False

    def get_default_mail_records(self, zone_id: str, domain: str, webmail_cname_target: str = None) -> list:
        """
        Build the default list of proposed DNS records for the domain.
        """
        # Query existing MX records to adjust priority dynamically
        existing_mx_records = []
        try:
            url = f"{self.API_URL}/zones/{zone_id}/dns_records"
            resp = requests.get(url, headers=self.headers, params={'type': 'MX', 'per_page': 100})
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    existing_mx_records = data.get("result", [])
        except Exception as e:
            logger.warning(f"Failed to query existing MX records (continuing with default priority 10): {e}")

        our_priority = 10
        if existing_mx_records:
            priorities = [rec.get("priority", 10) for rec in existing_mx_records]
            min_priority = min(priorities)
            
            if min_priority == 1:
                our_priority = 1
                for rec in existing_mx_records:
                    if rec.get("priority") == 1:
                        if rec.get("content") == self.MAIL_SERVER_HOST:
                            continue
                        
                        update_url = f"{self.API_URL}/zones/{zone_id}/dns_records/{rec['id']}"
                        logger.info(f"Demoting third-party MX record {rec['name']} at priority 1 to 10...")
                        try:
                            updated_body = {
                                "type": "MX",
                                "name": rec["name"],
                                "content": rec["content"],
                                "priority": 10,
                                "proxied": rec.get("proxied", False),
                                "ttl": rec.get("ttl", 3600)
                            }
                            resp_update = requests.put(update_url, headers=self.headers, json=updated_body)
                            logger.info(f"Demote response status: {resp_update.status_code}")
                        except Exception as update_err:
                            logger.exception(f"Failed to demote MX record: {update_err}")
            else:
                our_priority = max(1, min_priority - 2)

        cname_target = webmail_cname_target or self.MAIL_SERVER_HOST

        records = [
            # 1. MX Record -> mail.zimprices.co.zw
            {
                "type": "MX",
                "name": domain,
                "content": self.MAIL_SERVER_HOST,
                "priority": our_priority,
                "proxied": False,
                "ttl": 3600
            },
            # 2. SPF Record
            {
                "type": "TXT",
                "name": domain,
                "content": f"v=spf1 mx ip4:{self.MAIL_SERVER_IP} ip6:{self.MAIL_SERVER_IPV6} ~all",
                "proxied": False,
                "ttl": 3600
            },
            # 3. DMARC Record
            {
                "type": "TXT",
                "name": f"_dmarc.{domain}",
                "content": f"v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@{domain}",
                "proxied": False,
                "ttl": 3600
            },
            # 4. Webmail CNAME -> account-local duplicate to avoid Cloudflare 1014 cross-user CNAME blocks.
            {
                "type": "CNAME",
                "name": f"webmail.{domain}",
                "content": cname_target,
                "proxied": True, 
                "ttl": 1
            },
            # 5. A Record for mail subdomain (non-proxied)
            {
                "type": "A",
                "name": f"mail.{domain}",
                "content": self.MAIL_SERVER_IP,
                "proxied": False,
                "ttl": 3600
            },
            # 6. AAAA Record for mail subdomain (non-proxied)
            {
                "type": "AAAA",
                "name": f"mail.{domain}",
                "content": self.MAIL_SERVER_IPV6,
                "proxied": False,
                "ttl": 3600
            }
        ]
        return records

    def configure_mail_dns(self, zone_id: str, domain: str, webmail_cname_target: str = None) -> bool:
        """
        Configure all required mail records for the domain.
        Returns True if all records were processed successfully.
        """
        logger.info(f"Configuring standard mail DNS records for {domain} in zone {zone_id} with target {webmail_cname_target}")
        records = self.get_default_mail_records(zone_id, domain, webmail_cname_target=webmail_cname_target)
        success = True
        for rec in records:
            if not self.create_dns_record(zone_id, rec):
                logger.error(f"Stopped DNS configuration due to failure in {rec['type']} record for {rec['name']}")
                success = False
        
        logger.info(f"Finished standard mail DNS configuration for {domain}. Success: {success}")
        return success

    def add_dkim_record(self, zone_id: str, domain: str, selector: str, dkim_value: str) -> bool:
        """Create or update the DKIM TXT record so DNS matches the active key."""
        logger.info(f"Upserting DKIM TXT record for {domain} (selector: {selector})")
        record_name = f"{selector}._domainkey.{domain}"
        record = {
            "type": "TXT",
            "name": record_name,
            "content": dkim_value,
            "proxied": False,
            "ttl": 3600
        }

        try:
            url = f"{self.API_URL}/zones/{zone_id}/dns_records"
            resp = requests.get(url, headers=self.headers, params={"type": "TXT", "name": record_name, "per_page": 100})
            logger.info(f"CF DKIM lookup response status: {resp.status_code}")
            data = resp.json()
            if data.get("success") and data.get("result"):
                existing = data["result"][0]
                update_url = f"{url}/{existing['id']}"
                update_resp = requests.put(update_url, headers=self.headers, json=record)
                logger.info(f"CF DKIM update response status: {update_resp.status_code}")
                update_data = update_resp.json()
                if update_data.get("success"):
                    logger.info(f"Updated DKIM TXT record for {record_name}")
                    return True
                logger.error(f"Failed to update DKIM record {record_name}: {update_data}")
                return False
        except Exception as e:
            logger.exception(f"Cloudflare API Error (lookup/update DKIM) for {domain}: {e}")
            return False

        return self.create_dns_record(zone_id, record)

    def delete_mail_dns(self, zone_id: str, domain: str):
        """
        Delete mail-related DNS records (Rollback).
        This is a 'best effort' cleanup.
        """
        url = f"{self.API_URL}/zones/{zone_id}/dns_records"
        logger.info(f"Rollback: Fetching all DNS records for zone {zone_id} to identify deletions...")
        try:
            resp = requests.get(url, headers=self.headers, params={'per_page': 100})
            logger.info(f"CF API Response Status: {resp.status_code}")
            data = resp.json()
            
            if not data.get("success"):
                logger.error(f"Rollback: Failed to fetch DNS records: {data}")
                return
            
            for rec in data["result"]:
                # Check if this is one of our records
                should_delete = False
                
                # MX Check
                if rec["type"] == "MX" and rec["content"] == self.MAIL_SERVER_HOST:
                    should_delete = True
                
                # SPF Check (partial match)
                if rec["type"] == "TXT" and self.MAIL_SERVER_IP in rec["content"] and "v=spf1" in rec["content"]:
                    should_delete = True
                    
                # DMARC Check
                if rec["type"] == "TXT" and rec["name"].startswith("_dmarc"):
                    should_delete = True
                    
                # Webmail CNAME
                if rec["type"] == "CNAME" and rec["name"] == "webmail":
                    should_delete = True
                    
                # DKIM Check
                if rec["type"] == "TXT" and "_domainkey" in rec["name"]:
                    should_delete = True

                # A/AAAA check for mail.<domain>
                if rec["type"] in ("A", "AAAA") and rec["name"] == f"mail.{domain}":
                    should_delete = True

                if should_delete:
                    del_url = f"{self.API_URL}/zones/{zone_id}/dns_records/{rec['id']}"
                    logger.info(f"Rollback: DELETE {del_url} | {rec['type']} {rec['name']}")
                    del_resp = requests.delete(del_url, headers=self.headers)
                    logger.info(f"Rollback: Delete Status Code: {del_resp.status_code}")

        except Exception as e:
            logger.exception(f"Failed to rollback DNS for {domain} in zone {zone_id}: {e}")

    def get_zone(self, zone_id: str) -> dict:
        """Fetch details of a specific zone in Cloudflare."""
        url = f"{self.API_URL}/zones/{zone_id}"
        logger.info(f"CF API GET: {url}")
        try:
            resp = requests.get(url, headers=self.headers)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                logger.error(f"Failed to fetch zone details: {data}")
                return None
            return data.get("result", {})
        except Exception as e:
            logger.exception(f"Cloudflare API Error (get_zone) for zone {zone_id}: {e}")
            return None

    def list_dns_records(self, zone_id: str) -> list[dict]:
        """List DNS records for a given zone."""
        url = f"{self.API_URL}/zones/{zone_id}/dns_records"
        logger.info(f"CF API GET: {url}")
        try:
            resp = requests.get(url, headers=self.headers, params={"per_page": 100})
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                logger.error(f"Failed to list DNS records for zone {zone_id}: {data}")
                return []
            return data.get("result", [])
        except Exception as e:
            logger.exception(f"Cloudflare API Error (list_dns_records) for zone {zone_id}: {e}")
            return []

    def update_dns_record(self, zone_id: str, record_id: str, record: dict) -> bool:
        """Update an existing DNS record."""
        url = f"{self.API_URL}/zones/{zone_id}/dns_records/{record_id}"
        logger.info(f"CF API PUT: {url} | Record: {record}")
        try:
            resp = requests.put(url, headers=self.headers, json=record)
            data = resp.json()
            if not data.get("success"):
                logger.error(f"Failed to update DNS record {record_id} in zone {zone_id}: {data}")
                return False
            logger.info(f"Successfully updated DNS record {record_id} in zone {zone_id}")
            return True
        except Exception as e:
            logger.exception(f"Cloudflare API Error (update_dns_record) for record {record_id} in zone {zone_id}: {e}")
            return False

    def delete_dns_record(self, zone_id: str, record_id: str) -> bool:
        """Delete an existing DNS record."""
        url = f"{self.API_URL}/zones/{zone_id}/dns_records/{record_id}"
        logger.info(f"CF API DELETE: {url}")
        try:
            resp = requests.delete(url, headers=self.headers)
            data = resp.json()
            if not data.get("success"):
                logger.error(f"Failed to delete DNS record {record_id} in zone {zone_id}: {data}")
                return False
            logger.info(f"Successfully deleted DNS record {record_id} in zone {zone_id}")
            return True
        except Exception as e:
            logger.exception(f"Cloudflare API Error (delete_dns_record) for record {record_id} in zone {zone_id}: {e}")
            return False

