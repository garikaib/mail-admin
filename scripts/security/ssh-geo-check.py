#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import urllib.error

import time

# Fail-Open helper
def allow_login(reason=""):
    if reason:
        # Prevent duplicate outputs on multiple PAM invocations for the same SSH process connection
        ppid = os.getppid()
        state_file = f"/tmp/.ssh_geo_ppid_{ppid}.tmp"
        
        suppressed = False
        try:
            if os.path.exists(state_file):
                suppressed = True
            else:
                with open(state_file, "w") as f:
                    f.write("1")
        except Exception:
            pass

        if not suppressed:
            # Clean up the reason to look cleaner in console
            clean_reason = reason.replace("GeoIP Resolution Failure Bypass (Fail-Open)", "Bypassed (Fail-Open)")
            print(f"GeoIP: {clean_reason}", file=sys.stderr)
    sys.exit(0)

def deny_login(reason=""):
    if reason:
        print(f"GeoIP Blocked: {reason}", file=sys.stderr)
    sys.exit(1)

def main():
    # 1. Retrieve PAM environment variables
    username = os.environ.get("PAM_USER")
    remote_ip = os.environ.get("PAM_RHOST")

    # If execution context is not PAM, or variables are missing, fail open
    if not username or not remote_ip:
        allow_login("Missing PAM environment variables")

    # 2. Local network and loopback bypass
    # Safeguard to prevent locking out local administration if the backend is down
    if remote_ip in ("127.0.0.1", "::1") or remote_ip.startswith("192.168.") or remote_ip.startswith("10."):
        allow_login("Local loopback / private IP network bypass")

    # 3. Query the FastAPI Geo Policy service
    # Default backend URL (using localhost loopback)
    api_url = os.environ.get("GEO_AUTH_API_URL", "http://127.0.0.1:8000/api/geo-auth/verify-ssh")
    
    payload = {
        "username": username,
        "remote_ip": remote_ip
    }
    
    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        api_url, 
        data=req_data, 
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        # Short timeout (3 seconds) to prevent blocking SSH connection path
        with urllib.request.urlopen(req, timeout=3) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            
            allowed = res_data.get("allowed", True)
            reason = res_data.get("reason", "")
            
            if allowed:
                allow_login(reason)
            else:
                deny_login(reason)

    except urllib.error.URLError as e:
        # Backend API is down or unreachable -> Fail-Open for security/emergency access
        allow_login(f"Connection to policy engine failed ({e}). Defaulting to Fail-Open.")
    except Exception as e:
        allow_login(f"Unexpected verification error ({e}). Defaulting to Fail-Open.")

if __name__ == "__main__":
    main()
