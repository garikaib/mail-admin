#!/usr/bin/env python3
"""
Mail Server Admin Tool
Manage users for zimprices.co.zw mail server.
"""
import crypt
import secrets
import string
import sys
import pymysql

# Configuration
DB_HOST = "127.0.0.1"
DB_USER = "mailuser"
DB_PASS = "ChangeMe123!"
DB_NAME = "mailserver"
DOMAIN = "zimprices.co.zw"
VMAIL_BASE = "/var/vmail"

# Password Policy
MIN_LENGTH = 16
REQUIRE_UPPER = True
REQUIRE_LOWER = True
REQUIRE_DIGIT = True
REQUIRE_SPECIAL = True


def get_db_connection():
    """Get database connection."""
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )


def generate_password(length: int = MIN_LENGTH) -> str:
    """Generate a secure password that meets policy requirements."""
    if length < MIN_LENGTH:
        length = MIN_LENGTH
    
    # Character pools
    upper = string.ascii_uppercase
    lower = string.ascii_lowercase
    digits = string.digits
    special = "!@#$%^&*()-_=+[]{}|;:,.<>?"
    
    # Ensure at least one of each required type
    password_chars = []
    if REQUIRE_UPPER:
        password_chars.append(secrets.choice(upper))
    if REQUIRE_LOWER:
        password_chars.append(secrets.choice(lower))
    if REQUIRE_DIGIT:
        password_chars.append(secrets.choice(digits))
    if REQUIRE_SPECIAL:
        password_chars.append(secrets.choice(special))
    
    # Fill remaining length with random mix
    all_chars = upper + lower + digits + special
    remaining = length - len(password_chars)
    password_chars.extend(secrets.choice(all_chars) for _ in range(remaining))
    
    # Shuffle to avoid predictable positions
    secrets.SystemRandom().shuffle(password_chars)
    
    return ''.join(password_chars)


def hash_password(password: str) -> str:
    """Generate SHA512-CRYPT hash for password."""
    return crypt.crypt(password, crypt.mksalt(crypt.METHOD_SHA512))


def list_users():
    """List all users."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT c_uid, mail FROM users ORDER BY mail")
            users = cursor.fetchall()
            
        print("\n" + "=" * 50)
        print("CURRENT USERS")
        print("=" * 50)
        if users:
            for i, user in enumerate(users, 1):
                print(f"  {i}. {user['mail']}")
        else:
            print("  No users found.")
        print("=" * 50)
        return users
    finally:
        conn.close()


def add_user():
    """Add a new user."""
    print("\n" + "=" * 50)
    print("ADD NEW USER")
    print("=" * 50)
    
    username = input(f"Enter username (without @{DOMAIN}): ").strip().lower()
    if not username:
        print("❌ Username cannot be empty.")
        return
    
    email = f"{username}@{DOMAIN}"
    
    # Check if user exists
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM users WHERE mail = %s", (email,))
            if cursor.fetchone():
                print(f"❌ User {email} already exists.")
                return
            
            # Get domain ID
            cursor.execute("SELECT id FROM domains WHERE name = %s", (DOMAIN,))
            domain = cursor.fetchone()
            if not domain:
                print(f"❌ Domain {DOMAIN} not found in database.")
                return
            domain_id = domain['id']
        
        # Generate password
        password = generate_password()
        password_hash = hash_password(password)
        
        # Insert user
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO users (c_uid, c_name, c_password, c_cn, mail, domain_id)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (email, email, password_hash, username, email, domain_id))
        conn.commit()
        
        # Create maildir
        import subprocess
        maildir = f"{VMAIL_BASE}/{DOMAIN}/{username}"
        subprocess.run(["mkdir", "-p", maildir], check=True)
        subprocess.run(["chown", "-R", "vmail:vmail", f"{VMAIL_BASE}/{DOMAIN}"], check=True)
        
        print("\n" + "=" * 50)
        print("✅ USER CREATED SUCCESSFULLY")
        print("=" * 50)
        print(f"  Email:    {email}")
        print(f"  Password: {password}")
        print("=" * 50)
        print("⚠️  SAVE THIS PASSWORD - IT WILL NOT BE SHOWN AGAIN!")
        print("=" * 50)
        
    finally:
        conn.close()


def update_password():
    """Update password for existing user."""
    users = list_users()
    if not users:
        return
    
    print("\nUPDATE PASSWORD")
    print("-" * 50)
    
    email = input("Enter email address to update: ").strip().lower()
    if not email:
        print("❌ Email cannot be empty.")
        return
    
    # Add domain if not present
    if "@" not in email:
        email = f"{email}@{DOMAIN}"
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM users WHERE mail = %s", (email,))
            if not cursor.fetchone():
                print(f"❌ User {email} not found.")
                return
        
        # Generate new password
        password = generate_password()
        password_hash = hash_password(password)
        
        # Update
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET c_password = %s WHERE mail = %s",
                (password_hash, email)
            )
        conn.commit()
        
        print("\n" + "=" * 50)
        print("✅ PASSWORD UPDATED SUCCESSFULLY")
        print("=" * 50)
        print(f"  Email:        {email}")
        print(f"  New Password: {password}")
        print("=" * 50)
        print("⚠️  SAVE THIS PASSWORD - IT WILL NOT BE SHOWN AGAIN!")
        print("=" * 50)
        
    finally:
        conn.close()


def delete_user():
    """Delete a user."""
    users = list_users()
    if not users:
        return
    
    print("\nDELETE USER")
    print("-" * 50)
    print("⚠️  This will permanently delete the user and their mailbox!")
    
    email = input("Enter email address to delete: ").strip().lower()
    if not email:
        print("❌ Email cannot be empty.")
        return
    
    if "@" not in email:
        email = f"{email}@{DOMAIN}"
    
    confirm = input(f"Type 'DELETE' to confirm deletion of {email}: ").strip()
    if confirm != "DELETE":
        print("❌ Deletion cancelled.")
        return
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE mail = %s", (email,))
            if cursor.rowcount == 0:
                print(f"❌ User {email} not found.")
                return
        conn.commit()
        
        print(f"✅ User {email} deleted.")
        print("   Note: Mailbox files were NOT deleted from disk.")
        
    finally:
        conn.close()


def show_menu():
    """Display main menu."""
    print("\n" + "=" * 50)
    print("   MAIL SERVER ADMIN - zimprices.co.zw")
    print("=" * 50)
    print("  1. List Users")
    print("  2. Add User")
    print("  3. Update Password")
    print("  4. Delete User")
    print("  0. Exit")
    print("=" * 50)


def main():
    """Main entry point."""
    while True:
        show_menu()
        choice = input("Select option: ").strip()
        
        if choice == "1":
            list_users()
        elif choice == "2":
            add_user()
        elif choice == "3":
            update_password()
        elif choice == "4":
            delete_user()
        elif choice == "0":
            print("Goodbye!")
            sys.exit(0)
        else:
            print("❌ Invalid option. Please try again.")


if __name__ == "__main__":
    main()
