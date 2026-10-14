import uuid

from django.contrib.auth import get_user_model, login
from rest_framework.authentication import SessionAuthentication

SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')
MODEL_BACKEND = 'django.contrib.auth.backends.ModelBackend'


def start_guest_session(http_request):
    """Create an anonymous 'guest' user and log it in (sets the session cookie)."""
    user = get_user_model()(username=f'guest-{uuid.uuid4().hex}')
    user.set_unusable_password()
    user.save()
    login(http_request, user, backend=MODEL_BACKEND)
    return user


def is_guest(user):
    """A guest has no Google account linked yet."""
    return not hasattr(user, 'google_account')


def owned(queryset, request, field='owner'):
    """Rows belonging to the current user; nothing at all for a visitor with
    no session (so legacy un-owned rows are never exposed)."""
    if not request.user.is_authenticated:
        return queryset.none()
    return queryset.filter(**{field: request.user})


class GuestSessionAuthentication(SessionAuthentication):
    """
    Session auth where the first *write* from a visitor with no session starts
    a guest session. Reads from a visitor with no session just see nothing, so
    simply browsing never creates database rows.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None or request.method in SAFE_METHODS:
            return result
        return (start_guest_session(request._request), None)
