"""Email service for sending ZISPA applications."""
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from sqlalchemy.orm import Session
from backend.app.models import SystemEmailConfig

logger = logging.getLogger(__name__)

# Testing recipient - user asked to use their email for now instead of ZISPA
ZISPA_RECIPIENT_TEST = "garikaib@gmail.com"
# Production would be: admin@zispa.org.zw

def get_dns_email_password(db: Session) -> str:
    """
    Get current password for dns@zimpricecheck.com from DB.
    """
    try:
        config = db.query(SystemEmailConfig).filter(SystemEmailConfig.email == 'dns@zimpricecheck.com').first()
        if not config:
            logger.error("SystemEmailConfig for dns@zimpricecheck.com not found")
            return None
        return config.get_password()
    except Exception as e:
        logger.error(f"Error retrieving DNS email password: {e}")
        return None

def send_zispa_email(db: Session, domain: str, template_content: str, action: str) -> tuple[bool, str]:
    """
    Send ZISPA application email with template attachment via local SMTP server.
    """
    action_labels = {'N': 'New', 'M': 'Modify', 'T': 'Transfer', 'D': 'Delete'}
    subject = f"{action_labels.get(action, 'New')}:{domain}"
    
    sender_email = "dns@zimpricecheck.com"
    
    body = """Good day,

Can you please process the attached template on our behalf.

Regards,
ZimPriceCheck DNS Team
"""
    
    msg = MIMEMultipart()
    msg['From'] = sender_email
    # Use test recipient as requested
    msg['To'] = ZISPA_RECIPIENT_TEST 
    msg['Subject'] = subject
    
    msg.attach(MIMEText(body, 'plain'))
    
    # Attach template
    part = MIMEBase('application', 'octet-stream')
    part.set_payload(template_content.encode('utf-8'))
    encoders.encode_base64(part)
    part.add_header('Content-Disposition', f'attachment; filename="{domain}.txt"')
    msg.attach(part)
    
    try:
        # Connect to local Postfix on localhost:25
        server = smtplib.SMTP('localhost', 25, timeout=10)
        
        server.sendmail(sender_email, ZISPA_RECIPIENT_TEST, msg.as_string())
        server.quit()
        
        logger.info(f"ZISPA email sent for {domain} to {ZISPA_RECIPIENT_TEST} via local SMTP")
        return True, "Email sent successfully"
        
    except Exception as e:
        logger.error(f"Failed to send ZISPA email for {domain} via local SMTP: {e}")
        return False, str(e)

def send_bulk_zispa_email(
    db: Session, 
    domains: list[str], 
    ns1: str, 
    ns1_ip: str, 
    ns2: str, 
    ns2_ip: str, 
    action: str, 
    attachment_content: str
) -> tuple[bool, str]:
    """
    Send bulk ZISPA action email with group text file attachment via local SMTP.
    """
    action_labels = {'N': 'New', 'M': 'Modify', 'T': 'Transfer', 'D': 'Delete'}
    subject = f"Bulk {action_labels.get(action, 'Transfer')} Request - {len(domains)} Domains"
    
    sender_email = "dns@zimpricecheck.com"
    
    body = f"""Good day,

Please find attached the bulk application file for {len(domains)} domain transfers/updates.
Nameserver 1: {ns1} ({ns1_ip})
Nameserver 2: {ns2} ({ns2_ip})

Regards,
ZimPriceCheck DNS Team
"""
    
    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = ZISPA_RECIPIENT_TEST 
    msg['Subject'] = subject
    
    msg.attach(MIMEText(body, 'plain'))
    
    # Attach text file
    part = MIMEBase('application', 'octet-stream')
    part.set_payload(attachment_content.encode('utf-8'))
    encoders.encode_base64(part)
    filename = f"bulk_{action.lower()}_{len(domains)}_domains.txt"
    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
    msg.attach(part)
    
    try:
        server = smtplib.SMTP('localhost', 25, timeout=10)
        server.sendmail(sender_email, ZISPA_RECIPIENT_TEST, msg.as_string())
        server.quit()
        logger.info(f"Bulk ZISPA email sent for {len(domains)} domains via local SMTP")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"Failed to send bulk ZISPA email via local SMTP: {e}")
        return False, str(e)

def send_bulk_edit_email(
    db: Session, 
    domains: list[str], 
    attachment_content: str
) -> tuple[bool, str]:
    """
    Send a single bulk edit email with nameserver/domain groups txt file as attachment.
    """
    sender_email = "dns@zimpricecheck.com"
    subject = f"Bulk Edit Request - {len(domains)} Domains"
    
    body = f"""Good day,

Please find attached the bulk edit file for {len(domains)} domains grouped by nameservers.

Regards,
ZimPriceCheck DNS Team
"""
    
    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = ZISPA_RECIPIENT_TEST 
    msg['Subject'] = subject
    
    msg.attach(MIMEText(body, 'plain'))
    
    # Attach text file
    part = MIMEBase('application', 'octet-stream')
    part.set_payload(attachment_content.encode('utf-8'))
    encoders.encode_base64(part)
    filename = f"bulk_edit_{len(domains)}_domains.txt"
    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
    msg.attach(part)
    
    try:
        server = smtplib.SMTP('localhost', 25, timeout=10)
        server.sendmail(sender_email, ZISPA_RECIPIENT_TEST, msg.as_string())
        server.quit()
        logger.info(f"Bulk edit email sent for {len(domains)} domains via local SMTP")
        return True, "Email sent successfully"
    except Exception as e:
        logger.error(f"Failed to send bulk edit email via local SMTP: {e}")
        return False, str(e)

