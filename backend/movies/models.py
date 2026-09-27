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
    tmdb_id = models.IntegerField(unique=True)
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
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


class ScheduledWatch(models.Model):
    """
    A planned watch session for a library movie: 'watch Chennai Express on
    Saturday from 2:00 PM'. Kept deliberately close to a Google Calendar
    event's shape (summary/start/end/description) so pushing it to a real
    Google Calendar later is a straight field mapping. google_event_id stays
    empty until that sync exists.
    """
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name='scheduled_watches')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    notes = models.TextField(blank=True, default='')
    is_watched = models.BooleanField(default=False)
    google_event_id = models.CharField(max_length=255, blank=True, default='')
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
    added_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = ActiveManager()
    all_objects = models.Manager()  # includes trashed rows — trash views only

    class Meta:
        unique_together = ('list', 'movie')
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.movie.title} in {self.list.name} ({self.status})"
