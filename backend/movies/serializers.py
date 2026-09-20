from rest_framework import serializers
from .models import MovieList, Movie, MovieListItem


class MovieSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movie
        fields = [
            'id',
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


class AddMovieToListSerializer(serializers.Serializer):
    tmdb_id = serializers.IntegerField(required=False)
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
