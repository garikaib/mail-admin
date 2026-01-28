import pymysql
import sys

# Database Configuration
DB_HOST = "127.0.0.1"
DB_USER = "mailuser"
DB_PASS = "ChangeMe123!"
DB_NAME = "mailserver"

def migrate():
    print("Migrating Database Schema...")
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASS,
            database=DB_NAME,
            cursorclass=pymysql.cursors.DictCursor
        )
        with conn.cursor() as cursor:
            # Check if metrics_json exists
            cursor.execute("DESCRIBE domain_stats")
            columns = [col['Field'] for col in cursor.fetchall()]
            
            if 'metrics_json' not in columns:
                print("Adding metrics_json column...")
                cursor.execute("ALTER TABLE domain_stats ADD COLUMN metrics_json TEXT")
                conn.commit()
                print("Column metrics_json added.")
            else:
                print("Column metrics_json already exists.")
                
    except Exception as e:
        print(f"Migration Failed: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals() and conn.open:
            conn.close()

if __name__ == "__main__":
    migrate()
