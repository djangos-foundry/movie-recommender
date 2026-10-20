from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone

TRASH_RETENTION_DAYS = 30


class ActiveManager(models.Manager):
    """Default manager: hides soft-deleted (trashed) rows everywhere the app
    already queries these models, so no call site needs to know trash exists."""
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class MovieList(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    color = models.CharField(max_length=50, default='#f5c518')
    icon = models.CharField(max_length=50, default='Film')
    is_favourite = models.BooleanField(default=False)
    # The hidden per-user "Library" list: holds movies added without picking a
    # list. Never shown in the lists sidebar and cannot be renamed or deleted.
    is_system = models.BooleanField(default=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.CASCADE, related_name='movie_lists',
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = ActiveManager()
    all_objects = models.Manager()  # includes trashed rows — trash views only

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return self.name



class Movie(models.Model):
    """A movie or, with media_type='tv', a TV show. Shows reuse the movie
    columns where TMDB has an equivalent (name -> title, first_air_date ->
    release_date, episode length -> runtime, creators -> director) and add a
    few of their own below."""
    MEDIA_TYPES = [
        ('movie', 'Movie'),
        ('tv', 'TV show'),
    ]

    media_type = models.CharField(max_length=5, choices=MEDIA_TYPES, default='movie', db_index=True)
    # TMDB numbers movies and shows separately, so an id is only unique per media_type
    tmdb_id = models.IntegerField()
    title = models.CharField(max_length=500)
    original_title = models.CharField(max_length=500, blank=True, default='')
    tagline = models.CharField(max_length=500, blank=True, default='')
    overview = models.TextField(blank=True, default='')
    poster_path = models.CharField(max_length=500, blank=True, default='')
    backdrop_path = models.CharField(max_length=500, blank=True, default='')
    release_date = models.CharField(max_length=50, blank=True, default='')
    vote_average = models.FloatField(default=0.0)
    vote_count = models.IntegerField(default=0)
    popularity = models.FloatField(default=0.0)
    runtime = models.IntegerField(null=True, blank=True, default=0)
    genres = models.JSONField(default=list, blank=True)
    imdb_id = models.CharField(max_length=50, blank=True, default='')
    budget = models.BigIntegerField(default=0)
    revenue = models.BigIntegerField(default=0)
    homepage = models.URLField(max_length=500, blank=True, default='')
    spoken_languages = models.JSONField(default=list, blank=True)
    production_companies = models.JSONField(default=list, blank=True)
    cast = models.JSONField(default=list, blank=True)
    director = models.CharField(max_length=255, blank=True, default='')
    crew = models.JSONField(default=list, blank=True)
    release_status = models.CharField(max_length=50, blank=True, default='')
    original_language = models.CharField(max_length=20, blank=True, default='')
    production_countries = models.JSONField(default=list, blank=True)
    # TV only: release_status holds "Returning Series" / "Ended" for shows
    number_of_seasons = models.IntegerField(null=True, blank=True)
    number_of_episodes = models.IntegerField(null=True, blank=True)
    seasons = models.JSONField(default=list, blank=True)
    networks = models.JSONField(default=list, blank=True)
    last_air_date = models.CharField(max_length=50, blank=True, default='')
    next_episode_to_air = models.JSONField(null=True, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']
        constraints = [
            models.UniqueConstraint(fields=['media_type', 'tmdb_id'], name='unique_media_type_tmdb_id'),
        ]

    def __str__(self):
        return self.title


class ScheduledWatch(models.Model):
    """
    A planned watch session for a library movie: 'watch Chennai Express on
    Saturday from 2:00 PM'. Kept deliberately close to a Google Calendar
    event's shape (summary/start/end/description) so pushing it to a real
    Google Calendar later is a straight field mapping (services/gcal.py).
    google_event_id stays empty until the owner connects Google Calendar.
    """
    SYNC_CHOICES = [
        ('not_synced', 'Not synced'),
        ('synced', 'Synced'),
        ('error', 'Error'),
    ]

    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name='scheduled_watches')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    notes = models.TextField(blank=True, default='')
    # Which episode, when the title is a TV show
    season_number = models.PositiveSmallIntegerField(null=True, blank=True)
    episode_number = models.PositiveSmallIntegerField(null=True, blank=True)
    # A binge block: this many episodes in a row, starting at season/episode
    episode_count = models.PositiveSmallIntegerField(default=1)
    is_watched = models.BooleanField(default=False)
    google_event_id = models.CharField(max_length=255, blank=True, default='')
    sync_status = models.CharField(max_length=12, choices=SYNC_CHOICES, default='not_synced')
    sync_error = models.TextField(blank=True, default='')
    synced_at = models.DateTimeField(null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.CASCADE, related_name='scheduled_watches',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_time']

    def __str__(self):
        return f"{self.movie.title} @ {self.start_time:%Y-%m-%d %H:%M}"


class MovieListItem(models.Model):
    STATUS_CHOICES = [
        ('plan_to_watch', 'Plan to Watch'),
        ('watching', 'Watching'),
        ('completed', 'Completed'),
        ('dropped', 'Dropped'),
    ]

    list = models.ForeignKey(MovieList, on_delete=models.CASCADE, related_name='items')
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name='list_items')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='plan_to_watch')
    user_rating = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)]
    )
    user_notes = models.TextField(blank=True, default='')
    # TV shows: the last episode watched ("up to S2E5"); empty for movies
    current_season = models.PositiveSmallIntegerField(null=True, blank=True)
    current_episode = models.PositiveSmallIntegerField(null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = ActiveManager()
    all_objects = models.Manager()  # includes trashed rows — trash views only

    class Meta:
        unique_together = ('list', 'movie')
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.movie.title} in {self.list.name} ({self.status})"


class GoogleAccount(models.Model):
    """Links a Django user to a Google identity. `sub` is Google's stable,
    permanent id for the person (email can change, `sub` never does)."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='google_account',
    )
    sub = models.CharField(max_length=255, unique=True)
    email = models.EmailField(blank=True, default='')
    name = models.CharField(max_length=255, blank=True, default='')
    picture = models.URLField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.email or self.sub


class GoogleCalendarConnection(models.Model):
    """
    A user's link to their Google Calendar. We only ever write to the
    dedicated "CineTrack" calendar this app created for them
    (calendar.app.created scope); `calendar_id` is that calendar. The refresh
    token is stored encrypted; access tokens are never stored.
    """
    STATUS_CHOICES = [
        ('ok', 'Connected'),
        ('broken', 'Needs reconnecting'),
        ('disconnected', 'Disconnected'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='calendar_connection',
    )
    refresh_token_enc = models.TextField()
    calendar_id = models.CharField(max_length=255)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='ok')
    connected_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user_id} -> {self.calendar_id} ({self.status})"
