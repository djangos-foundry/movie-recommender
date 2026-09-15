from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class MovieList(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    color = models.CharField(max_length=50, default='#f5c518')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.name


class Movie(models.Model):
    tmdb_id = models.IntegerField(unique=True)
    title = models.CharField(max_length=500)
    original_title = models.CharField(max_length=500, blank=True, default='')
    overview = models.TextField(blank=True, default='')
    poster_path = models.CharField(max_length=500, blank=True, default='')
    backdrop_path = models.CharField(max_length=500, blank=True, default='')
    release_date = models.CharField(max_length=50, blank=True, default='')
    vote_average = models.FloatField(default=0.0)
    vote_count = models.IntegerField(default=0)
    genres = models.JSONField(default=list, blank=True)
    runtime = models.IntegerField(null=True, blank=True, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


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

    class Meta:
        unique_together = ('list', 'movie')
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.movie.title} in {self.list.name} ({self.status})"
