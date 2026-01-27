#!/usr/bin/env python3
"""Configure additional Rspamd security modules."""
import subprocess

CONFIGS = {
    "/etc/rspamd/local.d/groups.conf": '''# Custom score adjustments for better spam detection

group "rbl" {
    symbols {
        "RBL_SPAMHAUS_ZEN" { weight = 4.0; }
        "RBL_BARRACUDA" { weight = 3.0; }
        "RBL_SPAMCOP" { weight = 3.0; }
        "RBL_SORBS_DUL" { weight = 2.0; }
    }
}

group "spf" {
    symbols {
        "R_SPF_FAIL" { weight = 3.0; }
        "R_SPF_SOFTFAIL" { weight = 1.5; }
        "R_SPF_NEUTRAL" { weight = 0.5; }
    }
}

group "dkim" {
    symbols {
        "R_DKIM_REJECT" { weight = 3.0; }
    }
}

group "dmarc" {
    symbols {
        "DMARC_POLICY_REJECT" { weight = 5.0; }
        "DMARC_POLICY_QUARANTINE" { weight = 3.0; }
    }
}

group "phishing" {
    symbols {
        "PHISHING" { weight = 5.0; }
        "PHISHED_OPENPHISH" { weight = 7.0; }
        "PHISHED_PHISHTANK" { weight = 7.0; }
    }
}
''',
    "/etc/rspamd/local.d/greylist.conf": '''# Enable greylisting for suspicious emails
enabled = true;
expire = 1d;
timeout = 5m;
key_prefix = "gr_";
whitelisted_ip = [];
''',
    "/etc/rspamd/local.d/url_reputation.conf": '''# Enable URL reputation checking
enabled = true;
''',
    "/etc/rspamd/local.d/replies.conf": '''# Track replies to whitelist legitimate conversations
action = "no action";
expire = 7d;
''',
    "/etc/rspamd/local.d/mx_check.conf": '''# Check if sender domain has valid MX records
enabled = true;
expire = 1d;
''',
}

def main():
    for path, content in CONFIGS.items():
        with open(path, 'w') as f:
            f.write(content)
        print(f"✓ Created {path}")
    
    # Restart rspamd
    subprocess.run(["systemctl", "restart", "rspamd"], check=True)
    print("\n✅ Rspamd restarted with new security configurations!")

if __name__ == "__main__":
    main()
