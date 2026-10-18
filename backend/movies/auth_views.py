import re

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .auth import MODEL_BACKEND, StrictSessionAuthentication, has_google, is_guest
from .models import GoogleAccount, MovieList, ScheduledWatch


def _user_payload(user):
    """Signed-in people only; guests are reported as 'not signed in'.
    `kind` says how they signed in (Calendar sync is Google-only)."""
    if not user.is_authenticated or is_guest(user):
        return None
    if has_google(user):
        account = user.google_account
        return {
            'name': account.name or account.email,
            'email': account.email,
            'picture': account.picture,
            'kind': 'google',
        }
    return {'name': user.username, 'email': user.email, 'picture': '', 'kind': 'password'}


def _move_data(source, target):
    """Hand everything `source` owns (trash included) to `target`."""
    MovieList.all_objects.filter(owner=source).update(owner=target)
    ScheduledWatch.objects.filter(owner=source).update(owner=target)


def _claim_legacy_data(target):
    """Rows created before accounts existed have no owner; the very first
    Google account to sign in inherits them."""
    MovieList.all_objects.filter(owner__isnull=True).update(owner=target)
    ScheduledWatch.objects.filter(owner__isnull=True).update(owner=target)


@method_decorator(ensure_csrf_cookie, name='dispatch')
class MeView(APIView):
    """GET /api/auth/me/ - who is signed in (null for guests) + a CSRF token."""

    def get(self, request):
        return Response({
            'user': _user_payload(request.user),
            'csrf_token': get_token(request),
            'google_client_id': settings.GOOGLE_CLIENT_ID,
        })


class GoogleLoginView(APIView):
    """
    POST /api/auth/google/  {"credential": "<Google ID token>"}

    Verifies the token with Google, then signs the person in. If they were
    browsing as a guest, that guest's lists come with them: a new Google
    identity upgrades the guest in place; a returning one has the guest's data
    merged into their existing account.
    """

    def post(self, request):
        credential = request.data.get('credential')
        if not credential:
            return Response({'error': 'credential is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not settings.GOOGLE_CLIENT_ID:
            return Response({'error': 'Google sign-in is not configured on the server.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            info = id_token.verify_oauth2_token(
                credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID,
            )
        except ValueError:
            return Response({'error': 'Google sign-in could not be verified.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        if not info.get('email_verified'):
            return Response({'error': 'Your Google email is not verified.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        profile = {
            'email': info.get('email', ''),
            'name': info.get('name', ''),
            'picture': info.get('picture', ''),
        }
        current = request.user  # the guest session started for this request

        with transaction.atomic():
            account = GoogleAccount.objects.select_related('user').filter(sub=info['sub']).first()
            if account:
                target = account.user
                if is_guest(current) and current.pk != target.pk:
                    _move_data(current, target)
                    current.delete()
                for field, value in profile.items():
                    setattr(account, field, value)
                account.save()
            else:
                if is_guest(current):
                    target = current
                else:
                    target = get_user_model().objects.create(username=f"google-{info['sub']}")
                    target.set_unusable_password()
                    target.save()
                account = GoogleAccount.objects.create(user=target, sub=info['sub'], **profile)
                if GoogleAccount.objects.count() == 1:
                    _claim_legacy_data(target)

            target.email = profile['email']
            target.first_name = profile['name'][:150]
            target.save(update_fields=['email', 'first_name'])

        login(request._request, target, backend=MODEL_BACKEND)
        return Response({
            'user': _user_payload(target),
            'csrf_token': get_token(request),
        })


class LogoutView(APIView):
    """POST /api/auth/logout/ - end the session."""

    def post(self, request):
        logout(request._request)
        return Response({'status': 'signed_out'})


USERNAME_RE = re.compile(r'^[a-z0-9_]{3,30}$')
MIN_PASSWORD_LENGTH = 10
MAX_FAILED_LOGINS = 10
LOCKOUT_SECONDS = 15 * 60


def _signed_in_response(request, user):
    return Response({
        'user': _user_payload(user),
        'csrf_token': get_token(request),
    })


class RegisterView(APIView):
    """
    POST /api/auth/register/  {"username", "password", "email"?}

    Creates a username-and-password account. A guest's lists come with them:
    the guest is upgraded in place. Usernames are stored lowercase, so they are
    case-insensitive. Email is optional.
    """
    authentication_classes = [StrictSessionAuthentication]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_register'

    def post(self, request):
        User = get_user_model()
        username = str(request.data.get('username') or '').strip().lower()
        password = str(request.data.get('password') or '')
        email = str(request.data.get('email') or '').strip()

        def bad(message):
            return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)

        current = request.user
        if current.is_authenticated and not is_guest(current):
            return bad('You are already signed in. Sign out first.')
        if not USERNAME_RE.match(username):
            return bad('Username must be 3 to 30 letters, numbers, or underscores.')
        if User.objects.filter(username__iexact=username).exists():
            return bad('That username is taken. Try another.')
        if len(password) < MIN_PASSWORD_LENGTH:
            return bad(f'Password must be at least {MIN_PASSWORD_LENGTH} characters.')
        try:
            validate_password(password, user=User(username=username, email=email))
        except ValidationError as exc:
            return bad(' '.join(exc.messages))
        if email:
            try:
                validate_email(email)
            except ValidationError:
                return bad('Enter a valid email address.')

        try:
            with transaction.atomic():
                if current.is_authenticated:  # a guest: keep their lists
                    user = current
                    user.username = username
                    user.email = email
                    user.set_password(password)
                    user.save()
                else:
                    user = User.objects.create_user(username=username, email=email, password=password)
        except IntegrityError:
            return bad('That username is taken. Try another.')

        login(request._request, user, backend=MODEL_BACKEND)
        return _signed_in_response(request, user)


class LoginView(APIView):
    """
    POST /api/auth/login/  {"username", "password"}

    A guest's lists are merged into the account they sign in to. Wrong
    credentials always get the same answer, and repeated failures for one
    username are paused for a while.
    """
    authentication_classes = [StrictSessionAuthentication]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_login'

    def post(self, request):
        username = str(request.data.get('username') or '').strip().lower()
        password = str(request.data.get('password') or '')
        if not username or not password:
            return Response({'error': 'Enter your username and password.'},
                            status=status.HTTP_400_BAD_REQUEST)

        fail_key = f'login-fail:{username}'
        if cache.get(fail_key, 0) >= MAX_FAILED_LOGINS:
            return Response({'error': 'Too many attempts. Try again in a few minutes.'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = authenticate(request._request, username=username, password=password)
        if user is None:
            cache.set(fail_key, cache.get(fail_key, 0) + 1, LOCKOUT_SECONDS)
            return Response({'error': 'Wrong username or password. Try again.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        cache.delete(fail_key)

        current = request.user
        with transaction.atomic():
            if current.is_authenticated and is_guest(current) and current.pk != user.pk:
                _move_data(current, user)
                current.delete()
        login(request._request, user, backend=MODEL_BACKEND)
        return _signed_in_response(request, user)
