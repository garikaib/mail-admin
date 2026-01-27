import os
import subprocess
import pymysql
import psutil
import datetime
import re

# Database Configuration (matches settings.py)
DB_HOST = "127.0.0.1"
DB_USER = "mailuser"
DB_PASS = "ChangeMe123!"
DB_NAME = "mailserver"

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )

def get_domain_stats(domain):
    """Calculate sent/received/top-sender via log parsing."""
    try:
        # Received: status=sent and to=<*@domain>
        received_cmd = f"sudo grep 'to=<.*@{domain}>' /var/log/mail.log | grep 'status=sent' | wc -l"
        received_count = int(subprocess.check_output(received_cmd, shell=True).decode().strip())

        # Sent: status=sent and from=<*@domain>
        sent_cmd = f"sudo grep 'from=<.*@{domain}>' /var/log/mail.log | grep 'status=sent' | wc -l"
        sent_count = int(subprocess.check_output(sent_cmd, shell=True).decode().strip())

        # Top Sender for this domain
        top_sender_cmd = f"sudo grep 'from=<.*@{domain}>' /var/log/mail.log | sed -n 's/.*from=<\\([^>]*\\)>.*/\\1/p' | sort | uniq -c | sort -nr | head -n 1"
        top_sender_raw = subprocess.check_output(top_sender_cmd, shell=True).decode().strip()
        
        top_sender = "N/A"
        if top_sender_raw:
            parts = top_sender_raw.split()
            if len(parts) >= 2:
                top_sender = parts[1]

        return {
            'sent': sent_count,
            'received': received_count,
            'top_sender': top_sender
        }
    except Exception as e:
        print(f"Error getting stats for {domain}: {e}")
        return {'sent': 0, 'received': 0, 'top_sender': "Error"}

def get_server_health():
    """Get system health metrics."""
    cpu = psutil.cpu_percent(interval=1)
    ram = psutil.virtual_memory().percent
    disk = psutil.disk_usage('/').percent
    
    # Get uptime
    with open('/proc/uptime', 'r') as f:
        uptime_seconds = float(f.readline().split()[0])
        uptime_string = str(datetime.timedelta(seconds=int(uptime_seconds)))

    return {
        'cpu': cpu,
        'ram': ram,
        'disk': disk,
        'uptime': uptime_string
    }

def main():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Update Server Health
            health = get_server_health()
            cursor.execute("""
                INSERT INTO server_health (cpu_usage, ram_usage, disk_usage, uptime)
                VALUES (%s, %s, %s, %s)
            """, (health['cpu'], health['ram'], health['disk'], health['uptime']))

            # 2. Get Domains
            cursor.execute("SELECT name FROM domains")
            domains = cursor.fetchall()

            for dom in domains:
                name = dom['name']
                stats = get_domain_stats(name)
                
                cursor.execute("""
                    INSERT INTO domain_stats (domain_name, sent_count, received_count, top_sender)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        sent_count = VALUES(sent_count),
                        received_count = VALUES(received_count),
                        top_sender = VALUES(top_sender)
                """, (name, stats['sent'], stats['received'], stats['top_sender']))

        conn.commit()
        print(f"Stats updated at {datetime.datetime.now()}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
