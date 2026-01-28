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
SECRET_KEY = 'django-insecure-%#m3kg+68!cr26qq6ly6u0vi@%mf7qo83fy=_7r#oskmk-84u+'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = ['admin.zimprices.co.zw', 'localhost', '127.0.0.1', '51.77.222.232']
CSRF_TRUSTED_ORIGINS = ['https://admin.zimprices.co.zw']

# Cloudflare Turnstile
TURNSTILE_SITE_KEY = "0x4AAAAAACTKXzb7GlULcNSk"
TURNSTILE_SECRET_KEY = "0x4AAAAAACTKX__6TE0TE4QMX1t7lT-q9Ro"


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
# Use SQLite for Django's internal tables (sessions, admin logs)
# Use MariaDB for the mailserver data

# Mail Server DB Credentials (from scripts/maintenance/mail_admin.py)
MAIL_DB_HOST = "127.0.0.1"
MAIL_DB_USER = "mailuser"
MAIL_DB_PASS = "ChangeMe123!"
MAIL_DB_NAME = "mailserver"

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
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
