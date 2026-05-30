import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from backend.app.core.database import engine, Base
from backend.app.routes import auth, domains, users, aliases, system, console_users, registrations

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Attempt to automatically create tables in dev databases if needed
try:
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified/created successfully.")
except Exception as e:
    logger.error(f"Error initializing database tables: {e}")

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
            return {"detail": "Not Found"}
        return FileResponse(os.path.join(frontend_dir, "index.html"))
else:
    logger.warning(f"Frontend dist directory not found at: {frontend_dir}. Running in API-only mode.")
