import os
import logging
import re
import datetime
from fastapi import encoders

original_jsonable_encoder = encoders.jsonable_encoder
ISO_NAIVE_DATETIME_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$')

def append_utc_timezone_to_naive_iso_strings(item):
    if isinstance(item, str):
        if ISO_NAIVE_DATETIME_RE.match(item):
            return item + "Z"
        return item
    elif isinstance(item, dict):
        return {k: append_utc_timezone_to_naive_iso_strings(v) for k, v in item.items()}
    elif isinstance(item, list):
        return [append_utc_timezone_to_naive_iso_strings(i) for i in item]
    return item

def custom_jsonable_encoder(obj, *args, **kwargs):
    res = original_jsonable_encoder(obj, *args, **kwargs)
    return append_utc_timezone_to_naive_iso_strings(res)

encoders.jsonable_encoder = custom_jsonable_encoder
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from backend.app.core.database import engine, Base
from backend.app.models import (
    CloudflareAccount,
    CloudflareCredentialAccount,
    ManagedDomain,
    CloudflareWebmailPrimary,
    DomainTlsAsset
)
from backend.app.routes import auth, domains, users, aliases, system, console_users, registrations, geo_auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Attempt to automatically create tables in dev databases if needed
try:
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified/created successfully.")
except Exception as e:
    logger.error(f"Error initializing database tables: {e}")

def run_migrations():
    from sqlalchemy import text
    from backend.app.core.database import SessionLocal, use_sqlite
    db = SessionLocal()
    try:
        # 1. Migrate core_geouserexception for service column
        if use_sqlite:
            res = db.execute(text("PRAGMA table_info(core_geouserexception);")).all()
            cols = [r[1] for r in res]
            if "service" not in cols:
                logger.info("Running SQLite schema migration for core_geouserexception...")
                db.execute(text("ALTER TABLE core_geouserexception ADD COLUMN service VARCHAR(20) NOT NULL DEFAULT 'all';"))
                db.execute(text("DROP INDEX IF EXISTS ix_core_geouserexception_username;"))
                db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_geouserexception_user_service ON core_geouserexception(username, service);"))
                db.commit()
                logger.info("SQLite schema migration completed successfully.")
        else:
            try:
                db.execute(text("ALTER TABLE core_geouserexception ADD COLUMN service VARCHAR(20) NOT NULL DEFAULT 'all';"))
                db.commit()
                logger.info("Added service column to core_geouserexception.")
            except Exception:
                db.rollback()
            
            for index_name in ["username", "ix_core_geouserexception_username"]:
                try:
                    db.execute(text(f"ALTER TABLE core_geouserexception DROP INDEX {index_name};"))
                    db.commit()
                    logger.info(f"Dropped index {index_name} from core_geouserexception.")
                except Exception:
                    db.rollback()
            try:
                db.execute(text("ALTER TABLE core_geouserexception ADD UNIQUE KEY uq_geouserexception_user_service (username, service);"))
                db.commit()
                logger.info("Added unique index uq_geouserexception_user_service.")
            except Exception:
                db.rollback()

        # 2. Migrate policies for augment_default column
        if use_sqlite:
            # Check GeoDomainPolicy
            res = db.execute(text("PRAGMA table_info(core_geodomainpolicy);")).all()
            cols = [r[1] for r in res]
            if "augment_default" not in cols:
                logger.info("Adding augment_default to SQLite core_geodomainpolicy...")
                db.execute(text("ALTER TABLE core_geodomainpolicy ADD COLUMN augment_default BOOLEAN NOT NULL DEFAULT 1;"))
                db.commit()
            
            # Check GeoSshPolicy
            res = db.execute(text("PRAGMA table_info(core_geosshpolicy);")).all()
            cols = [r[1] for r in res]
            if "augment_default" not in cols:
                logger.info("Adding augment_default to SQLite core_geosshpolicy...")
                db.execute(text("ALTER TABLE core_geosshpolicy ADD COLUMN augment_default BOOLEAN NOT NULL DEFAULT 1;"))
                db.commit()
        else:
            try:
                db.execute(text("ALTER TABLE core_geodomainpolicy ADD COLUMN augment_default BOOLEAN NOT NULL DEFAULT 1;"))
                db.commit()
                logger.info("Added augment_default to MySQL core_geodomainpolicy.")
            except Exception:
                db.rollback()
            try:
                db.execute(text("ALTER TABLE core_geosshpolicy ADD COLUMN augment_default BOOLEAN NOT NULL DEFAULT 1;"))
                db.commit()
                logger.info("Added augment_default to MySQL core_geosshpolicy.")
            except Exception:
                db.rollback()

        # 3. Seed default regions if core_georegion is empty
        from backend.app.models import GeoRegion
        count = db.query(GeoRegion).count()
        if count == 0:
            logger.info("Pre-seeding default geo-auth regions...")
            default_regions = {
                "SADC": "AO,BW,KM,CD,SZ,LS,MG,MW,MU,MZ,NA,SC,ZA,TZ,ZM,ZW",
                "EUROPE": "AL,AD,AT,BY,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IS,IE,IT,LV,LI,LT,LU,MT,MD,MC,ME,NL,MK,NO,PL,PT,RO,RU,SM,RS,SK,SI,ES,SE,CH,UA,GB,VA",
                "NORTH AMERICA": "US,CA,MX",
                "MIDDLE EAST": "AE,SA,QA,BH,OM,YE,IL,JO,LB,SY,IQ,IR,TR",
                "WESTERN EUROPE": "BE,FR,DE,LU,NL,CH,GB,IE,AT,LI",
                "NORTH AFRICA": "EG,LY,TN,DZ,MA,EH,SD",
                "SOUTHERN AFRICA": "ZA,LS,SZ,NA,BW,MZ,ZW,ZM,AO,MW",
                "ASIA": "CN,JP,KR,IN,PK,BD,LK,NP,MM,TH,VN,MY,SG,ID,PH"
            }
            for name, countries in default_regions.items():
                db.add(GeoRegion(name=name, countries=countries))
            db.commit()
            logger.info("Pre-seeding of geo-auth regions complete.")

        # 4. Migrate core_geoactiveban for ban_count column
        if use_sqlite:
            res = db.execute(text("PRAGMA table_info(core_geoactiveban);")).all()
            cols = [r[1] for r in res]
            if "ban_count" not in cols:
                logger.info("Adding ban_count to SQLite core_geoactiveban...")
                db.execute(text("ALTER TABLE core_geoactiveban ADD COLUMN ban_count INTEGER NOT NULL DEFAULT 1;"))
                db.commit()
        else:
            try:
                db.execute(text("ALTER TABLE core_geoactiveban ADD COLUMN ban_count INT NOT NULL DEFAULT 1;"))
                db.commit()
                logger.info("Added ban_count to MySQL core_geoactiveban.")
            except Exception:
                db.rollback()

    except Exception as e:
        logger.error(f"Migration error: {e}")
    finally:
        db.close()


