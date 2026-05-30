import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Load DB config from env
DB_HOST = os.getenv("MAIL_DB_HOST", "")
DB_USER = os.getenv("MAIL_DB_USER", "mailuser")
DB_PASS = os.getenv("MAIL_DB_PASS", "")
DB_NAME = os.getenv("MAIL_DB_NAME", "mailserver")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

# Check if we should fall back to SQLite (no host specified, or running in local dev with default 127.0.0.1 but connection refused)
use_sqlite = False
if ENVIRONMENT == "development" and not DB_HOST:
    use_sqlite = True

if use_sqlite:
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "dev_mailserver.db"))
    DATABASE_URL = f"sqlite:///{db_path}"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    # Default to 127.0.0.1 if host not specified but we aren't using sqlite
    host = DB_HOST if DB_HOST else "127.0.0.1"
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{host}:3306/{DB_NAME}"
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """
    FastAPI Dependency to get DB session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
