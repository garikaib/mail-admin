import os
import logging
import logging.handlers
import ipaddress
from datetime import datetime, timedelta
import geoip2.database
from sqlalchemy.orm import Session
from backend.app.core.sudo import run_sudo
from backend.app.models import GeoDomainPolicy, GeoUserException, GeoActiveBan, MailDomain, MailUser, GeoSshPolicy, GeoRegion

logger = logging.getLogger(__name__)

# Dedicated NFT logger to write to logs/nft_operations.log without propagating to root logger (avoiding system/email alerts)
nft_logger = logging.getLogger("backend.nft")
nft_logger.setLevel(logging.INFO)
nft_logger.propagate = False

try:
    log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "logs"))
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "nft_operations.log")
    file_handler = logging.handlers.RotatingFileHandler(log_file, maxBytes=1024*1024*5, backupCount=5)
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    nft_logger.addHandler(file_handler)
except Exception as e:
    # Fallback to root logger if file logging fails for any permission reasons in test env
    logger.error(f"Failed to initialize dedicated NFT logging file: {e}")
    nft_logger.addHandler(logging.StreamHandler())

def get_regions_dict(db: Session) -> dict[str, set[str]]:
    """Loads regions from the database, falling back to predefined values if none are found."""
    try:
        db_regions = db.query(GeoRegion).all()
        if db_regions:
            return {
                r.name.upper(): {c.strip().upper() for c in r.countries.split(",") if c.strip()}
                for r in db_regions
            }
    except Exception as e:
        logger.error(f"Error loading regions from database: {e}")
    
    # Predefined fallback
    return {
        "SADC": {"AO", "BW", "KM", "CD", "SZ", "LS", "MG", "MW", "MU", "MZ", "NA", "SC", "ZA", "TZ", "ZM", "ZW"},
        "EUROPE": {
            "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
            "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO",
            "RU", "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA"
        },
        "NORTH AMERICA": {"US", "CA", "MX"},
        "MIDDLE EAST": {"AE", "SA", "QA", "BH", "OM", "YE", "IL", "JO", "LB", "SY", "IQ", "IR", "TR"},
        "WESTERN EUROPE": {"BE", "FR", "DE", "LU", "NL", "CH", "GB", "IE", "AT", "LI"},
        "NORTH AFRICA": {"EG", "LY", "TN", "DZ", "MA", "EH", "SD"},
        "SOUTHERN AFRICA": {"ZA", "LS", "SZ", "NA", "BW", "MZ", "ZW", "ZM", "AO", "MW"},
        "ASIA": {"CN", "JP", "KR", "IN", "PK", "BD", "LK", "NP", "MM", "TH", "VN", "MY", "SG", "ID", "PH"}
    }

# Resolve MaxMind database path
def get_mmdb_path() -> str:
    paths = [
        os.getenv("GEOIP_DB_PATH", ""),
        "/home/ubuntu/html/GeoLite2-City.mmdb",
        "/home/ubuntu/html/GeoLite2-Country.mmdb",
        "/home/garikaib/Documents/sites/zimpricecheck/htdocs/wp-content/wflogs/geoip.mmdb",
        "/usr/share/GeoIP/GeoLite2-City.mmdb",
        "/var/lib/GeoIP/GeoLite2-City.mmdb",
        "/var/lib/GeoIP/GeoLite2-Country.mmdb",
        "/usr/share/GeoIP/GeoLite2-Country.mmdb",
    ]
    for path in paths:
        if path and os.path.exists(path):
            return path
    return ""

