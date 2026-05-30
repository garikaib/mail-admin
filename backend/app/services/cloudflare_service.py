"""Cloudflare API integration for domain registration."""
import socket
import requests
import logging
import time

logger = logging.getLogger(__name__)

API_URL = "https://api.cloudflare.com/client/v4"


def get_headers(email: str, api_key: str) -> dict:
    """Get auth headers for Cloudflare API. Supports Global Key and API Tokens."""
    email = email.strip()
    api_key = api_key.strip()
    
    # Global API Key is 37 characters (hex). 
    # API tokens are usually longer (around 40 chars) and contain mixed chars.
    # If the user provides an API Token but provides email, we should prefer Authorization header.
    if len(api_key) > 37 or '-' in api_key:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    return {
        "X-Auth-Email": email,
        "X-Auth-Key": api_key,
        "Content-Type": "application/json"
    }


def resolve_ns_ip(hostname: str) -> str:
    """
    Resolve nameserver hostname to IPv4.
    Falls back to dig if socket fails.
    """
    try:
        return socket.gethostbyname(hostname)
    except Exception as e:
        logger.warning(f"Socket resolution failed for {hostname}: {e}. Trying dig...")
        try:
            import subprocess
            proc = subprocess.run(
                ['dig', '+short', hostname],
                capture_output=True,
                text=True,
                timeout=5
            )
            ip = proc.stdout.strip().split('\n')[0] # Take first result
            if ip:
                return ip
        except Exception as dig_e:
            logger.error(f"Dig resolution also failed for {hostname}: {dig_e}")
        
        return ""


def validate_credential(email: str, api_key: str) -> tuple[bool, str]:
    """Test if Cloudflare credentials are valid."""
    headers = get_headers(email, api_key)
    try:
        # Check user details endpoint
        response = requests.get(
            f"{API_URL}/user",
            headers=headers,
            timeout=10
        )
        data = response.json()
        if data.get('success'):
            return True, "Valid"
        else:
            error = data.get('errors', [{}])[0].get('message', 'Invalid credentials')
            return False, error
    except Exception as e:
        return False, str(e)


def add_domain_to_cloudflare(domain: str, cf_email: str, cf_key: str) -> dict:
    """
    Add domain to Cloudflare and return zone info with nameservers.
    Handles rate limiting and retries.
    """
    headers = get_headers(cf_email, cf_key)
    result = {
        'success': False,
        'zone_id': None,
        'ns1_hostname': None,
        'ns1_ip': None,
        'ns2_hostname': None,
        'ns2_ip': None,
        'error': None
    }
    
    retries = 3
    backoff = 1
    
    for attempt in range(retries):
        try:
            # Try to add zone
            response = requests.post(
                f"{API_URL}/zones",
                headers=headers,
                json={"name": domain, "jump_start": False, "type": "full"},
                timeout=30
            )
            data = response.json()
            
            if not data.get('success'):
                error_msg = data.get('errors', [{}])[0].get('message', 'Unknown error')
                
                # Handle "Zone already exists"
                if 'already exists' in error_msg.lower():
                    # Fetch existing zone
                    get_resp = requests.get(
                        f"{API_URL}/zones?name={domain}",
                        headers=headers,
                        timeout=30
                    )
                    get_data = get_resp.json()
                    if get_data.get('success') and get_data.get('result'):
                        zone_data = get_data['result'][0]
                    else:
                        result['error'] = f"Zone exists but could not fetch: {error_msg}"
                        return result
                
                # Handle Zone Limit
                elif 'maximum number of zones' in error_msg.lower():
                    result['error'] = "Cloudflare account has reached its zone limit (usually 50 for free accounts)."
                    return result
                    
                else:
                    # Retryable error?
                    if response.status_code >= 500:
                        raise requests.exceptions.ServerError(f"Status {response.status_code}")
                    
                    result['error'] = error_msg
                    return result
            else:
                zone_data = data['result']
            
            # Extract info
            result['zone_id'] = zone_data['id']
            ns_list = zone_data.get('name_servers', [])
            
            if len(ns_list) >= 1:
                result['ns1_hostname'] = ns_list[0]
                result['ns1_ip'] = resolve_ns_ip(ns_list[0])
            if len(ns_list) >= 2:
                result['ns2_hostname'] = ns_list[1]
                result['ns2_ip'] = resolve_ns_ip(ns_list[1])
            
            result['success'] = True
            return result
            
        except (requests.Timeout, requests.ConnectionError, requests.exceptions.ServerError) as e:
            if attempt < retries - 1:
                time.sleep(backoff)
                backoff *= 2
                continue
            else:
                result['error'] = f"Cloudflare API failed after retries: {str(e)}"
        except Exception as e:
            result['error'] = f"Unexpected error: {str(e)}"
            logger.exception(f"Cloudflare error for {domain}")
            break
    
    return result
