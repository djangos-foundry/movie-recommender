from django.db.models import Count, Max
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import (
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
    get_object_or_404,
)

from .models import MovieList, Movie, MovieListItem
from .serializers import (
    MovieListSerializer,
    MovieListItemSerializer,
    MovieSerializer,
    AddMovieToListSerializer,
)
from .services.tmdb import tmdb_service, format_poster_url, format_backdrop_url, normalize_genres
from .services.recommender import get_recommendations


class MovieListIndexView(ListCreateAPIView):
    """
    GET /api/lists/ - List all lists with item counts.
    POST /api/lists/ - Create a new list.
    """
    serializer_class = MovieListSerializer

    def get_queryset(self):
        return MovieList.objects.annotate(items_count=Count('items')).order_by('order', 'created_at')

    def perform_create(self, serializer):
        max_order = MovieList.objects.aggregate(Max('order'))['order__max']
        new_order = (max_order + 1) if max_order is not None else 0
        serializer.save(order=new_order)


class MovieListReorderView(APIView):
    """
    PATCH /api/lists/reorder/ - Reorder lists given ordered_ids array.
    """
    def patch(self, request):
        ordered_ids = request.data.get('ordered_ids', [])
        if not isinstance(ordered_ids, list):
            return Response({"error": "ordered_ids list is required"}, status=status.HTTP_400_BAD_REQUEST)

        for index, list_id in enumerate(ordered_ids):
            MovieList.objects.filter(id=list_id).update(order=index)

        return Response({"status": "success", "message": "Lists reordered successfully"})


class MovieListDetailView(RetrieveUpdateDestroyAPIView):
    """
    GET /api/lists/<int:pk>/ - Retrieve list details with items.
    PUT/PATCH /api/lists/<int:pk>/ - Update list.
    DELETE /api/lists/<int:pk>/ - Delete list.
    """
    serializer_class = MovieListSerializer
    queryset = MovieList.objects.annotate(items_count=Count('items'))


