import logging
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from authlib.integrations.starlette_client import OAuth, OAuthError
from backend.app.core.database import get_db
from backend.app.core.security import verify_password, hash_password, create_access_token, decode_access_token
from backend.app.core.dependencies import get_current_user
from backend.app.core.permissions import permissions_for, role_names, is_super_admin
from backend.app.models import MailUser, AuthUser, AdminLog, AuthIdentity
from backend.app.schemas import Token, LoginRequest, PasswordChangeRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])

oauth = OAuth()
if os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"):
    oauth.register(
        name="google",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


def _token_response(user: AuthUser, db: Session) -> dict:
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "email": user.username,
        "is_superuser": is_super_admin(user),
        "has_password": bool(user.password),
        "permissions": permissions_for(user, db),
        "roles": sorted(role_names(user, db)),
    }


def _frontend_auth_redirect(token: str) -> RedirectResponse:
    frontend_url = os.getenv("FRONTEND_URL", "/")
    response = RedirectResponse(frontend_url)
    response.set_cookie(
        key="mail_admin_google_token",
        value=token,
        max_age=120,
        httponly=True,
        secure=os.getenv("ENVIRONMENT", "development").lower() == "production",
        samesite="lax",
        path="/api/auth/session-token",
    )
    return response

def audit_log(db: Session, admin_email: str, action: str, target: str, details: str = ""):
    """Helper to log administrative actions."""
    try:
        log_entry = AdminLog(
            admin_email=admin_email,
            action=action,
            target=target,
            details=details
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

import requests

def verify_turnstile(token: str) -> bool:
    secret = os.getenv("TURNSTILE_SECRET_KEY")
    if not secret:
        return True
    if not token:
        return False
    try:
        response = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": secret,
                "response": token,
            },
            timeout=5.0
        )
        if response.status_code == 200:
            result = response.json()
            return result.get("success", False)
    except Exception as e:
        logger.error(f"Turnstile verification exception: {e}")
    return False

@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    OAuth2 standard login endpoint. Authenticates against MariaDB users table (SHA512-CRYPT).
    On success, creates/syncs local AuthUser and returns a JWT token.
    """
    username = form_data.username.strip().lower()
    password = form_data.password
    
    # 0. Verify Turnstile if configured
    turnstile_secret = os.getenv("TURNSTILE_SECRET_KEY")
    if turnstile_secret:
        try:
            form = await request.form()
            token = form.get("cf-turnstile-response") or form.get("turnstile_token")
            if not verify_turnstile(token):
                logger.warning(f"Login failed: Cloudflare Turnstile verification failed for {username}.")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Turnstile verification failed"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error parsing form for turnstile: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Turnstile verification validation error"
            )

    # 1. Query user from AuthUser (internal admin users)
    auth_user = db.query(AuthUser).filter(AuthUser.username == username).first()
    
    is_authenticated = False
    if auth_user and auth_user.password:
        if verify_password(password, auth_user.password):
            is_authenticated = True
            logger.info(f"Admin user {username} authenticated via AuthUser.")
        else:
            logger.warning(f"Login failed: Invalid password for admin user {username}.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
    if not is_authenticated:
        # Fallback to legacy mail server user
        mail_user = db.query(MailUser).filter(MailUser.email == username).first()
        if not mail_user:
            logger.warning(f"Login failed: User {username} not found in admin or mail users database.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        # Verify legacy mail server user password
        if not verify_password(password, mail_user.password):
            logger.warning(f"Login failed: Invalid password for mail user {username}.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        # If they don't have an AuthUser record yet, create one
        if not auth_user:
            logger.info(f"Creating AuthUser record for first-time login of mailbox user {username}")
            auth_user = AuthUser(
                username=username,
                password="",  # Hashed in external mailserver, we don't store it here
                email=username,
                first_name=mail_user.name or mail_user.full_name or "User",
                last_name="",
                is_superuser=False,
                is_staff=False,
                is_active=True,
                date_joined=datetime.utcnow()
            )
            db.add(auth_user)
            db.flush()
    
    auth_user.last_login = datetime.utcnow()
    db.commit()
    
    audit_log(db, username, "LOGIN", username, "User successfully logged in via API")
    logger.info(f"User {username} successfully logged in.")

    return _token_response(auth_user, db)

@router.post("/login-json", response_model=Token)
async def login_json(
    request: Request,
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    JSON Login endpoint alternative to OAuth2 form data.
    """
    # Verify turnstile directly
    turnstile_secret = os.getenv("TURNSTILE_SECRET_KEY")
    if turnstile_secret:
        if not verify_turnstile(credentials.turnstile_token):
            logger.warning(f"Login-json failed: Cloudflare Turnstile verification failed for {credentials.username}.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Turnstile verification failed"
            )
            
    class FakeForm:
        def __init__(self, username, password):
            self.username = username
            self.password = password
            
    fake_form = FakeForm(credentials.username, credentials.password)
    return await login(request=request, form_data=fake_form, db=db)

