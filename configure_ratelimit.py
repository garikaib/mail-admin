#!/usr/bin/env python3
"""Configure Rspamd rate limiting for small businesses."""

RATELIMIT_CONF = '''\
# Rate limiting for small business mail server
# Protects against abuse and brute force attacks

# Enable rate limiting
enabled = true;

# Use Redis for rate limit storage
backend = "redis";

# Rate limits for different scenarios
rates {
    # Authenticated users (your business users)
    # 50 emails per hour, 250 per day
    to = {
        bucket = [
            {
                burst = 10;
                rate = "50 / 1h";
            },
            {
                burst = 50;
                rate = "250 / 1d";
            }
        ];
    };
    
    # Per IP address limits (incoming mail)
    # 100 emails per hour from a single IP
    to_ip = {
        bucket = [
            {
                burst = 20;
                rate = "100 / 1h";
            }
        ];
    };
    
    # Sender domain limits
    # Prevents a single domain from flooding
    to_ip_from = {
        bucket = [
            {
                burst = 10;
                rate = "50 / 1h";
            }
        ];
    };
    
    # Bounce limits (prevents backscatter)
    bounce_to = {
        bucket = [
            {
                burst = 5;
                rate = "10 / 1h";
            }
        ];
    };
}

# Don't rate limit whitelisted IPs
whitelisted_rcpts = "postmaster,mailer-daemon";
'''

RATELIMIT_SYMBOLS = '''\
# Rate limit symbol scores
group "ratelimit" {
    symbols {
        "RATELIMIT_CHECK" { weight = 0.0; }
        "RATELIMIT_EXCEEDED" { weight = 5.0; }
    }
}
'''

# Also configure fail2ban-style protection via Postfix
POSTFIX_RATELIMIT = '''\
# Connection rate limiting in smtpd
smtpd_client_connection_rate_limit = 20
smtpd_client_message_rate_limit = 50
smtpd_client_recipient_rate_limit = 100
smtpd_error_sleep_time = 5s
smtpd_soft_error_limit = 3
smtpd_hard_error_limit = 10
'''

def main():
    # Write Rspamd rate limit config
    with open("/etc/rspamd/local.d/ratelimit.conf", "w") as f:
        f.write(RATELIMIT_CONF)
    print("✓ Created /etc/rspamd/local.d/ratelimit.conf")
    
    # Append rate limit symbols to groups.conf
    with open("/etc/rspamd/local.d/groups.conf", "a") as f:
        f.write("\n" + RATELIMIT_SYMBOLS)
    print("✓ Updated /etc/rspamd/local.d/groups.conf with rate limit symbols")
    
    # Print Postfix recommendation
    print("\n📝 Recommended Postfix settings (add to /etc/postfix/main.cf):")
    print(POSTFIX_RATELIMIT)
    
    import subprocess
    subprocess.run(["systemctl", "restart", "rspamd"], check=True)
    print("\n✅ Rspamd restarted with rate limiting enabled!")

if __name__ == "__main__":
    main()
