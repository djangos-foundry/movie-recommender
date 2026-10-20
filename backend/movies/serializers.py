from rest_framework import serializers
from django.utils import timezone
from .models import MovieList, Movie, MovieListItem, ScheduledWatch, TRASH_RETENTION_DAYS


class MovieSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movie
        fields = [
            'id',
            'media_type',
            'tmdb_id',
            'title',
            'original_title',
            'tagline',
            'overview',
            'poster_path',
            'backdrop_path',
            'release_date',
            'vote_average',
            'vote_count',
            'popularity',
            'genres',
            'runtime',
            'imdb_id',
            'budget',
            'revenue',
            'homepage',
            'spoken_languages',
            'production_companies',
            'cast',
            'director',
            'crew',
            'release_status',
            'original_language',
            'production_countries',
            'number_of_seasons',
            'number_of_episodes',
            'seasons',
            'networks',
            'last_air_date',
            'next_episode_to_air',
            'raw_data',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class MovieListItemSerializer(serializers.ModelSerializer):
    movie = MovieSerializer(read_only=True)
    list_name = serializers.ReadOnlyField(source='list.name')

    class Meta:
        model = MovieListItem
        fields = [
            'id',
            'list',
            'list_name',
            'movie',
            'status',
            'user_rating',
            'user_notes',
            'current_season',
            'current_episode',
            'added_at',
        ]
        read_only_fields = ['id', 'list', 'added_at']


class MovieListSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()
    items = MovieListItemSerializer(many=True, read_only=True)

    class Meta:
        model = MovieList
        fields = [
            'id',
            'name',
            'description',
            'color',
            'icon',
            'is_favourite',
            'order',
            'created_at',
            'items_count',
            'items',
        ]
        read_only_fields = ['id', 'created_at']


    def get_items_count(self, obj):
        if hasattr(obj, 'items_count'):
            return obj.items_count
        return obj.items.count()


class ScheduledWatchSerializer(serializers.ModelSerializer):
    movie = MovieSerializer(read_only=True)
    movie_id = serializers.PrimaryKeyRelatedField(
        source='movie', queryset=Movie.objects.all(), write_only=True,
    )

    class Meta:
        model = ScheduledWatch
        fields = [
            'id',
            'movie',
            'movie_id',
            'start_time',
            'end_time',
            'notes',
            'season_number',
            'episode_number',
            'episode_count',
            'is_watched',
            'google_event_id',
            'sync_status',
            'sync_error',
            'created_at',
        ]
        read_only_fields = ['id', 'google_event_id', 'sync_status', 'sync_error', 'created_at']

    def validate(self, attrs):
        start = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start and end and end <= start:
            raise serializers.ValidationError("end_time must be after start_time.")
        if attrs.get('episode_count') is not None and not 1 <= attrs['episode_count'] <= 50:
            raise serializers.ValidationError("episode_count must be between 1 and 50.")
        return attrs


def _days_remaining(deleted_at):
    if not deleted_at:
        return None
    elapsed = (timezone.now() - deleted_at).days
    return max(0, TRASH_RETENTION_DAYS - elapsed)


class TrashedListSerializer(serializers.ModelSerializer):
    type = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    only_here_count = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()

    class Meta:
        model = MovieList
        fields = ['id', 'type', 'name', 'color', 'icon', 'items_count', 'only_here_count', 'deleted_at', 'days_remaining']

    def get_type(self, obj):
        return 'list'

    def get_items_count(self, obj):
        return obj.items.filter(deleted_at__isnull=True).count()

    def get_only_here_count(self, obj):
        """Movies that were only in this list. Movies also in another list stay
        in the library while the list is in Trash, and when it is deleted."""
        elsewhere = MovieListItem.objects.filter(
            list__owner=obj.owner, list__deleted_at__isnull=True,
        ).exclude(list=obj).values('movie_id')
        return obj.items.filter(deleted_at__isnull=True).exclude(movie_id__in=elsewhere).count()

    def get_days_remaining(self, obj):
        return _days_remaining(obj.deleted_at)


class TrashedItemSerializer(serializers.ModelSerializer):
    type = serializers.SerializerMethodField()
    movie = MovieSerializer(read_only=True)
    list_name = serializers.ReadOnlyField(source='list.name')
    days_remaining = serializers.SerializerMethodField()

    class Meta:
        model = MovieListItem
        fields = ['id', 'type', 'movie', 'list', 'list_name', 'status', 'deleted_at', 'days_remaining']

    def get_type(self, obj):
        return 'item'

    def get_days_remaining(self, obj):
        return _days_remaining(obj.deleted_at)


class AddMovieToListSerializer(serializers.Serializer):
    tmdb_id = serializers.IntegerField(required=False)
    media_type = serializers.ChoiceField(choices=Movie.MEDIA_TYPES, required=False)
    movie = serializers.DictField(required=False)
    status = serializers.ChoiceField(
        choices=MovieListItem.STATUS_CHOICES,
        default='plan_to_watch',
        required=False,
    )
    user_rating = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=10,
    )
    user_notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
    )

    def validate(self, attrs):
        if not attrs.get('tmdb_id') and not attrs.get('movie'):
            raise serializers.ValidationError("Either 'tmdb_id' or 'movie' payload is required.")
        return attrs
