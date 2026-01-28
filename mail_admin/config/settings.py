"""
Django settings for config project.
"""

from pathlib import Path
import os
import pymysql

# Install pymysql as mysqldb for Django compatibility
pymysql.install_as_MySQLdb()
if not hasattr(pymysql, 'version_info'):
    pymysql.version_info = (1, 4, 6, 'final', 0)
    
# Monkey patch version to satisfy Django 4.0+
# Django checks for minimum version of mysqlclient. 
# We are tricking it into thinking we have a compatible version.
# Pymysql 1.1.2 is roughly compatible but reports differently.
# We set it to 2.2.1 to pass the check.
try:
    import MySQLdb
    MySQLdb.version_info = (2, 2, 1, 'final', 0)
except ImportError:
    pass

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-only-insecure-key-change-me')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = ['admin.zimprices.co.zw', 'localhost', '127.0.0.1', '51.77.222.232']
CSRF_TRUSTED_ORIGINS = ['https://admin.zimprices.co.zw']

# Security Hardening
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True

# Cloudflare Turnstile
TURNSTILE_SITE_KEY = os.environ.get('TURNSTILE_SITE_KEY', '')
TURNSTILE_SECRET_KEY = os.environ.get('TURNSTILE_SECRET_KEY', '')


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party
    'django_htmx',
    'compressor',
    
    # Local
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django_htmx.middleware.HtmxMiddleware',
    'core.middleware.CSPNonceMiddleware',  # Security: CSP with nonces
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# MariaDB is used for both Django internal data and mail server data
MAIL_DB_HOST = os.environ.get("MAIL_DB_HOST", "127.0.0.1")
MAIL_DB_USER = os.environ.get("MAIL_DB_USER", "mailuser")
MAIL_DB_PASS = os.environ.get("MAIL_DB_PASS", "ChangeMe123!")
MAIL_DB_NAME = os.environ.get("MAIL_DB_NAME", "mailserver")

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': MAIL_DB_NAME,
        'USER': MAIL_DB_USER,
        'PASSWORD': MAIL_DB_PASS,
        'HOST': MAIL_DB_HOST,
        'PORT': '3306',
    },
    'mail_data': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': MAIL_DB_NAME,
        'USER': MAIL_DB_USER,
        'PASSWORD': MAIL_DB_PASS,
        'HOST': MAIL_DB_HOST,
        'PORT': '3306',
    }
}

DATABASE_ROUTERS = ['core.router.MailRouter']


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Authentication Backend
AUTHENTICATION_BACKENDS = [
    'core.auth_backend.CheckMailServerBackend',  # Our custom backend
    'django.contrib.auth.backends.ModelBackend', # Fallback for local superusers
]


# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Harare'
USE_I18N = True
USE_TZ = True


# Authentication Redirects
LOGIN_URL = 'login'
LOGIN_REDIRECT_URL = 'dashboard'
LOGOUT_REDIRECT_URL = 'login'


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']

STATICFILES_FINDERS = [
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
    'compressor.finders.CompressorFinder',
]

# Compressor settings for Tailwind
COMPRESS_ROOT = STATIC_ROOT
COMPRESS_ENABLED = True

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'core': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': True,
        },
    },
}
