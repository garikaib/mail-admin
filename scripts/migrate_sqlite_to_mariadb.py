import os
import sqlite3
import pymysql

def load_env(path):
    env = {}
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env[key] = value.strip('"').strip("'")
    return env

def migrate():
    env = load_env('/opt/mail_admin/.env')
    
    sqlite_path = '/opt/mail_admin/db.sqlite3'
    if not os.path.exists(sqlite_path):
        print(f"SQLite database not found at {sqlite_path}")
        return

    # MariaDB config from manual env parse
    db_host = env.get('MAIL_DB_HOST', 'localhost')
    db_user = env.get('MAIL_DB_USER', 'mailuser')
    db_pass = env.get('MAIL_DB_PASS', 'ChangeMe123!')
    db_name = env.get('MAIL_DB_NAME', 'mailserver')

    try:
        lite_conn = sqlite3.connect(sqlite_path)
        lite_cur = lite_conn.cursor()

        maria_conn = pymysql.connect(
            host=db_host,
            user=db_user,
            password=db_pass,
            database=db_name,
            cursorclass=pymysql.cursors.DictCursor
        )
        maria_cur = maria_conn.cursor()

        # 1. Migrate MailPlan
        print("Migrating MailPlan...")
        lite_cur.execute("SELECT id, name, max_users, max_aliases, quota_mb, is_default FROM core_mailplan")
        plans = lite_cur.fetchall()
        for plan in plans:
            try:
                sql = "INSERT INTO core_mailplan (id, name, max_users, max_aliases, quota_mb, is_default) VALUES (%s, %s, %s, %s, %s, %s)"
                maria_cur.execute(sql, plan)
                print(f"  Migrated plan: {plan[1]}")
            except pymysql.err.IntegrityError:
                print(f"  Plan {plan[1]} already exists.")
            except Exception as err:
                print(f"  Error migrating plan {plan[1]}: {err}")
        maria_conn.commit()

        # 2. Migrate DomainAllocation
        print("Migrating DomainAllocation...")
        lite_cur.execute("SELECT id, domain_name, assigned_at, plan_id FROM core_domainallocation")
        allocs = lite_cur.fetchall()
        for alloc in allocs:
            try:
                sql = "INSERT INTO core_domainallocation (id, domain_name, assigned_at, plan_id) VALUES (%s, %s, %s, %s)"
                maria_cur.execute(sql, alloc)
                print(f"  Migrated allocation for: {alloc[1]}")
            except pymysql.err.IntegrityError:
                print(f"  Allocation for {alloc[1]} already exists.")
            except Exception as err:
                print(f"  Error migrating allocation {alloc[1]}: {err}")
        maria_conn.commit()
        
        # 3. Migrate Users (auth_user)
        print("Migrating Platform Users...")
        try:
            lite_cur.execute("SELECT id, password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined FROM auth_user")
            users = lite_cur.fetchall()
            for user in users:
                try:
                    sql = "INSERT INTO auth_user (id, password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
                    maria_cur.execute(sql, user)
                    print(f"  Migrated user: {user[4]}")
                except pymysql.err.IntegrityError:
                    print(f"  User {user[4]} already exists.")
                except Exception as err:
                    print(f"  Error migrating user {user[4]}: {err}")
            maria_conn.commit()
        except Exception as e:
            print(f"  Skipping Users migration: {e}")

        # 4. Migrate DomainAssignment
        print("Migrating DomainAssignment...")
        try:
            lite_cur.execute("SELECT id, domain_name, assigned_at, user_id FROM core_domainassignment")
            assignments = lite_cur.fetchall()
            for assign in assignments:
                try:
                    sql = "INSERT INTO core_domainassignment (id, domain_name, assigned_at, user_id) VALUES (%s, %s, %s, %s)"
                    maria_cur.execute(sql, assign)
                    print(f"  Migrated assignment for: {assign[1]}")
                except pymysql.err.IntegrityError:
                    print(f"  Assignment for {assign[1]} already exists.")
                except Exception as err:
                    print(f"  Error migrating assignment {assign[1]}: {err}")
            maria_conn.commit()
        except Exception as e:
            print(f"  Skipping DomainAssignment migration (expected if not in SQLite): {e}")

        print("\n✅ Migration steps finished!")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
    finally:
        if 'lite_conn' in locals(): lite_conn.close()
        if 'maria_conn' in locals(): maria_conn.close()

if __name__ == "__main__":
    migrate()

if __name__ == "__main__":
    migrate()
