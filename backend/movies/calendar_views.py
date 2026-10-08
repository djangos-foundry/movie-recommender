from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth import is_guest
from .services import gcal


def _needs_account(request):
    if not request.user.is_authenticated or is_guest(request.user):
        return Response(
            {"error": "Sign in with Google first to connect your calendar."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class CalendarStatusView(APIView):
    """GET /api/calendar/status/ - is Google Calendar connected for this user?"""

    def get(self, request):
        return Response(gcal.status_payload(request.user))


class CalendarConnectView(APIView):
    """
    POST /api/calendar/connect/  {"code": "<Google consent code>", "time_zone": "Asia/Kolkata"}

    Finishes the browser's Google consent, creates (or reuses) the "CineTrack"
    calendar, then pushes every upcoming watch that isn't on it yet.
    """

    def post(self, request):
        denied = _needs_account(request)
        if denied:
            return denied
        code = request.data.get("code")
        if not code:
            return Response({"error": "code is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            gcal.connect(request.user, code, request.data.get("time_zone") or "UTC")
        except gcal.CalendarError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        result = gcal.sync_pending(request.user)
        return Response({**gcal.status_payload(request.user), **result})


class CalendarSyncView(APIView):
    """POST /api/calendar/sync/ - retry anything upcoming that isn't synced."""

    def post(self, request):
        denied = _needs_account(request)
        if denied:
            return denied
        connection = gcal.connection_for(request.user)
        if not connection or connection.status != "ok":
            return Response({"error": "Google Calendar isn't connected."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({**gcal.status_payload(request.user), **gcal.sync_pending(request.user)})


class CalendarDisconnectView(APIView):
    """POST /api/calendar/disconnect/  {"delete_calendar": false}"""

    def post(self, request):
        denied = _needs_account(request)
        if denied:
            return denied
        gcal.disconnect(request.user, delete_calendar=bool(request.data.get("delete_calendar")))
        return Response(gcal.status_payload(request.user))
