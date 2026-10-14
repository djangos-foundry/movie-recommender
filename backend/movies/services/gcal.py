"""
One-way sync of scheduled watches to the user's Google Calendar.

We only ever touch a dedicated "CineTrack" calendar that this app creates in
the user's account (the calendar.app.created scope allows nothing else), so the
worst a bug here can do is mess up that one calendar, never their real events.

Flow: the browser gets a one-time consent code from Google; `connect` swaps it
(with the client secret, server side) for tokens and stores the refresh token
encrypted. Each sync mints a short-lived access token from it, then inserts,
patches or deletes the event. A failed sync never blocks saving a watch - the
watch is marked `error` and can be retried.
"""

import logging
from datetime import timezone as dt_timezone

import requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from ..models import GoogleCalendarConnection, ScheduledWatch

logger = logging.getLogger(__name__)

TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/calendar/v3"
CALENDAR_NAME = "CineTrack"


class CalendarError(Exception):
    """A calendar problem with a message safe to show the user."""


# -- token storage -----------------------------------------------------------

def _fernet():
    if not settings.TOKEN_ENCRYPTION_KEY:
        raise CalendarError("Calendar sync isn't configured on the server (no encryption key).")
    return Fernet(settings.TOKEN_ENCRYPTION_KEY.encode())


def encrypt(value):
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value):
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        raise CalendarError("Stored Google token can't be read. Reconnect Google Calendar.")


def connection_for(user):
    if not user or not user.is_authenticated:
        return None
    return GoogleCalendarConnection.objects.filter(user=user).first()


# -- Google HTTP -------------------------------------------------------------

def _call(method, path, access, **kwargs):
    """Single choke point for Calendar API requests (also what tests mock)."""
    return requests.request(
        method, f"{API}{path}", headers={"Authorization": f"Bearer {access}"}, timeout=8, **kwargs,
    )


def _token_request(data):
    if not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
        raise CalendarError("Google Calendar isn't configured on the server (client secret missing).")
    return requests.post(
        TOKEN_URL,
        data={**data, "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET},
        timeout=10,
    )


def _access_token(connection):
    """A fresh access token from the stored refresh token (cached ~55 min)."""
    cache_key = f"gcal-access-{connection.pk}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    response = _token_request({
        "grant_type": "refresh_token",
        "refresh_token": decrypt(connection.refresh_token_enc),
    })
    if response.status_code != 200:
        if response.json().get("error") == "invalid_grant":
            # Revoked in the Google account, or a Testing-mode token past 7 days
            connection.status = "broken"
            connection.save(update_fields=["status"])
            raise CalendarError("Google Calendar access expired. Reconnect to keep syncing.")
        raise CalendarError("Couldn't refresh Google Calendar access.")

    data = response.json()
    cache.set(cache_key, data["access_token"], max(60, int(data.get("expires_in", 3600)) - 300))
    return data["access_token"]


# -- connect / disconnect ----------------------------------------------------

def connect(user, code, time_zone="UTC"):
    """Swap a consent code for tokens, make (or reuse) the CineTrack calendar."""
    response = _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": "postmessage"})
    if response.status_code != 200:
        raise CalendarError("Google rejected that sign-in. Try connecting again.")
    tokens = response.json()

    if settings.GOOGLE_CALENDAR_SCOPE not in tokens.get("scope", "").split():
        raise CalendarError("Calendar permission wasn't granted. Allow it on Google's screen and try again.")
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise CalendarError(
            "Google didn't issue a long-lived token. Remove CineTrack at "
            "myaccount.google.com/permissions, then connect again."
        )
    access = tokens["access_token"]

    existing = connection_for(user)
    calendar_id = existing.calendar_id if existing else ""
    if calendar_id and _call("GET", f"/calendars/{calendar_id}", access).status_code != 200:
        calendar_id = ""  # deleted in Google since last time
    if not calendar_id:
        created = _call("POST", "/calendars", access, json={
            "summary": CALENDAR_NAME,
            "description": "Movies you planned to watch in CineTrack",
            "timeZone": time_zone or "UTC",
        })
        if created.status_code >= 400:
            raise CalendarError("Couldn't create the CineTrack calendar in your Google account.")
        calendar_id = created.json()["id"]

    connection, _ = GoogleCalendarConnection.objects.update_or_create(
        user=user,
        defaults={"refresh_token_enc": encrypt(refresh_token), "calendar_id": calendar_id, "status": "ok"},
    )
    cache.set(f"gcal-access-{connection.pk}", access, max(60, int(tokens.get("expires_in", 3600)) - 300))
    return connection


