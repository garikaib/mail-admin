#!/usr/bin/env python3
import crypt
import subprocess
import pymysql
import sys

# DB Credentials (hardcoded based on previous setups)
DB_HOST = "127.0.0.1"
DB_USER = "mailuser"
DB_PASS = "ChangeMe123!"
DB_NAME = "mailserver"

TEST_USER = "gbdzoma@zimprices.co.zw"
TEST_PASS = "ChangeMe123!"

def get_db_hash():
    conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
    try:
        with conn.cursor() as cursor:
            # Note: We are using c_password based on previous schema updates
            cursor.execute("SELECT c_password FROM users WHERE mail=%s", (TEST_USER,))
            result = cursor.fetchone()
            return result[0] if result else None
    finally:
        conn.close()

def update_db_hash(new_hash):
    conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET c_password=%s WHERE mail=%s", (new_hash, TEST_USER))
        conn.commit()
        print(f"Updated password hash for {TEST_USER}")
    finally:
        conn.close()

def main():
    print(f"--- Debugging Auth for {TEST_USER} ---")
    
    # 1. Check current hash in DB
    current_hash = get_db_hash()
    print(f"Current Hash in DB: {current_hash}")
    
    if not current_hash:
        print("User not found!")
        return

    # 2. Test if python's crypt can verify it
    # Note: crypt.crypt(word, salt) where salt is the full hash string usually works for verification
    try:
        calculated = crypt.crypt(TEST_PASS, current_hash)
        if calculated == current_hash:
            print("PYTHON VERIFICATION: SUCCESS (The hash is valid for this system's crypt library)")
        else:
            print(f"PYTHON VERIFICATION: FAILED")
            print(f"  Input: {TEST_PASS}")
            print(f"  Expected: {current_hash}")
            print(f"  Got:      {calculated}")
    except Exception as e:
        print(f"PYTHON VERIFICATION ERROR: {e}")

    # 3. Generate a safe MD5-CRYPT hash ($1$) which is universally supported
    # SOGo with 'crypt' usually handles standard crypt() output. 
    # Let's generate a new one using Python's crypt (defaults to sha512 usually on linux, but we can force it or let it decide)
    # Actually, let's try a standard SHA-512 crypt which is the default on modern Linux ($6$)
    
    print("\n--- Generating Fresh Hash ---")
    # salt is automatically generated if not provided, usually $6$...
    new_hash = crypt.crypt(TEST_PASS, crypt.mksalt(crypt.METHOD_SHA512))
    print(f"Generated new SHA512 hash: {new_hash}")
    
    # Update DB
    update_db_hash(new_hash)
    
    # Verify again locally
    check = crypt.crypt(TEST_PASS, new_hash)
    if check == new_hash:
        print("Verification of new hash: SUCCESS")
    else:
        print("Verification of new hash: FAILED (This shouldn't happen)")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
