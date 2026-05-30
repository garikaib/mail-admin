import requests
import logging

logger = logging.getLogger(__name__)

class CloudflareTokenGenerator:
    """
    Uses a Global API Key to create zone-scoped API Tokens.
    """
    API_URL = "https://api.cloudflare.com/client/v4"
    
    # Permission Group IDs (fetched from CF, these are stable)
    # DNS:Edit permission for zone
    # Note: These IDs are constant across all CF accounts
    DNS_EDIT_PERMISSION = "4755a26eedb94da69e1066d98aa820be"
    
    # Zone:Read permission
    ZONE_READ_PERMISSION = "c8fed203ed3043cba015a93ad1616f1f"
    
    def __init__(self, email: str, global_api_key: str):
        self.headers = {
            "X-Auth-Email": email,
            "X-Auth-Key": global_api_key,
            "Content-Type": "application/json"
        }
        self.email = email
    
    def get_account_id(self) -> str:
        """Fetch the account ID for this user."""
        url = f"{self.API_URL}/accounts"
        logger.info(f"CF TokenGen GET: {url}")
        try:
            resp = requests.get(url, headers=self.headers)
            logger.info(f"CF TokenGen Response Status: {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            if data.get("success") and data.get("result"):
                account_id = data["result"][0]["id"]
                logger.debug(f"Fetched Account ID: {account_id}")
                return account_id
        except Exception as e:
            logger.exception(f"Failed to fetch CF Account ID: {e}")
        return None
    
    def get_zone_id(self, domain: str) -> str:
        """Fetch zone ID for the domain."""
        url = f"{self.API_URL}/zones?name={domain}"
        logger.info(f"CF TokenGen GET: {url}")
        try:
            resp = requests.get(url, headers=self.headers)
            logger.info(f"CF TokenGen Response Status: {resp.status_code}")
            data = resp.json()
            if data.get("success") and data.get("result"):
                zone_id = data["result"][0]["id"]
                logger.info(f"Found zone_id {zone_id} for {domain}")
                return zone_id
            else:
                logger.error(f"Failed to find zone for {domain}: {data}")
        except Exception as e:
            logger.exception(f"Failed to fetch CF Zone ID for {domain}: {e}")
        return None
    
    def create_zone_token(self, domain: str, zone_id: str, account_id: str) -> tuple[str, str]:
        """
        Create a zone-scoped API token for DNS editing.
        Returns: (token_id, token_secret)
        """
        url = f"{self.API_URL}/user/tokens"
        logger.info(f"CF TokenGen POST: {url} (Creating token for {domain})")
        
        # Policy: Allow editing DNS and reading Zone settings for THIS specific zone
        payload = {
            "name": f"Mail-Admin: {domain}",
            "policies": [
                {
                    "effect": "allow",
                    "resources": {
                        f"com.cloudflare.api.account.zone.{zone_id}": "*"
                    },
                    "permission_groups": [
                        {"id": self.DNS_EDIT_PERMISSION},
                        {"id": self.ZONE_READ_PERMISSION}
                    ]
                }
            ],
        }
        
        try:
            resp = requests.post(url, headers=self.headers, json=payload)
            logger.info(f"CF TokenGen Response Status: {resp.status_code}")
            data = resp.json()
            
            if data.get("success"):
                result = data["result"]
                logger.info(f"Successfully created zone token {result['id']} for {domain}")
                # result['value'] is the token secret (shown only once)
                return result["id"], result["value"]
            else:
                logger.error(f"Failed to create zone token for {domain}: {data}")
                return None, None
        except Exception as e:
            logger.exception(f"CF Token Creation Error for {domain}: {e}")
            return None, None
    
    def revoke_token(self, token_id: str) -> bool:
        """Revoke a previously issued token."""
        url = f"{self.API_URL}/user/tokens/{token_id}"
        logger.info(f"CF TokenGen DELETE: {url}")
        try:
            resp = requests.delete(url, headers=self.headers)
            logger.info(f"CF TokenGen Response Status: {resp.status_code}")
            success = resp.json().get("success", False)
            logger.info(f"Token revocation success: {success}")
            return success
        except Exception as e:
            logger.exception(f"Token Revocation Error for {token_id}: {e}")
            return False