run_migrations()

app = FastAPI(
    title="ZimPrices Mail Admin API",
    description="Modern FastAPI-based API for controlling ZimPrices mail servers, DNS, SSL, and Webmail provisioners.",
    version="1.0.0"
)

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET_KEY", os.getenv("JWT_SECRET_KEY", "change-this-session-secret")),
    same_site="lax",
    https_only=os.getenv("ENVIRONMENT", "development") == "production",
)

# CORS configuration for React frontend integration
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
if os.getenv("ENVIRONMENT", "development").lower() == "production" and "*" in cors_origins:
    raise RuntimeError("CORS_ALLOWED_ORIGINS must not contain '*' in production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Register API routers
app.include_router(auth.router, prefix="/api")
app.include_router(domains.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(aliases.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(console_users.router, prefix="/api")
app.include_router(registrations.router, prefix="/api")
app.include_router(geo_auth.router, prefix="/api")

@app.get("/api/health")
def api_health():
    """Simple API health check endpoint."""
    return {"status": "healthy", "service": "ZimPrices Mail Admin Backend"}

# Serve Frontend SPA static files in production
# Root of deployment is /opt/mail_admin/ (backend is at /opt/mail_admin/backend)
# Frontend is built to /opt/mail_admin/frontend/dist
frontend_dir = "/opt/mail_admin/frontend/dist"
if not os.path.exists(frontend_dir):
    # Fallback to local workspace paths for testing/dev
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

if os.path.exists(frontend_dir) and os.path.exists(os.path.join(frontend_dir, "index.html")):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    
    logger.info(f"Serving frontend static assets from: {frontend_dir}")
    
    # Mount assets folder
    assets_dir = os.path.join(frontend_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
        
    @app.get("/{catchall:path}")
    def serve_frontend_spa(catchall: str):
        # Exclude API endpoints from routing to index.html
        if catchall.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(os.path.join(frontend_dir, "index.html"))
else:
    logger.warning(f"Frontend dist directory not found at: {frontend_dir}. Running in API-only mode.")
