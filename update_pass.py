import crypt
import pymysql
import sys

def hash_password(password):
    return crypt.crypt(password, crypt.mksalt(crypt.METHOD_SHA512))

if len(sys.argv) < 2:
    print("Usage: python3 update_pass.py <password>")
    sys.exit(1)

email = "admin@zimprices.co.zw"
password = sys.argv[1]

try:
    conn = pymysql.connect(
        host="127.0.0.1",
        user="mailuser",
        password="ChangeMe123!",
        database="mailserver"
    )
    with conn.cursor() as cursor:
        password_hash = hash_password(password)
        cursor.execute("UPDATE users SET c_password = %s WHERE mail = %s", (password_hash, email))
    conn.commit()
    print(f"Successfully updated password for {email}")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
finally:
    if 'conn' in locals():
        conn.close()
