import logging
from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.security import decode_access_token
from backend.app.core.permissions import require_permission
from backend.app.models import AuthUser

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> AuthUser:
    """
    Get the current authenticated user based on JWT token.
    Queries the auth_user table using the username (which stores the user's email).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
        
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
        
    # Query auth_user by username (which holds the email)
    user = db.query(AuthUser).filter(AuthUser.username == username).first()
    if user is None:
        raise credentials_exception
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
        
    return user

def get_current_superuser(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
) -> AuthUser:
    """
    Ensure the current user has global administrator privileges.
    """
    require_permission(current_user, db, "system:logs")
    return current_user
