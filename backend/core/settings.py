import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file from backend root or parent root if available
load_dotenv(BASE_DIR / '.env')
load_dotenv(BASE_DIR.parent / '.env')

SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-movie-recommender-dev-key-change-in-prod')

DEBUG = os.getenv('DEBUG', 'True').lower() in ('true', '1', 'yes')

# Comma-separated hostnames in production, e.g. "cinetrack.example.com,1.2.3.4".
ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', '*').split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party apps
    'corsheaders',
    'rest_framework',
    # Local apps
    'movies',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        # DATABASE_PATH lets production keep the file outside the code folder,
        # so deploys (git pull) never touch user data.
        'NAME': os.getenv('DATABASE_PATH') or BASE_DIR / 'movies.db',
    }
}

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

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# In production Django also serves the built React app (frontend/dist) from
# the site root, so one process handles both the UI and /api.
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'
if FRONTEND_DIST.is_dir():
    WHITENOISE_ROOT = FRONTEND_DIST
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS Settings
# Cookie-based sessions need explicit origins (a wildcard is not allowed
# together with credentials).
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
CORS_ALLOW_CREDENTIALS = True
# Public site origin(s) in production, e.g. "https://cinetrack.example.com".
_extra_origins = [o.strip() for o in os.getenv('SITE_ORIGINS', '').split(',') if o.strip()]
CORS_ALLOWED_ORIGINS += _extra_origins
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

if not DEBUG and os.getenv('USE_HTTPS', 'True').lower() in ('true', '1', 'yes'):
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Django REST Framework Settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'movies.auth.GuestSessionAuthentication',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
}

# TMDB Configuration
TMDB_API_KEY = os.getenv('TMDB_API_KEY', '')

# Claude / Anthropic API key for the natural-language chat box.
# Optional: without it the chat falls back to a local keyword parser.
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')

# Google sign-in (OAuth Web client ID; public, safe to expose to the frontend)
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')

# Google Calendar sync: the secret exchanges the one-time consent code for
# tokens (server side only); the Fernet key encrypts stored refresh tokens.
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
TOKEN_ENCRYPTION_KEY = os.getenv('TOKEN_ENCRYPTION_KEY', '')
GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
