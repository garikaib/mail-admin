"""ZISPA template generation service."""
import os

ZISPA_TEMPLATE = """                                 ZISPA
                       .CO.ZW Namespace Registry

             APPLICATION TO ESTABLISH A SUB-DOMAIN WITHIN
                 THE .CO.ZW NAMESPACE OF THE INTERNET

       ======================================================== 
      |        ZISPA manages Zimbabwe's .CO.ZW registry        |
      |                                                        |
      |       ** TERMS AND CONDITIONS OF REGISTRATION **       |
      |                                                        |
      | .CO.ZW domain registrations are subject to the terms   |
      | and conditions as published at http://www.zispa.org.zw |
      | from time to time.                                     |
      |                                                        |
      |              ** COSTS OF REGISTRATION **               |
      |                                                        |
      | The costs of registration will vary from time to time. |
      | Details of current charges may be obtained from ZISPA. |
      |                                                        |
      | This document is intended to be scanned electronically |
      | so please do not change its format or enter data other |
      | than in the specified locations.  The file must be     |
      | sent in plain ASCII format as an attachment and not as |
      | inline text.  It must not be uuencoded or MIME encoded |
      | or sent in any proprietary word processing file format |
      |                                                        |
      | Please send only ONE APPLICATION per e-mail message    |
      | to admin@zispa.org.zw, with the FULL DOMAIN NAME IN    |
      | THE SUBJECT LINE.                                      |
      |                                                        |
      | All data must be entered on a single line following    |
      | the colon for the field concerned to facilitate data   |
      | capture.                                               |
      |                                                        |
      |  ** All fields with an asterisk must be completed **   |
      |                                                        |
       ======================================================== 

      0.  ZW DOMAIN TEMPLATE....: 3.3 - 28 Jan 2015

      1.  DOMAIN NAME and ACTION
    * 1a. Full domain name......: {domain}
    * 1b. (N)ew or (M)odify or (D)elete or (T)ransfer (N/M/D/T)..: {action}

      2.  DOMAIN OWNER
    * 2a. Domain Owner..........: {owner_name}
    * 2b. Organisation Name.....: {owner_org}
    * 2c. Physical Address......: {owner_address}
    * 2d. Postal Address .......: {owner_address}
    * 2e. Town/City.............: {owner_city}
    * 2f. Country...............: {owner_country}
    * 2g. Voice Phone...........: {owner_phone}
      2h. Fax Number............: {owner_fax}
    * 2i. E-mail Address........: {owner_email}

      3.  ADMIN/BILLING CONTACT
    * 3a. ZISPA Handle..........: ZimPriceCheck
    * 3b. Contact Name..........: Racine Rogers
    * 3c. Organisation Name.....: ZIMPRICECHECK
    * 3d. Physical Address .....: 4th FL, Three Anchor House, 54 Jason Moyo Ave
    * 3e. Postal Address .......: 4th FL, Three Anchor House, 54 Jason Moyo Ave
    * 3f. Town/City.............: HARARE
    * 3g. Country...............: ZIMBABWE
    * 3h. Voice Phone...........: +263771727620
      3i. Fax Number............: None
    * 3j. E-mail Address........: business@zimpricecheck.com

      4.  DESCRIPTION OF ORGANISATION/DOMAIN
    * 4a. Description of domain
          owner's organisation..: {owner_org}
    * 4b. Proposed domain usage.: Website and Emails

      5.  TECHNICAL CONTACT
    * 5a. ZISPA Handle..........: ZimPriceCheck
    * 5b. Contact Name..........: James Chipwana
    * 5c. Organisation Name.....: ZIMPRICECHECK
    * 5d. Physical Address .....: 4th FL, Three Anchor House, 54 Jason Moyo Ave
    * 5e. Postal Address .......: 4th FL, Three Anchor House, 54 Jason Moyo Ave
    * 5f. Town/City.............: HARARE
    * 5g. Country...............: ZIMBABWE
    * 5h. Voice Phone...........: +263778884406
      5i. Fax Number............: NONE
    * 5j. E-mail Address........: business@zimpricecheck.com

      6.  PRIMARY NAMESERVER
    * 6a. Hostname..............: {ns1_hostname}
    * 6b. IP Address............: {ns1_ip}

          SECONDARY NAMESERVER
    * 6c. Hostname..............: {ns2_hostname}
    * 6d. IP Address............: {ns2_ip}

          SECONDARY NAMESERVER
      6e. Hostname..............: 
      6f. IP Address............: 

          SECONDARY NAMESERVER
      6g. Hostname..............: 
      6h. IP Address............: 

    * 7.  DOMICILIUM CITANDI ET EXECUTANDI
      The organisation specified
      in 2 above chooses as its
      address for the giving and
      serving of notices the
      following street address
      (Note: Post Office box or
      Post Office bag addresses
      are not acceptable).......: {owner_address}, {owner_city}
"""

def sanitize_field(value: str) -> str:
    """Remove characters that could break template or email headers."""
    if not value:
        return ""
    # Remove newlines to ensure single line entries
    return value.replace('\r', '').replace('\n', ', ').strip()


def generate_zispa_template(registration) -> str:
    """
    Generate ZISPA template from DomainRegistration model.
    """
    template_action = registration.action
    if template_action == "bulk_edit":
        template_action = "T"

    return ZISPA_TEMPLATE.format(
        domain=registration.domain_name,
        action=template_action,
        owner_name=sanitize_field(registration.owner_name),
        owner_org=sanitize_field(registration.owner_org or registration.owner_name),
        owner_address=sanitize_field(registration.owner_address),
        owner_city=sanitize_field(registration.owner_city),
        owner_country=sanitize_field(registration.owner_country),
        owner_phone=sanitize_field(registration.owner_phone),
        owner_fax=sanitize_field(registration.owner_fax),
        owner_email=sanitize_field(registration.owner_email),
        ns1_hostname=registration.ns1_hostname or '',
        ns1_ip=registration.ns1_ip or '',
        ns2_hostname=registration.ns2_hostname or '',
        ns2_ip=registration.ns2_ip or '',
    )
