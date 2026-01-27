#!/usr/bin/env python3
"""
Configure email aliases for zimpricecheck.com.

Aliases Summary:
1. business@zimpricecheck.com -> garikai@zimpricecheck.com, garikaib@gmail.com (forward only)
2. sales@zimpricecheck.com -> garikai@zimpricecheck.com, garikaib@gmail.com (forward only)
3. dns@zimpricecheck.com -> dns@zimpricecheck.com, garikaib@gmail.com, mrwilliamchui@gmail.com (dual+)
4. garikaib@zimpricecheck.com -> garikai@zimpricecheck.com (forward only)
5. garikai@zimpricecheck.com -> garikai@zimpricecheck.com, garikaib@gmail.com (dual delivery)
"""
import pymysql

DB_HOST, DB_USER, DB_NAME = "localhost", "mailuser", "mailserver"
DOMAIN = "zimpricecheck.com"

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
        host=DB_HOST, user=DB_USER, password=get_db_password(),
        database=DB_NAME, cursorclass=pymysql.cursors.DictCursor
    )
    
    # Get domain ID
    with conn.cursor() as c:
        c.execute("SELECT id FROM domains WHERE name=%s", (DOMAIN,))
        result = c.fetchone()
        if not result:
            print(f"✗ Domain {DOMAIN} not found!")
            return
        domain_id = result['id']
    
    # Define aliases
    # Format: (source, destinations)
    aliases = [
        # Forward-only aliases (no local delivery)
        ("business@zimpricecheck.com", "garikai@zimpricecheck.com, garikaib@gmail.com"),
        ("sales@zimpricecheck.com", "garikai@zimpricecheck.com, garikaib@gmail.com"),
        ("garikaib@zimpricecheck.com", "garikai@zimpricecheck.com"),
        
        # Dual delivery aliases (local + external)
        ("dns@zimpricecheck.com", "dns@zimpricecheck.com, garikaib@gmail.com, mrwilliamchui@gmail.com"),
        ("garikai@zimpricecheck.com", "garikai@zimpricecheck.com, garikaib@gmail.com"),
    ]
    
    with conn.cursor() as c:
        for source, destination in aliases:
            # Check if alias exists
            c.execute("SELECT id FROM aliases WHERE source=%s", (source,))
            existing = c.fetchone()
            
            if existing:
                # Update
                c.execute("UPDATE aliases SET destination=%s WHERE id=%s",
                          (destination, existing['id']))
                print(f"✓ Updated: {source} -> {destination}")
            else:
                # Insert
                c.execute("INSERT INTO aliases (domain_id, source, destination) VALUES (%s, %s, %s)",
                          (domain_id, source, destination))
                print(f"✓ Created: {source} -> {destination}")
        
        conn.commit()
    
    # Display final state
    print("\n--- Current aliases for zimpricecheck.com ---")
    with conn.cursor() as c:
        c.execute("SELECT source, destination FROM aliases WHERE domain_id=%s", (domain_id,))
        for row in c.fetchall():
            print(f"  {row['source']} -> {row['destination']}")
    
    conn.close()
    print("\n✅ Alias configuration complete!")

if __name__ == "__main__":
    main()
