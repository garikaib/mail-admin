
import os
from pathlib import Path
from dotenv import load_dotenv

def load_secrets():
    """
    Load environment variables from the standard location.
    Prioritizes /opt/mail_admin/.env if present, otherwise checks local .env.
    """
    # Potential paths for .env
    env_paths = [
        Path('/opt/mail_admin/.env'),  # Production
        Path(__file__).parent.parent.parent / 'mail_admin/.env', # Local Dev (relative to this file in scripts/core)
        Path('.env') # CWD Fallback
    ]

    env_loaded = False
    for path in env_paths:
        if path.exists():
            load_dotenv(path)
            env_loaded = True
            break
    
    # Return a dictionary of critical secrets, or just allow access via os.getenv
    # Returning dict for explicit checking
    return {
        'CLOUDFLARE_API_KEY': os.getenv('CLOUDFLARE_API_KEY'),
        'MAIL_DB_PASS': os.getenv('MAIL_DB_PASS'),
        'SECRET_KEY': os.getenv('SECRET_KEY'),
        'EMAIL_HOST_PASSWORD': os.getenv('EMAIL_HOST_PASSWORD'),
        'REPORTS_EMAIL_PASSWORD': os.getenv('REPORTS_EMAIL_PASSWORD'),
        'loaded_from': str(path) if env_loaded else None
    }

