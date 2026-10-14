from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth import MODEL_BACKEND, is_guest
from .models import GoogleAccount, MovieList, ScheduledWatch


def _user_payload(user):
    """Signed-in Google users only; guests are reported as 'not signed in'."""
    if not user.is_authenticated or is_guest(user):
        return None
    account = user.google_account
    return {
        'name': account.name or account.email,
        'email': account.email,
        'picture': account.picture,
    }


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