@router.get("/me")
def get_me(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Get profile details of current authenticated user.
    """
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_superuser": is_super_admin(current_user),
        "has_password": bool(current_user.password),
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "is_active": current_user.is_active,
        "permissions": permissions_for(current_user, db),
        "roles": sorted(role_names(current_user, db)),
    }


@router.post("/session-token")
def consume_google_session_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Exchange the short-lived Google redirect cookie for the standard auth payload.
    """
    token = request.cookies.get("mail_admin_google_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending Google session")

    payload = decode_access_token(token)
    username = payload.get("sub") if payload else None
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google session")

    auth_user = db.query(AuthUser).filter(AuthUser.username == username).first()
    if not auth_user or not auth_user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google session")

    response.delete_cookie(
        key="mail_admin_google_token",
        path="/api/auth/session-token",
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "email": auth_user.username,
        "is_superuser": is_super_admin(auth_user),
        "has_password": bool(auth_user.password),
        "permissions": permissions_for(auth_user, db),
        "roles": sorted(role_names(auth_user, db)),
    }


@router.get("/google/login")
async def google_login(request: Request):
    """Start Google OpenID Connect login using Authlib."""
    if not hasattr(oauth, "google"):
        raise HTTPException(status_code=503, detail="Google login is not configured")
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """Complete Google login and link/create the local platform account."""
    if not hasattr(oauth, "google"):
        raise HTTPException(status_code=503, detail="Google login is not configured")
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as e:
        raise HTTPException(status_code=401, detail=f"Google login failed: {e.error}")

    userinfo = token.get("userinfo")
    if userinfo is None:
        userinfo = await oauth.google.parse_id_token(request, token)

    subject = userinfo.get("sub")
    email = (userinfo.get("email") or "").strip().lower()
    if not subject or not email:
        raise HTTPException(status_code=401, detail="Google account did not return a verified identity")

    identity = db.query(AuthIdentity).filter(
        AuthIdentity.provider == "google",
        AuthIdentity.subject == subject,
    ).first()

    if identity:
        auth_user = identity.user
    else:
        auth_user = db.query(AuthUser).filter(AuthUser.username == email).first()
        if not auth_user:
            auth_user = AuthUser(
                username=email,
                password="",
                email=email,
                first_name=userinfo.get("given_name") or userinfo.get("name") or "User",
                last_name=userinfo.get("family_name") or "",
                is_superuser=False,
                is_staff=False,
                is_active=True,
                date_joined=datetime.utcnow(),
            )
            db.add(auth_user)
            db.flush()
        identity = AuthIdentity(
            user_id=auth_user.id,
            provider="google",
            subject=subject,
            email=email,
        )
        db.add(identity)

    auth_user.last_login = datetime.utcnow()
    db.commit()
    audit_log(db, auth_user.username, "LOGIN_GOOGLE", auth_user.username, "User logged in with Google OIDC")

    token_response = _token_response(auth_user, db)
    if os.getenv("GOOGLE_LOGIN_REDIRECT", "json") == "redirect":
        return _frontend_auth_redirect(token_response["access_token"])
    return token_response


@router.post("/change-password")
def change_password(
    request: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    """
    Allow any user to change their password or set one if they used social login.
    """
    db_user = db.query(AuthUser).filter(AuthUser.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if db_user.password:
        if not request.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to change password"
            )
        if not verify_password(request.current_password, db_user.password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid current password"
            )

    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long"
        )

    db_user.password = hash_password(request.new_password)
    db.commit()

    audit_log(db, db_user.username, "CHANGE_PASSWORD", db_user.username, "User changed/set their own console password")

    return {"message": "Password updated successfully"}