def get_country_code(ip_str: str) -> str:
    """
    Get country code for an IP address. Returns 'LOCAL' for private IPs,
    or 'UNKNOWN' if resolution fails.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback:
            return "LOCAL"
    except ValueError:
        return "UNKNOWN"

    mmdb_path = get_mmdb_path()
    if not mmdb_path:
        logger.warning("GeoIP Database file not found on system.")
        return "UNKNOWN"

    try:
        with geoip2.database.Reader(mmdb_path) as reader:
            response = reader.city(ip_str)
            return response.country.iso_code or "UNKNOWN"
    except Exception as e:
        logger.error(f"GeoIP resolution failed for IP {ip_str}: {e}")
        # Try country reader fallback if city lookup fails
        try:
            with geoip2.database.Reader(mmdb_path) as reader:
                response = reader.country(ip_str)
                return response.country.iso_code or "UNKNOWN"
        except Exception:
            return "UNKNOWN"

def validate_nft_command(cmd: list[str]) -> bool:
    """
    Validates the nft command arguments before execution to prevent
    arbitrary execution and ensure correct formatting.
    """
    if not cmd or not isinstance(cmd, list):
        return False
    
    # 1. Allowed executable paths
    if cmd[0] not in ("/usr/sbin/nft", "/usr/bin/nft"):
        return False
        
    # 2. Action validation
    if len(cmd) < 7:
        return False
        
    action = cmd[1]
    if action not in ("add", "delete"):
        return False
        
    if cmd[2] != "element":
        return False
        
    # 3. Family check
    family = cmd[3]
    if family not in ("ip", "ip6"):
        return False
        
    if cmd[4] != "filter":
        return False
        
    # 4. Set validation
    set_name = cmd[5]
    allowed_sets = ("geo_mail_bans", "geo_ssh_bans", "geo_mail_bans_v6", "geo_ssh_bans_v6")
    if set_name not in allowed_sets:
        return False
        
    # 5. IP Address validation
    ip_str = cmd[6]
    try:
        ip = ipaddress.ip_address(ip_str)
        # Ensure family matches the IP version
        if ip.version == 4 and family != "ip":
            return False
        if ip.version == 6 and family != "ip6":
            return False
    except ValueError:
        return False
        
    # 6. Timeout options validation
    if action == "add":
        if len(cmd) == 9:
            if cmd[7] != "timeout":
                return False
            # Check if value ends with 's' and prefix is digit
            timeout_val = cmd[8]
            if not timeout_val.endswith("s") or not timeout_val[:-1].isdigit():
                return False
        elif len(cmd) != 7:
            return False
    elif action == "delete":
        if len(cmd) != 7:
            return False
            
    return True

def run_nft_command(cmd: list[str]) -> bool:
    """
    Executes an nft command with sudo after validation. Mocked in development mode.
    Logs operations and errors to a dedicated log file to prevent email alerts.
    """
    # Programmatic input validation
    if not validate_nft_command(cmd):
        nft_logger.error(f"Command validation failed: {' '.join(cmd)}")
        return False

    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    if not is_prod:
        nft_logger.info(f"[MOCK NFT] Executing: {' '.join(cmd)}")
        return True

    try:
        nft_logger.info(f"Executing: {' '.join(cmd)}")
        result = run_sudo(cmd, capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            nft_logger.error(
                f"Nftables command failed: {' '.join(cmd)}\n"
                f"Exit code: {result.returncode}\n"
                f"Stdout: {result.stdout.strip()}\n"
                f"Stderr: {result.stderr.strip()}"
            )
            return False
        nft_logger.info(f"Command succeeded: {' '.join(cmd)}")
        return True
    except Exception as e:
        nft_logger.exception(f"Failed to execute nft command: {e}")
        return False

def add_ip_to_nftables(ip_str: str, service: str, timeout_seconds: int = 1800) -> bool:
    """
    Adds an IP to the service-specific nftables set with a timeout, supporting IPv4 and IPv6.
    """
    try:
        ip = ipaddress.ip_address(ip_str)  # Validation
    except ValueError:
        logger.error(f"Invalid IP address for banning: {ip_str}")
        return False

    if ip.version == 4:
        family = "ip"
        set_name = "geo_mail_bans" if service == "mail" else "geo_ssh_bans"
    else:
        family = "ip6"
        set_name = "geo_mail_bans_v6" if service == "mail" else "geo_ssh_bans_v6"

    cmd = ["/usr/sbin/nft", "add", "element", family, "filter", set_name, ip_str, "timeout", f"{timeout_seconds}s"]
    return run_nft_command(cmd)

def remove_ip_from_nftables(ip_str: str, service: str) -> bool:
    """
    Removes an IP from the service-specific nftables set, supporting IPv4 and IPv6.
    """
    try:
        ip = ipaddress.ip_address(ip_str)  # Validation
    except ValueError:
        return False

    if ip.version == 4:
        family = "ip"
        set_name = "geo_mail_bans" if service == "mail" else "geo_ssh_bans"
    else:
        family = "ip6"
        set_name = "geo_mail_bans_v6" if service == "mail" else "geo_ssh_bans_v6"

    cmd = ["/usr/sbin/nft", "delete", "element", family, "filter", set_name, ip_str]
    return run_nft_command(cmd)

def check_login_policy(db: Session, username: str, remote_ip: str, service: str) -> tuple[bool, str]:
    """
    Main authorization logic. Returns (allowed, reason).
    If denied, triggers the nftables ban.
    """
    # 1. Resolve country code
    country_code = get_country_code(remote_ip)
    if country_code == "LOCAL":
        return True, "Local / Trusted Private Network Bypass"
    if country_code == "UNKNOWN":
        return True, "GeoIP Resolution Failure Bypass (Fail-Open)"

    regions_dict = get_regions_dict(db)
    sadc_countries = regions_dict.get("SADC", set())

    # 2. Check user-specific exceptions (travel pass)
    user_exceptions = db.query(GeoUserException).filter(
        GeoUserException.username == username,
        GeoUserException.service.in_([service, "all"])
    ).all()
    if user_exceptions:
        active_exceptions = [
            exc for exc in user_exceptions
            if exc.expires_at is None or exc.expires_at > datetime.utcnow()
        ]
        if active_exceptions:
            for exc in active_exceptions:
                allowed_countries = [c.strip().upper() for c in exc.allowed_countries.split(",") if c.strip()]
                if country_code in allowed_countries:
                    return True, f"Access granted by user override exception ({exc.service}) for country {country_code}"
            
            detailed_reason = f"User exceptions ({', '.join(exc.service for exc in active_exceptions)}) exist but do not allow country {country_code}"
            logger.warning(f"GeoIP Auth Failed: {username} from {remote_ip} ({country_code}). Reason: {detailed_reason}")
            trigger_ban(db, remote_ip, service)
            return False, "Access denied: Trying to login from an unauthorised location"

    # 3. Resolve Domain Policy
    domain_name = ""
    if "@" in username:
        _, domain_name = username.split("@", 1)

    allowed = False
    detailed_reason = ""

    if domain_name:
        domain = db.query(MailDomain).filter(MailDomain.name == domain_name).first()
        if domain:
            policy = db.query(GeoDomainPolicy).filter(GeoDomainPolicy.domain_id == domain.id).first()
            if policy:
                # Compile allowed countries
                allowed_countries = {c.strip().upper() for c in policy.allowed_countries.split(",") if c.strip()}
                allowed_regions = {r.strip().upper() for r in policy.allowed_regions.split(",") if r.strip()}

                # Expand regional countries
                for region in allowed_regions:
                    if region in regions_dict:
                        allowed_countries.update(regions_dict[region])

                if getattr(policy, "augment_default", True):
                    allowed_countries.update(sadc_countries)

                if country_code in allowed_countries:
                    allowed = True
                    reason = f"Access granted by domain policy list (Country: {country_code})"
                else:
                    detailed_reason = f"Country {country_code} is not allowed by domain policy"
            else:
                # Default: No policy configured -> Only SADC allowed
                if country_code in sadc_countries:
                    allowed = True
                    reason = f"Access granted by default fallback policy (SADC country {country_code})"
                else:
                    detailed_reason = f"Country {country_code} is not in default SADC group"
        else:
            detailed_reason = f"Domain '{domain_name}' is not registered on this system"
    else:
        # Usernames without domains (e.g. system administrators, SSH root logins)
        if service == "ssh":
            ssh_policy = db.query(GeoSshPolicy).first()
            if ssh_policy:
                # Compile allowed countries for SSH
                allowed_countries = {c.strip().upper() for c in ssh_policy.allowed_countries.split(",") if c.strip()}
                allowed_regions = {r.strip().upper() for r in ssh_policy.allowed_regions.split(",") if r.strip()}

                # Expand regional countries
                for region in allowed_regions:
                    if region in regions_dict:
                        allowed_countries.update(regions_dict[region])

                if getattr(ssh_policy, "augment_default", True):
                    allowed_countries.update(sadc_countries)

                if country_code in allowed_countries:
                    allowed = True
                    reason = f"Access granted by SSH policy list (Country: {country_code})"
                else:
                    detailed_reason = f"Country {country_code} is not allowed by SSH policy"
            else:
                # Fallback to default SADC
                if country_code in sadc_countries:
                    allowed = True
                    reason = f"Access granted by default admin fallback policy (SADC country {country_code})"
                else:
                    detailed_reason = f"Administrative login from country {country_code} not in SADC fallback list"
        else:
            # Check default SADC fallback
            if country_code in sadc_countries:
                allowed = True
                reason = f"Access granted by default admin fallback policy (SADC country {country_code})"
            else:
                detailed_reason = f"Administrative login from country {country_code} not in SADC fallback list"

    if not allowed:
        logger.warning(f"GeoIP Auth Failed: {username} from {remote_ip} ({country_code}). Reason: {detailed_reason}")
        trigger_ban(db, remote_ip, service)
        return False, "Access denied: Trying to login from an unauthorised location"

    return allowed, reason

def trigger_ban(db: Session, ip_str: str, service: str, duration_minutes: int = 30):
    """
    Saves the ban in SQLite/MariaDB and enforces it in Nftables with incremental scaling.
    """
    # Save/Update in DB
    existing_ban = db.query(GeoActiveBan).filter(
        GeoActiveBan.ip_address == ip_str,
        GeoActiveBan.service == service
    ).first()

    now = datetime.utcnow()
    should_enforce_nftables = True

    if existing_ban:
        was_active = existing_ban.expires_at and existing_ban.expires_at > now
        existing_ban.ban_count += 1
        # Exponential scaling: 30m, 60m, 120m, 240m, 480m, ... up to 10080m (1 week)
        duration_minutes = min(30 * (2 ** (existing_ban.ban_count - 1)), 10080)
        existing_ban.expires_at = now + timedelta(minutes=duration_minutes)
        should_enforce_nftables = not was_active
    else:
        duration_minutes = 30
        existing_ban = GeoActiveBan(
            ip_address=ip_str,
            service=service,
            expires_at=now + timedelta(minutes=duration_minutes),
            ban_count=1
        )
        db.add(existing_ban)

    db.commit()

    # An already-active ban should already exist in nftables. Avoid re-running
    # nft for every repeated login attempt from the same source.
    if should_enforce_nftables:
        add_ip_to_nftables(ip_str, service, duration_minutes * 60)

def reconcile_bans_on_boot(db: Session):
    """
    Reads active bans from the database on startup and loads them into nftables sets.
    """
    now = datetime.utcnow()
    active_bans = db.query(GeoActiveBan).filter(GeoActiveBan.expires_at > now).all()

    for ban in active_bans:
        remaining_seconds = int((ban.expires_at - now).total_seconds())
        if remaining_seconds > 0:
            add_ip_to_nftables(ban.ip_address, ban.service, remaining_seconds)
