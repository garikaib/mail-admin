#!/usr/bin/env python3
"""Configure email aliases for chadzi.co.zw using MariaDB CLI."""
import subprocess

DOMAIN = "chadzi.co.zw"

def run_sql(sql):
    """Run SQL command via mariadb CLI."""
    cmd = ["mariadb", "-N", "-s", "-e", sql]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return r.stdout.strip()

def main():
    print(f"Setting up aliases for {DOMAIN}...")
    
    # 1. Get domain ID
    domain_id = run_sql(f"SELECT id FROM mailserver.domains WHERE name='{DOMAIN}'")
    if not domain_id:
        print(f"✗ Domain {DOMAIN} not found!")
        return
    
    # 2. Define aliases
    # Format: (source, destination)
    forwardees = "garikai@zimpricecheck.com, garikaib@gmail.com"
    aliases = [
        (f"info@{DOMAIN}", f"info@{DOMAIN}, {forwardees}"),
        (f"dmudzuri@{DOMAIN}", f"dmudzuri@{DOMAIN}, {forwardees}")
    ]
    
    for source, destination in aliases:
        # Check if alias exists
        alias_id = run_sql(f"SELECT id FROM mailserver.aliases WHERE source='{source}'")
        
        if alias_id:
            # Update
            subprocess.run(["mariadb", "-e", f"UPDATE mailserver.aliases SET destination='{destination}' WHERE id={alias_id}"], check=True)
            print(f"✓ Updated: {source} -> {destination}")
        else:
            # Insert
            subprocess.run(["mariadb", "-e", f"INSERT INTO mailserver.aliases (domain_id, source, destination) VALUES ({domain_id}, '{source}', '{destination}')"], check=True)
            print(f"✓ Created: {source} -> {destination}")
            
    print("\n✅ Alias configuration complete!")

if __name__ == "__main__":
    main()
