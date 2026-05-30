#!/bin/bash
# Update Postfix/Dovecot/SOGo configs to match the new table schema
# users table columns: c_uid, c_name, c_password, c_cn, mail, domain_id

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 1. Update Postfix MySQL Maps
echo "Updating Postfix MySQL maps..."
sudo tee /etc/postfix/mysql-virtual-mailbox-maps.cf > /dev/null <<EOF
user = mailuser
password = ChangeMe123!
hosts = 127.0.0.1
dbname = mailserver
query = SELECT 1 FROM users WHERE mail='%s'
EOF

# 2. Update Dovecot SQL Config
echo "Updating Dovecot SQL config..."
sudo tee /etc/dovecot/dovecot-sql.conf.ext > /dev/null <<EOF
driver = mysql
connect = host=127.0.0.1 dbname=mailserver user=mailuser password=ChangeMe123!
default_pass_scheme = SHA512-CRYPT
# Map 'mail' to user, 'c_password' to password
password_query = SELECT mail as user, c_password as password FROM users WHERE mail='%u';
# Map 'mail' to user for userdb
user_query = SELECT mail as user, '/var/vmail/%d/%n' as home, 5000 as uid, 5000 as gid FROM users WHERE mail='%u';
EOF

# 3. Update SOGo Config with explicit mappings
echo "Updating SOGo config..."
sudo tee /etc/sogo/sogo.conf > /dev/null <<EOF
{
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

  /* Authentication */
  SOGoUserSources = (
    {
      type = sql;
      id = users;
      viewURL = "mysql://mailuser:ChangeMe123!@127.0.0.1:3306/mailserver/users";
      canAuthenticate = YES;
      isAddressBook = YES;
      userPasswordAlgorithm = crypt;
      prependPasswordScheme = NO; 
      
      /* Column Mappings */
      primaryKey = c_uid;
      idColumnName = c_uid;
      passwordColumnName = c_password;
      displayName = c_name;
      mail = mail;
      CN = c_cn;
      UID = c_uid;
    }
  );

  /* Web Interface */
  SOGoPageTitle = "ZimPrices Mail";
  SOGoVacationEnabled = YES;
  SOGoForwardEnabled = YES;
  SOGoSieveScriptsEnabled = YES;
  SOGoMailMessageCheck = every_minute;
  SOGoFirstDayOfWeek = 1;
  SOGoSuperUsernames = ("gbdzoma@zimprices.co.zw");

  /* General */
  SOGoLanguage = English;
  SOGoTimeZone = "Africa/Harare";
  SOGoDebugRequests = YES;
  SOGoEASRequestLogFile = "/var/log/sogo/eas.log";
}
EOF

# 4. Update Rspamd Config for Local Blacklists
echo "Updating Rspamd config..."

sudo mkdir -p /etc/rspamd/local.d/maps.d
sudo install -m 0644 "$ROOT_DIR/configs/rspamd/multimap.conf" /etc/rspamd/local.d/multimap.conf
sudo install -m 0644 "$ROOT_DIR/configs/rspamd/groups.conf" /etc/rspamd/local.d/groups.conf
sudo install -m 0644 "$ROOT_DIR/configs/rspamd/local_bl_from.map.inc" /etc/rspamd/local.d/local_bl_from.map.inc
sudo install -m 0644 "$ROOT_DIR/configs/rspamd/maps.d/phish_keywords.map" /etc/rspamd/local.d/maps.d/phish_keywords.map
sudo install -m 0644 "$ROOT_DIR/configs/rspamd/maps.d/site_issues_subject.map" /etc/rspamd/local.d/maps.d/site_issues_subject.map
sudo install -m 0644 "$ROOT_DIR/configs/rspamd/maps.d/fake_delivery_subjects.map" /etc/rspamd/local.d/maps.d/fake_delivery_subjects.map
sudo install -m 0644 "$ROOT_DIR/configs/rspamd/rspamd.local.lua" /etc/rspamd/rspamd.local.lua

sudo touch /var/lib/rspamd/auto_phish_domains.map
sudo chown _rspamd:_rspamd /var/lib/rspamd/auto_phish_domains.map
sudo chmod 0640 /var/lib/rspamd/auto_phish_domains.map

echo "Validating Rspamd config..."
sudo rspamadm configtest

# 5. Restart Services
echo "Restarting services..."
sudo systemctl restart postfix dovecot sogo rspamd

echo "Configuration update complete."
