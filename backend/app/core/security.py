import logging
import base64
import os
from datetime import datetime, timedelta
from typing import Tuple, Union
from jose import jwt, JWTError
from passlib.hash import sha512_crypt
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

# These can be loaded from .env
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    if ENVIRONMENT == "production":
        raise RuntimeError("JWT_SECRET_KEY must be set in production")
    JWT_SECRET_KEY = "dev-only-jwt-secret-change-me"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days

# ----------------- Hashing Utilities -----------------


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify plain password against a SHA512-CRYPT hash.
    Handles optional {SHA512-CRYPT} prefix.
    """
    if hashed_password.startswith('{SHA512-CRYPT}'):
        hashed_password = hashed_password.replace('{SHA512-CRYPT}', '', 1)
    try:
        return sha512_crypt.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"Password verification failed: {e}")
        return False

def hash_password(password: str) -> str:
    """
    Hash a password using SHA512-CRYPT.
    """
    return sha512_crypt.hash(password)

# ----------------- JWT Utilities -----------------

def create_access_token(data: dict, expires_delta: Union[timedelta, None] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Union[dict, None]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# ----------------- Server-Side Secret Encryption Utilities -----------------

def get_secret_encryption_key() -> str:
    """
    Return the server-controlled key used to encrypt operational secrets.

    This replaces the old user-entered encryption password model. In production this
    must come from deployment secret storage and should be rotated deliberately.
    """
    key = os.getenv("SECRET_ENCRYPTION_KEY")
    if not key:
        if ENVIRONMENT == "production":
            raise RuntimeError("SECRET_ENCRYPTION_KEY must be set in production")
        key = os.getenv("JWT_SECRET_KEY", "dev-only-secret-encryption-key-change-me")
    return key


def derive_key(password: str, salt: bytes) -> bytes:
    """
    Derive a 32-byte URL-safe base64-encoded key from a password and salt.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))

def encrypt_value(value: str, password: str) -> Tuple[bytes, bytes]:
    """
    Encrypt a string value using a password.
    Returns (encrypted_data_bytes, salt_bytes).
    """
    salt = os.urandom(16)
    key = derive_key(password, salt)
    f = Fernet(key)
    token = f.encrypt(value.encode())
    return token, salt

def decrypt_value(encrypted_data: bytes, salt: bytes, password: str) -> str:
    """
    Decrypt bytes using the password and salt.
    Returns the original string.
    Raises cryptography.fernet.InvalidToken if password is wrong.
    """
    try:
        key = derive_key(password, salt)
        f = Fernet(key)
        decrypted = f.decrypt(encrypted_data).decode()
        logger.debug("Secret decryption: SUCCESS")
        return decrypted
    except Exception as e:
        logger.error(f"Secret decryption: FAILED ({type(e).__name__})")
        raise e


def encrypt_secret(value: str) -> Tuple[bytes, bytes]:
    return encrypt_value(value, get_secret_encryption_key())

def decrypt_secret(encrypted_data: bytes, salt: bytes) -> str:
    return decrypt_value(encrypted_data, salt, get_secret_encryption_key())
