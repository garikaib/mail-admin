#!/usr/bin/env python3
"""
Update aliases for dual delivery (local + external).
"""
import pymysql

DB_HOST, DB_USER, DB_NAME = "localhost", "mailuser", "mailserver"

def get_db_password():
    try:
        with open("/etc/dovecot/dovecot-sql.conf.ext") as f:
            for line in f:
                if "password=" in line:
                    return line.split("password=")[1].strip().strip('"')
    except:
        pass
    return None

def main():
    conn = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=get_db_password(),
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )
    
    # Dual delivery updates: local mailbox + external Gmail
    updates = [
        (1, "info@crystalcred.co.zw, crystalcredzim@gmail.com"),
        (2, "innocent@crystalcred.co.zw, crystalcredzim@gmail.com"),
        (3, "jmnyoni@crystalcred.co.zw, jmnyoni6@gmail.com"),
        (4, "sales@crystalcred.co.zw, crystalcredzim@gmail.com"),
    ]
    
    with conn.cursor() as cursor:
        for alias_id, destination in updates:
            cursor.execute(
                "UPDATE aliases SET destination = %s WHERE id = %s",
                (destination, alias_id)
            )
            print(f"✓ Updated alias id={alias_id} -> {destination}")
        conn.commit()
    
    # Verify
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM aliases WHERE domain_id = 3")
        print("\n--- Current aliases for crystalcred.co.zw ---")
        for row in cursor.fetchall():
            print(f"  {row['source']} -> {row['destination']}")
    
    conn.close()
    print("\n✅ Dual delivery configured successfully!")

if __name__ == "__main__":
    main()