def disconnect(user, delete_calendar=False):
    """Revoke our access. Events stay in Google unless `delete_calendar`."""
    connection = connection_for(user)
    if not connection:
        return
    try:
        if connection.status == "ok" and delete_calendar:
            _call("DELETE", f"/calendars/{connection.calendar_id}", _access_token(connection))
        if connection.refresh_token_enc:
            requests.post(REVOKE_URL, data={"token": decrypt(connection.refresh_token_enc)}, timeout=8)
    except (CalendarError, requests.RequestException) as e:
        logger.warning("Calendar disconnect cleanup incomplete (%s).", e)

    cache.delete(f"gcal-access-{connection.pk}")
    if delete_calendar:
        connection.delete()
        ScheduledWatch.objects.filter(owner=user).update(
            google_event_id="", sync_status="not_synced", sync_error="", synced_at=None,
        )
    else:
        # keep the calendar id so reconnecting reuses the same calendar
        connection.refresh_token_enc = ""
        connection.status = "disconnected"
        connection.save(update_fields=["refresh_token_enc", "status"])


# -- events ------------------------------------------------------------------

def event_body(watch):
    movie = watch.movie
    parts = []
    if watch.notes:
        parts.append(watch.notes)
    if movie.overview:
        parts.append(movie.overview)
    links = [f"TMDB: https://www.themoviedb.org/movie/{movie.tmdb_id}"]
    if movie.imdb_id:
        links.append(f"IMDb: https://www.imdb.com/title/{movie.imdb_id}/")
    parts.append("\n".join(links))
    parts.append("Planned in CineTrack")

    utc = dt_timezone.utc
    return {
        # "Movie" is one of the words Google Calendar turns into its film-projector
        # banner; the banner is chosen from the title and can't be set via the API
        "summary": f"Movie: {movie.title}",
        "description": "\n\n".join(parts),
        "start": {"dateTime": watch.start_time.astimezone(utc).isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": watch.end_time.astimezone(utc).isoformat(), "timeZone": "UTC"},
        # lets us recognise our own events later
        "extendedProperties": {"private": {"cinetrackWatchId": str(watch.id)}},
        "reminders": {"useDefault": True},
    }


def _fail(watch, message):
    watch.sync_status = "error"
    watch.sync_error = message
    watch.save(update_fields=["sync_status", "sync_error"])


def sync_watch(watch):
    """Create or update this watch's event. Never raises: failures are recorded."""
    connection = connection_for(watch.owner)
    if not connection or connection.status != "ok":
        return
    try:
        access = _access_token(connection)
        body = event_body(watch)
        base = f"/calendars/{connection.calendar_id}/events"

        response = None
        if watch.google_event_id:
            response = _call("PATCH", f"{base}/{watch.google_event_id}", access, json=body)
            if response.status_code in (404, 410):  # deleted in Google: recreate
                watch.google_event_id = ""
        if not watch.google_event_id:
            response = _call("POST", base, access, json=body)

        if response.status_code == 404:
            connection.status = "broken"
            connection.save(update_fields=["status"])
            raise CalendarError("The CineTrack calendar was removed from Google. Reconnect to recreate it.")
        if response.status_code >= 400:
            raise CalendarError("Google Calendar rejected the event.")

        watch.google_event_id = response.json()["id"]
        watch.sync_status = "synced"
        watch.sync_error = ""
        watch.synced_at = timezone.now()
        watch.save(update_fields=["google_event_id", "sync_status", "sync_error", "synced_at"])
    except CalendarError as e:
        _fail(watch, str(e))
    except requests.RequestException:
        _fail(watch, "Couldn't reach Google Calendar. Try again in a moment.")
    except Exception:
        # A sync bug must never stop the watch from being saved
        logger.exception("Unexpected error syncing watch %s", watch.pk)
        _fail(watch, "Something went wrong syncing to Google Calendar.")


def delete_event(watch):
    """Remove the event for a watch that is being deleted. Best effort."""
    connection = connection_for(watch.owner)
    if not connection or connection.status != "ok" or not watch.google_event_id:
        return
    try:
        response = _call(
            "DELETE", f"/calendars/{connection.calendar_id}/events/{watch.google_event_id}",
            _access_token(connection),
        )
        if response.status_code >= 400 and response.status_code not in (404, 410):
            logger.warning("Google refused to delete event %s (%s).", watch.google_event_id, response.status_code)
    except (CalendarError, requests.RequestException) as e:
        logger.warning("Could not delete Google event %s (%s).", watch.google_event_id, e)


def sync_pending(user):
    """Push every upcoming watch that isn't synced yet (first connect, or retry)."""
    todo = ScheduledWatch.objects.select_related("movie").filter(
        owner=user, end_time__gte=timezone.now(),
    ).exclude(sync_status="synced")
    synced = failed = 0
    for watch in todo:
        sync_watch(watch)
        if watch.sync_status == "synced":
            synced += 1
        else:
            failed += 1
    return {"synced": synced, "failed": failed}


def status_payload(user):
    connection = connection_for(user)
    state = connection.status if connection else "disconnected"
    return {
        "connected": state == "ok",
        "needs_reconnect": state == "broken",
        "calendar_name": CALENDAR_NAME,
    }
