#!/usr/bin/env python3
"""
Comprehensive mail server health check.
"""
import subprocess
import sys

SERVER = "51.77.222.232"

def ssh_cmd(cmd: str) -> tuple[int, str]:
    """Execute command on remote server via SSH."""
    result = subprocess.run(
        ["ssh", f"ubuntu@{SERVER}", cmd],
        capture_output=True,
        text=True
    )
    return result.returncode, result.stdout.strip() + result.stderr.strip()


def check_services():
    """Check all mail-related services."""
    print("=" * 60)
    print("SERVICE STATUS")
    print("=" * 60)
    
    services = [
        ("postfix", "SMTP Server"),
        ("dovecot", "IMAP/POP3 Server"),
        ("rspamd", "Spam Filter"),
        ("sogo", "Webmail"),
        ("nginx", "Web Proxy"),
        ("redis-server", "Cache"),
        ("mariadb", "Database"),
    ]
    
    all_ok = True
    for svc, desc in services:
        code, out = ssh_cmd(f"systemctl is-active {svc}")
        status = out.strip()
        symbol = "✓" if status == "active" else "✗"
        if status != "active":
            all_ok = False
        print(f"  {symbol} {desc:20} ({svc}): {status}")
    
    return all_ok


def check_ports():
    """Check required ports are listening."""
    print("\n" + "=" * 60)
    print("PORT STATUS")
    print("=" * 60)
    
    ports = [
        (25, "SMTP"),
        (587, "Submission"),
        (465, "SMTPS"),
        (993, "IMAPS"),
        (143, "IMAP"),
        (80, "HTTP"),
        (443, "HTTPS"),
        (20000, "SOGo"),
    ]
    
    code, out = ssh_cmd("ss -tlnp")
    
    for port, desc in ports:
        if f":{port}" in out:
            print(f"  ✓ {desc:15} (:{port})")
        else:
            print(f"  ✗ {desc:15} (:{port}) - NOT LISTENING")


def check_dns():
    """Verify DNS records."""
    print("\n" + "=" * 60)
    print("DNS VERIFICATION")
    print("=" * 60)
    
    code, mx = ssh_cmd("dig +short MX zimprices.co.zw")
    print(f"  MX Record: {mx if mx else 'NOT FOUND'}")
    
    code, a = ssh_cmd("dig +short A mail.zimprices.co.zw")
    print(f"  A Record (mail.): {a if a else 'NOT FOUND'}")
    
    code, spf = ssh_cmd("dig +short TXT zimprices.co.zw | grep spf")
    print(f"  SPF Record: {'FOUND' if 'spf1' in spf else 'NOT FOUND'}")
    
    code, dkim = ssh_cmd("dig +short TXT mail._domainkey.zimprices.co.zw")
    print(f"  DKIM Record: {'FOUND' if 'DKIM1' in dkim else 'NOT FOUND'}")
    
    code, dmarc = ssh_cmd("dig +short TXT _dmarc.zimprices.co.zw")
    print(f"  DMARC Record: {'FOUND' if 'DMARC1' in dmarc else 'NOT FOUND'}")


def check_ssl():
    """Verify SSL certificates."""
    print("\n" + "=" * 60)
    print("SSL CERTIFICATES")
    print("=" * 60)
    
    code, out = ssh_cmd("sudo openssl x509 -in /etc/lego/certificates/zimprices.co.zw.crt -noout -dates -subject 2>/dev/null")
    if code == 0:
        lines = out.split('\n')
        for line in lines:
            print(f"  {line}")
    else:
        print(f"  ✗ Could not read certificate: {out}")


def check_mail_queue():
    """Check mail queue status."""
    print("\n" + "=" * 60)
    print("MAIL QUEUE")
    print("=" * 60)
    
    code, out = ssh_cmd("sudo mailq")
    if "Mail queue is empty" in out:
        print("  ✓ Queue is empty (good)")
    else:
        lines = out.split('\n')
        print(f"  Queue has {len([l for l in lines if l.strip()])} entries")
        for line in lines[:5]:
            print(f"    {line}")


def check_recent_logs():
    """Check for errors in recent logs."""
    print("\n" + "=" * 60)
    print("RECENT LOG ERRORS (last 5 mins)")
    print("=" * 60)
    
    # Postfix errors
    code, out = ssh_cmd("sudo journalctl --since '5 minutes ago' --no-pager | grep -i 'error\\|fatal\\|warning' | tail -10")
    if out:
        print("  Recent issues found:")
        for line in out.split('\n')[:10]:
            print(f"    {line[:100]}")
    else:
        print("  ✓ No recent errors in logs")


def check_database():
    """Check database connectivity and data."""
    print("\n" + "=" * 60)
    print("DATABASE")
    print("=" * 60)
    
    code, domains = ssh_cmd("sudo mariadb -N -e 'SELECT COUNT(*) FROM mailserver.domains'")
    code, users = ssh_cmd("sudo mariadb -N -e 'SELECT COUNT(*) FROM mailserver.users'")
    
    print(f"  Domains: {domains}")
    print(f"  Users: {users}")


def check_postfix_config():
    """Verify critical Postfix settings."""
    print("\n" + "=" * 60)
    print("POSTFIX CONFIGURATION")
    print("=" * 60)
    
    settings = [
        "myhostname",
        "virtual_mailbox_domains",
        "virtual_mailbox_maps",
        "virtual_transport",
        "smtpd_tls_cert_file",
        "smtpd_milters",
    ]
    
    for setting in settings:
        code, value = ssh_cmd(f"postconf {setting}")
        print(f"  {value}")


def main():
    print("\n🔍 MAIL SERVER HEALTH CHECK")
    print("Server: 51.77.222.232 (mail.zimprices.co.zw)")
    print("Time: " + subprocess.run(["date"], capture_output=True, text=True).stdout.strip())
    
    services_ok = check_services()
    check_ports()
    check_dns()
    check_ssl()
    check_mail_queue()
    check_database()
    check_postfix_config()
    check_recent_logs()
    
    print("\n" + "=" * 60)
    if services_ok:
        print("✅ OVERALL STATUS: HEALTHY")
    else:
        print("⚠️  OVERALL STATUS: ISSUES DETECTED")
    print("=" * 60)


if __name__ == "__main__":
    main()