class MovieListMoviesView(APIView):
    """
    GET /api/lists/<int:pk>/movies/ - List all movies in this list.
    POST /api/lists/<int:pk>/movies/ - Add a movie to this list.
    """

    def get(self, request, pk):
        movie_list = get_object_or_404(MovieList, pk=pk)
        items = movie_list.items.select_related('movie').all()
        serializer = MovieListItemSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        movie_list = get_object_or_404(MovieList, pk=pk)
        serializer = AddMovieToListSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        tmdb_id = data.get('tmdb_id')
        movie_payload = data.get('movie') or {}

        if not tmdb_id and movie_payload.get('id'):
            tmdb_id = movie_payload.get('id')
        if not tmdb_id and movie_payload.get('tmdb_id'):
            tmdb_id = movie_payload.get('tmdb_id')

        if not tmdb_id:
            return Response(
                {"error": "tmdb_id is required either directly or inside movie object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            tmdb_id = int(tmdb_id)
        except (ValueError, TypeError):
            return Response(
                {"error": "tmdb_id must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Retrieve or create Movie instance
        movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
        if not movie or not movie.overview or not movie.cast or not movie.director:
            # Fetch comprehensive details from TMDB service
            fetched_details = tmdb_service.get_movie_details(tmdb_id)
            if fetched_details:
                movie_payload = {**movie_payload, **fetched_details}

            title = movie_payload.get('title') or f"Movie #{tmdb_id}"
            original_title = movie_payload.get('original_title') or title
            tagline = movie_payload.get('tagline', '')
            overview = movie_payload.get('overview', '')
            poster_path = format_poster_url(movie_payload.get('poster_path', ''))
            backdrop_path = format_backdrop_url(movie_payload.get('backdrop_path', ''))
            release_date = str(movie_payload.get('release_date', ''))
            vote_average = float(movie_payload.get('vote_average') or 0.0)
            vote_count = int(movie_payload.get('vote_count') or 0)
            popularity = float(movie_payload.get('popularity') or 0.0)
            genres = normalize_genres(movie_payload.get('genres'))
            runtime = int(movie_payload.get('runtime') or 0)
            imdb_id = str(movie_payload.get('imdb_id', ''))
            budget = int(movie_payload.get('budget') or 0)
            revenue = int(movie_payload.get('revenue') or 0)
            homepage = str(movie_payload.get('homepage', ''))
            spoken_languages = movie_payload.get('spoken_languages', [])
            production_companies = movie_payload.get('production_companies', [])
            cast = movie_payload.get('cast', [])
            raw_data = movie_payload.get('raw_data', {})
            director = str(movie_payload.get('director', ''))
            crew = movie_payload.get('crew', [])
            release_status = str(movie_payload.get('release_status', ''))
            original_language = str(movie_payload.get('original_language', ''))
            production_countries = movie_payload.get('production_countries', [])

            movie, _ = Movie.objects.update_or_create(
                tmdb_id=tmdb_id,
                defaults={
                    'title': title,
                    'original_title': original_title,
                    'tagline': tagline,
                    'overview': overview,
                    'poster_path': poster_path,
                    'backdrop_path': backdrop_path,
                    'release_date': release_date,
                    'vote_average': vote_average,
                    'vote_count': vote_count,
                    'popularity': popularity,
                    'genres': genres,
                    'runtime': runtime,
                    'imdb_id': imdb_id,
                    'budget': budget,
                    'revenue': revenue,
                    'homepage': homepage,
                    'spoken_languages': spoken_languages,
                    'production_companies': production_companies,
                    'cast': cast,
                    'raw_data': raw_data,
                    'director': director,
                    'crew': crew,
                    'release_status': release_status,
                    'original_language': original_language,
                    'production_countries': production_countries,
                }
            )

        # Check for duplicate in the same list
        existing_item = MovieListItem.objects.filter(list=movie_list, movie=movie).first()
        if existing_item:
            return Response(
                {
                    "error": "Movie is already in this list.",
                    "item": MovieListItemSerializer(existing_item).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        item = MovieListItem.objects.create(
            list=movie_list,
            movie=movie,
            status=data.get('status', 'plan_to_watch'),
            user_rating=data.get('user_rating'),
            user_notes=data.get('user_notes', ''),
        )

        return Response(
            MovieListItemSerializer(item).data,
            status=status.HTTP_201_CREATED,
        )


class MovieListItemDetailView(RetrieveUpdateDestroyAPIView):
    """
    GET /api/list-items/<int:pk>/ - Retrieve item details.
    PATCH/PUT /api/list-items/<int:pk>/ - Update status, user_rating, user_notes.
    DELETE /api/list-items/<int:pk>/ - Remove movie item from list.
    """
    queryset = MovieListItem.objects.select_related('list', 'movie').all()
    serializer_class = MovieListItemSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', True)
        instance = self.get_object()

        # Update fields if present in request data
        if 'status' in request.data:
            instance.status = request.data['status']
        if 'user_rating' in request.data:
            rating = request.data['user_rating']
            instance.user_rating = int(rating) if rating is not None else None
        if 'user_notes' in request.data:
            instance.user_notes = request.data['user_notes']

        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class TMDBSearchView(APIView):
    """
    GET /api/tmdb/search/?q=... - Search movies via TMDB or fallback mock data.
    """

    def get(self, request):
        query = request.query_params.get('q', request.query_params.get('query', ''))
        page = request.query_params.get('page', 1)
        try:
            page = int(page)
        except (ValueError, TypeError):
            page = 1

        results = tmdb_service.search_movies(query, page=page)
        return Response(results)


class TMDBMovieDetailView(APIView):
    """
    GET /api/tmdb/movie/<int:tmdb_id>/ - Fetch movie detail by TMDB ID.
    """

    def get(self, request, tmdb_id):
        details = tmdb_service.get_movie_details(tmdb_id)
        if not details:
            return Response(
                {"error": f"Movie with tmdb_id {tmdb_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(details)


class RecommendationView(APIView):
    """
    GET /api/recommendations/?count=5&list_id=<optional>
    Returns movies sampled without replacement from the genres the user collects.
    """

    def get(self, request):
        count = request.query_params.get('count', 5)
        try:
            count = int(count)
        except (ValueError, TypeError):
            count = 5
        count = max(1, min(count, 20))

        list_id = request.query_params.get('list_id')
        if list_id in ('', 'all', None):
            list_id = None
        else:
            try:
                list_id = int(list_id)
            except (ValueError, TypeError):
                list_id = None

        data = get_recommendations(count=count, list_id=list_id)
        return Response(data)


class SeedDataView(APIView):
    """
    GET or POST /api/seed/ - Seeds default categories and sample movie.
    """

    def get(self, request):
        return self._seed()

    def post(self, request):
        return self._seed()

    def _seed(self):
        default_lists = [
            {
                "name": "Plan to Watch",
                "color": "#3b82f6",
                "description": "Movies queued up to watch soon",
                "order": 0,
            },
            {
                "name": "Watching",
                "color": "#f59e0b",
                "description": "Movies currently in progress",
                "order": 1,
            },
            {
                "name": "Completed",
                "color": "#10b981",
                "description": "Finished movies with your ratings and reviews",
                "order": 2,
            },
            {
                "name": "Adventure",
                "color": "#f5c518",
                "description": "Epic journeys, exploration, and quest-filled movies",
                "order": 3,
            },
        ]

        created_lists = []
        for lst_info in default_lists:
            obj, _ = MovieList.objects.get_or_create(
                name=lst_info["name"],
                defaults={
                    "color": lst_info["color"],
                    "description": lst_info["description"],
                    "order": lst_info["order"],
                },
            )
            created_lists.append(obj)

        # Seed Interstellar in "Adventure"
        adventure_list = MovieList.objects.get(name="Adventure")
        interstellar_data = tmdb_service.get_movie_details(157336) or {}

        interstellar_movie, _ = Movie.objects.update_or_create(
            tmdb_id=157336,
            defaults={
                "title": interstellar_data.get("title", "Interstellar"),
                "original_title": interstellar_data.get("original_title", "Interstellar"),
                "tagline": interstellar_data.get("tagline", "Mankind was born on Earth. It was never meant to die here."),
                "overview": interstellar_data.get("overview", ""),
                "poster_path": interstellar_data.get("poster_path", ""),
                "backdrop_path": interstellar_data.get("backdrop_path", ""),
                "release_date": interstellar_data.get("release_date", "2014-11-05"),
                "vote_average": interstellar_data.get("vote_average", 8.4),
                "vote_count": interstellar_data.get("vote_count", 34500),
                "popularity": interstellar_data.get("popularity", 145.2),
                "genres": interstellar_data.get("genres", ["Adventure", "Drama", "Science Fiction"]),
                "runtime": interstellar_data.get("runtime", 169),
                "imdb_id": interstellar_data.get("imdb_id", "tt0816692"),
                "budget": interstellar_data.get("budget", 165000000),
                "revenue": interstellar_data.get("revenue", 701729206),
                "homepage": interstellar_data.get("homepage", "http://www.interstellarmovie.net/"),
                "spoken_languages": interstellar_data.get("spoken_languages", []),
                "production_companies": interstellar_data.get("production_companies", []),
                "cast": interstellar_data.get("cast", []),
                "director": interstellar_data.get("director", "Christopher Nolan"),
                "crew": interstellar_data.get("crew", []),
                "release_status": interstellar_data.get("release_status", "Released"),
                "original_language": interstellar_data.get("original_language", "en"),
                "production_countries": interstellar_data.get("production_countries", []),
                "raw_data": interstellar_data.get("raw_data", {}),
            },
        )

        item, created = MovieListItem.objects.get_or_create(
            list=adventure_list,
            movie=interstellar_movie,
            defaults={
                "status": "completed",
                "user_rating": 10,
                "user_notes": "A masterpiece of space exploration and love transcending dimensions.",
            },
        )
        if not created:
            item.status = "completed"
            item.user_rating = 10
            item.user_notes = "A masterpiece of space exploration and love transcending dimensions."
            item.save()

        # Re-fetch all lists with counts
        all_lists = MovieList.objects.annotate(items_count=Count('items')).order_by('created_at')
        serializer = MovieListSerializer(all_lists, many=True)

        return Response(
            {
                "message": "Database successfully seeded with default categories and Interstellar!",
                "lists": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
