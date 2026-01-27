#!/usr/bin/env python3
"""
Fix SOGo authentication by creating proper database schema.
SOGo expects specific column names: c_uid, c_name, c_password, c_cn, mail
"""
import subprocess

SERVER = "51.77.222.232"
DOMAIN = "zimprices.co.zw"
MAIL_USER = "gbdzoma"
MAIL_PASSWORD = "ChangeMe123!"


def ssh_cmd(cmd: str) -> tuple[int, str, str]:
    """Execute command on remote server via SSH."""
    result = subprocess.run(
        ["ssh", f"ubuntu@{SERVER}", cmd],
        capture_output=True,
        text=True
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def fix_database():
    """Rebuild the database with SOGo-compatible schema."""
    print("=== Diagnosing Current State ===")
    
    # Check what's in the database
    code, out, err = ssh_cmd("sudo mariadb -e 'SHOW DATABASES;'")
    print(f"Databases:\n{out}")
    
    code, out, err = ssh_cmd("sudo mariadb -e 'SHOW TABLES FROM mailserver;'")
    print(f"\nTables in mailserver:\n{out}")
    
    code, out, err = ssh_cmd("sudo mariadb -e 'SELECT * FROM mailserver.domains;'")
    print(f"\nDomains:\n{out}")
    
    code, out, err = ssh_cmd("sudo mariadb -e 'SELECT * FROM mailserver.users;'")
    print(f"\nUsers:\n{out}")
    
    print("\n=== Rebuilding Database with SOGo-Compatible Schema ===")
    
    # Drop and recreate users table with SOGo-compatible columns
    sql = '''
    DROP TABLE IF EXISTS mailserver.sogo_user_profile;
    DROP TABLE IF EXISTS mailserver.sogo_folder_info;
    DROP TABLE IF EXISTS mailserver.sogo_sessions_folder;
    DROP TABLE IF EXISTS mailserver.aliases;
    DROP TABLE IF EXISTS mailserver.users;
    
    CREATE TABLE mailserver.users (
        c_uid VARCHAR(128) PRIMARY KEY,
        c_name VARCHAR(128) NOT NULL,
        c_password VARCHAR(256) NOT NULL,
        c_cn VARCHAR(128),
        mail VARCHAR(128) NOT NULL,
        domain_id INT NOT NULL,
        UNIQUE KEY (mail)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    
    CREATE TABLE mailserver.aliases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        source VARCHAR(100) NOT NULL,
        destination VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    '''
    
    code, out, err = ssh_cmd(f"sudo mariadb -e \"{sql}\"")
    if code != 0:
        print(f"Error creating tables: {err}")
        return False
    print("Tables recreated with SOGo-compatible schema.")
    
    # Generate password hash
    code, hash_out, err = ssh_cmd(f"doveadm pw -s SHA512-CRYPT -p '{MAIL_PASSWORD}'")
    if code != 0:
        print(f"Error generating hash: {err}")
        return False
    password_hash = hash_out.strip()
    print(f"Password hash: {password_hash[:40]}...")
    
    # Get domain ID
    code, domain_id, err = ssh_cmd(f"sudo mariadb -N -e \"SELECT id FROM mailserver.domains WHERE name='{DOMAIN}'\"")
    if not domain_id:
        print("Domain not found, domain_id will be 1")
        domain_id = "1"
    
    # Insert user with SOGo-compatible columns
    email = f"{MAIL_USER}@{DOMAIN}"
    # Escape single quotes
    escaped_hash = password_hash.replace("'", "''")
    
    insert_sql = f'''
    INSERT INTO mailserver.users (c_uid, c_name, c_password, c_cn, mail, domain_id)
    VALUES ('{email}', '{email}', '{escaped_hash}', '{MAIL_USER}', '{email}', {domain_id});
    '''
    
    code, out, err = ssh_cmd(f"sudo mariadb -e \"{insert_sql}\"")
    if code != 0:
        print(f"Error inserting user: {err}")
        return False
    print(f"User {email} created.")
    
    # Verify
    code, out, err = ssh_cmd("sudo mariadb -e 'SELECT c_uid, mail, LEFT(c_password, 40) as pwd FROM mailserver.users;'")
    print(f"\nVerify users:\n{out}")
    
    return True


def update_sogo_config():
    """Update SOGo config to match our schema."""
    print("\n=== Updating SOGo Configuration ===")
    
    sogo_conf = '''{
  /* Database configuration */
  SOGoProfileURL = "mysql://mailuser:ChangeMe123!@127.0.0.1:3306/mailserver/sogo_user_profile";
  OCSFolderInfoURL = "mysql://mailuser:ChangeMe123!@127.0.0.1:3306/mailserver/sogo_folder_info";
  OCSSessionsFolderURL = "mysql://mailuser:ChangeMe123!@127.0.0.1:3306/mailserver/sogo_sessions_folder";

  /* Mail */
  SOGoMailingMechanism = smtp;
  SOGoSMTPServer = "127.0.0.1";
  SOGoDraftsFolderName = Drafts;
  SOGoSentFolderName = Sent;
  SOGoTrashFolderName = Trash;
  SOGoIMAPServer = "127.0.0.1";

  /* Authentication - using standard SOGo column names */
  SOGoUserSources = (
    {
      type = sql;
      id = users;
      viewURL = "mysql://mailuser:ChangeMe123!@127.0.0.1:3306/mailserver/users";
      canAuthenticate = YES;
      isAddressBook = YES;
      userPasswordAlgorithm = crypt;
    }
  );

  /* Web Interface */
  SOGoPageTitle = "ZimPrices Mail";
  SOGoVacationEnabled = YES;
  SOGoForwardEnabled = YES;
  SOGoSieveScriptsEnabled = YES;
  SOGoMailMessageCheck = every_minute;
  SOGoFirstDayOfWeek = 1;

  /* General */
  SOGoLanguage = English;
  SOGoTimeZone = "Africa/Harare";
}'''
    
    # Write config via heredoc
    cmd = f'''cat > /tmp/sogo.conf << 'EOFCONF'
{sogo_conf}
EOFCONF
sudo cp /tmp/sogo.conf /etc/sogo/sogo.conf
sudo chown sogo:sogo /etc/sogo/sogo.conf
sudo systemctl restart sogo'''
    
    code, out, err = ssh_cmd(cmd)
    if code != 0:
        print(f"Error updating SOGo config: {err}")
        return False
    print("SOGo configuration updated and service restarted.")
    return True


def verify_services():
    """Verify all services are running."""
    print("\n=== Verifying Services ===")
    
    services = ["postfix", "dovecot", "rspamd", "nginx", "sogo", "redis-server", "mariadb"]
    for svc in services:
        code, status, _ = ssh_cmd(f"systemctl is-active {svc}")
        symbol = "✓" if status == "active" else "✗"
        print(f"  {symbol} {svc}: {status}")


if __name__ == "__main__":
    if fix_database():
        update_sogo_config()
    verify_services()
    
    print("\n" + "="*50)
    print("Fix Complete! Try logging in again:")
    print(f"URL: https://mail.{DOMAIN}")
    print(f"User: {MAIL_USER}@{DOMAIN}")
    print(f"Password: {MAIL_PASSWORD}")
    print("="*50)
