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
      id = users_source;
      viewURL = "mysql://mailuser:ChangeMe123!@127.0.0.1:3306/mailserver/users";
      canAuthenticate = YES;
      isAddressBook = YES;
      userPasswordAlgorithm = crypt;
      prependPasswordScheme = YES; 
      primaryKey = email;
      idColumnName = email;
      passwordColumnName = password;
      displayName = email; 
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
  SxVMemLimit = 384;
}
EOF

# Restart SOGo
sudo systemctl restart sogo
