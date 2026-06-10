import os
import sys
import pymysql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("MAIL_DB_HOST") or os.getenv("DB_HOST") or "127.0.0.1"
DB_USER = os.getenv("MAIL_DB_USER") or os.getenv("DB_USER") or "mailuser"
DB_PASS = os.getenv("MAIL_DB_PASS") or os.getenv("DB_PASS")
DB_NAME = os.getenv("MAIL_DB_NAME") or os.getenv("DB_NAME") or "mailserver"


def connect():
    if not DB_PASS:
        raise RuntimeError("MAIL_DB_PASS or DB_PASS must be set; refusing to use an insecure default password")
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def table_exists(cursor, table_name):
    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.tables
        WHERE table_schema = %s AND table_name = %s
        """,
        (DB_NAME, table_name),
    )
    return cursor.fetchone()["count"] > 0


def column_exists(cursor, table_name, column_name):
    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        """,
        (DB_NAME, table_name, column_name),
    )
    return cursor.fetchone()["count"] > 0


def index_exists(cursor, table_name, index_name):
    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.statistics
        WHERE table_schema = %s AND table_name = %s AND index_name = %s
        """,
        (DB_NAME, table_name, index_name),
    )
    return cursor.fetchone()["count"] > 0


def add_column_if_missing(cursor, table_name, column_name, definition):
    if table_exists(cursor, table_name) and not column_exists(cursor, table_name, column_name):
        print(f"Adding {table_name}.{column_name}...")
        cursor.execute(f"ALTER TABLE `{table_name}` ADD COLUMN {definition}")


def migrate():
    print(f"Migrating database schema on {DB_HOST}/{DB_NAME} as {DB_USER}...")
    conn = None
    try:
        conn = connect()
        with conn.cursor() as cursor:
            add_column_if_missing(cursor, "domain_stats", "metrics_json", "`metrics_json` TEXT NULL")
            add_column_if_missing(cursor, "core_geouserexception", "service", "`service` VARCHAR(20) NOT NULL DEFAULT 'all'")
            add_column_if_missing(cursor, "core_geodomainpolicy", "augment_default", "`augment_default` TINYINT(1) NOT NULL DEFAULT 1")
            add_column_if_missing(cursor, "core_geosshpolicy", "augment_default", "`augment_default` TINYINT(1) NOT NULL DEFAULT 1")
            add_column_if_missing(cursor, "core_geoactiveban", "ban_count", "`ban_count` INT NOT NULL DEFAULT 1")

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS cloudflare_accounts (
                    id INT NOT NULL AUTO_INCREMENT,
                    cloudflare_account_id VARCHAR(64) NOT NULL,
                    name VARCHAR(255) NULL,
                    status VARCHAR(50) NULL DEFAULT 'active',
                    created_at DATETIME NULL,
                    updated_at DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_cloudflare_accounts_account_id (cloudflare_account_id),
                    KEY ix_cloudflare_accounts_cloudflare_account_id (cloudflare_account_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS cloudflare_credential_accounts (
                    id INT NOT NULL AUTO_INCREMENT,
                    credential_id INT NOT NULL,
                    cloudflare_account_id VARCHAR(64) NOT NULL,
                    created_at DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_cloudflare_credential_account (credential_id, cloudflare_account_id),
                    KEY ix_cloudflare_credential_accounts_account_id (cloudflare_account_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS managed_domains (
                    id INT NOT NULL AUTO_INCREMENT,
                    domain VARCHAR(255) NOT NULL,
                    zone_id VARCHAR(64) NULL,
                    cloudflare_account_id VARCHAR(64) NULL,
                    credential_id_last_used INT NULL,
                    source VARCHAR(50) NULL DEFAULT 'provisioned',
                    status VARCHAR(50) NULL DEFAULT 'active',
                    created_at DATETIME NULL,
                    updated_at DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_managed_domains_domain (domain),
                    KEY ix_managed_domains_domain (domain),
                    KEY ix_managed_domains_account_id (cloudflare_account_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS cloudflare_webmail_primaries (
                    id INT NOT NULL AUTO_INCREMENT,
                    cloudflare_account_id VARCHAR(64) NOT NULL,
                    primary_domain VARCHAR(255) NOT NULL,
                    primary_zone_id VARCHAR(64) NOT NULL,
                    primary_hostname VARCHAR(255) NOT NULL,
                    ipv4_record_id VARCHAR(64) NULL,
                    ipv6_record_id VARCHAR(64) NULL,
                    status VARCHAR(50) NULL DEFAULT 'active',
                    auto_promote_enabled TINYINT(1) NULL DEFAULT 1,
                    auto_repair_dns_enabled TINYINT(1) NULL DEFAULT 1,
                    created_at DATETIME NULL,
                    updated_at DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_cloudflare_webmail_primaries_account_id (cloudflare_account_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS domain_tls_assets (
                    id INT NOT NULL AUTO_INCREMENT,
                    domain VARCHAR(255) NOT NULL,
                    cloudflare_account_id VARCHAR(64) NULL,
                    origin_cert_id VARCHAR(64) NULL,
                    cert_path VARCHAR(512) NULL,
                    key_path VARCHAR(512) NULL,
                    covers_wildcard TINYINT(1) NULL DEFAULT 1,
                    expires_at DATETIME NULL,
                    status VARCHAR(50) NULL DEFAULT 'active',
                    created_at DATETIME NULL,
                    updated_at DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_domain_tls_assets_domain (domain),
                    KEY ix_domain_tls_assets_domain (domain)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )

            if table_exists(cursor, "domains"):
                cursor.execute(
                    """
                    INSERT INTO managed_domains (domain, source, status, created_at, updated_at)
                    SELECT d.name, 'provisioned', 'active', NOW(), NOW()
                    FROM domains d
                    LEFT JOIN managed_domains md ON md.domain = d.name
                    WHERE md.id IS NULL
                    """
                )
                print(f"Backfilled known mail domains: {cursor.rowcount}")

            conn.commit()
            print("Migration complete.")
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Migration failed: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if conn and conn.open:
            conn.close()


if __name__ == "__main__":
    migrate()
