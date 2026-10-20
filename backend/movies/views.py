from django.db.models import Count, Max
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import (
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
    get_object_or_404,
)

from .auth import owned
from .models import MovieList, Movie, MovieListItem, ScheduledWatch, TRASH_RETENTION_DAYS
from .serializers import (
    MovieListSerializer,
    MovieListItemSerializer,
    MovieSerializer,
    AddMovieToListSerializer,
    ScheduledWatchSerializer,
    TrashedListSerializer,
    TrashedItemSerializer,
)
from .services.tmdb import tmdb_service, format_poster_url, format_backdrop_url, normalize_genres
from .services.recommender import get_recommendations, get_filter_options, get_web_recommendations
from .services import gcal
from .services.chat import parse_open_vocabulary, _RANDOM_RE


def get_library_list(user):
    """The user's hidden Library list, created on first use. A guest merged into
    an existing account can briefly leave two; the oldest wins."""
    library = MovieList.objects.filter(owner=user, is_system=True).order_by('id').first()
    if library is None:
        library = MovieList.objects.create(owner=user, name='Library', is_system=True, order=-1)
    return library


class MovieListIndexView(ListCreateAPIView):
    """
    GET /api/lists/ - List all lists with item counts.
    POST /api/lists/ - Create a new list.
    """
    serializer_class = MovieListSerializer

    def get_queryset(self):
        qs = MovieList.objects.filter(is_system=False).annotate(items_count=Count('items')).order_by('order', 'created_at')
        return owned(qs, self.request)

    def perform_create(self, serializer):
        mine = MovieList.objects.filter(owner=self.request.user)
        max_order = mine.aggregate(Max('order'))['order__max']
        new_order = (max_order + 1) if max_order is not None else 0
        serializer.save(order=new_order, owner=self.request.user)


class MovieListReorderView(APIView):
    """
    PATCH /api/lists/reorder/ - Reorder lists given ordered_ids array.
    """
    def patch(self, request):
        ordered_ids = request.data.get('ordered_ids', [])
        if not isinstance(ordered_ids, list):
            return Response({"error": "ordered_ids list is required"}, status=status.HTTP_400_BAD_REQUEST)

        for index, list_id in enumerate(ordered_ids):
            owned(MovieList.objects.filter(id=list_id), request).update(order=index)

        return Response({"status": "success", "message": "Lists reordered successfully"})


class MovieListDetailView(RetrieveUpdateDestroyAPIView):
    """
    GET /api/lists/<int:pk>/ - Retrieve list details with items.
    PUT/PATCH /api/lists/<int:pk>/ - Update list.
    DELETE /api/lists/<int:pk>/ - Soft-delete list (moves it to Trash for 30 days).
    """
    serializer_class = MovieListSerializer

    def get_queryset(self):
        return owned(MovieList.objects.filter(is_system=False).annotate(items_count=Count('items')), self.request)

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at'])


class MovieListMoviesView(APIView):
    """
    GET /api/lists/<int:pk>/movies/ - List all movies in this list.
    POST /api/lists/<int:pk>/movies/ - Add a movie to this list.
    """

    def get_movie_list(self, request, pk):
        return get_object_or_404(owned(MovieList.objects.all(), request), pk=pk)

    def get(self, request, pk):
        movie_list = self.get_movie_list(request, pk)
        items = movie_list.items.select_related('movie').filter(deleted_at__isnull=True)
        serializer = MovieListItemSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        movie_list = self.get_movie_list(request, pk)
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

        media_type = data.get('media_type') or movie_payload.get('media_type') or 'movie'
        if media_type not in ('movie', 'tv'):
            media_type = 'movie'
        is_tv = media_type == 'tv'

        # Retrieve or create Movie instance (a show has no director, and needs its seasons)
        movie = Movie.objects.filter(media_type=media_type, tmdb_id=tmdb_id).first()
        stale = (not movie or not movie.overview or not movie.cast
                 or (not is_tv and not movie.director) or (is_tv and not movie.seasons))
        if stale:
            # Fetch comprehensive details from TMDB service
            fetched_details = tmdb_service.get_details(tmdb_id, media_type)
            if fetched_details:
                movie_payload = {**movie_payload, **fetched_details}

            title = movie_payload.get('title') or f"{'Show' if is_tv else 'Movie'} #{tmdb_id}"
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

            tv_fields = {
                'number_of_seasons': movie_payload.get('number_of_seasons'),
                'number_of_episodes': movie_payload.get('number_of_episodes'),
                'seasons': movie_payload.get('seasons') or [],
                'networks': movie_payload.get('networks') or [],
                'last_air_date': str(movie_payload.get('last_air_date') or ''),
                'next_episode_to_air': movie_payload.get('next_episode_to_air'),
            } if is_tv else {}

            movie, _ = Movie.objects.update_or_create(
                media_type=media_type,
                tmdb_id=tmdb_id,
                defaults={
                    **tv_fields,
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

        # A previous removal soft-deletes the row rather than dropping it (so
        # it can sit in Trash), and (list, movie) stays unique at the DB level
        # — so re-adding a movie that's currently in Trash for this list must
        # revive that same row instead of hitting the uniqueness constraint.
        existing_item = MovieListItem.all_objects.filter(list=movie_list, movie=movie).first()
        if existing_item and existing_item.deleted_at is None:
            return Response(
                {
                    "error": "Movie is already in this list.",
                    "item": MovieListItemSerializer(existing_item).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if existing_item:
            existing_item.deleted_at = None
            existing_item.status = data.get('status', 'plan_to_watch')
            existing_item.user_rating = data.get('user_rating')
            existing_item.user_notes = data.get('user_notes', '')
            existing_item.save()
            item = existing_item
        else:
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


class LibraryMoviesView(MovieListMoviesView):
    """
    GET /api/library/movies/ - Every movie the user has, across all their lists
        and the hidden Library (this is what "All Movies" shows).
    POST /api/library/movies/ - Add a movie without choosing a list; it goes
        into the hidden Library list.
    """

    def get_movie_list(self, request, pk):
        return get_library_list(request.user)

    def get(self, request):
        items = (
            owned(MovieListItem.objects.select_related('list', 'movie'), request, 'list__owner')
            .filter(list__deleted_at__isnull=True)
        )
        return Response(MovieListItemSerializer(items, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({"error": "No session."}, status=status.HTTP_401_UNAUTHORIZED)
        return super().post(request, pk=None)


class MovieListItemDetailView(RetrieveUpdateDestroyAPIView):
    """
    GET /api/list-items/<int:pk>/ - Retrieve item details.
    PATCH/PUT /api/list-items/<int:pk>/ - Update status, user_rating, user_notes.
    DELETE /api/list-items/<int:pk>/ - Soft-delete item (moves it to Trash for 30 days).
    """
    serializer_class = MovieListItemSerializer

    def get_queryset(self):
        qs = MovieListItem.objects.select_related('list', 'movie').all()
        return owned(qs, self.request, 'list__owner')

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at'])

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
        # TV progress ("up to S2E5"); null clears it
        for field in ('current_season', 'current_episode'):
            if field in request.data:
                value = request.data[field]
                try:
                    setattr(instance, field, max(0, int(value)) if value is not None else None)
                except (ValueError, TypeError):
                    return Response({"error": f"{field} must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class ScheduledWatchListCreateView(ListCreateAPIView):
    """
    GET /api/schedule/?start=<iso>&end=<iso> - Watch sessions in range (both
        optional; FullCalendar sends both when paging months/weeks).
    POST /api/schedule/ - Schedule a library movie to watch between two times.
    """
    serializer_class = ScheduledWatchSerializer

    def get_queryset(self):
        qs = owned(ScheduledWatch.objects.select_related('movie').all(), self.request)
        start = self.request.query_params.get('start')
        end = self.request.query_params.get('end')
        if start:
            qs = qs.filter(end_time__gte=start)
        if end:
            qs = qs.filter(start_time__lte=end)
        return qs

    def perform_create(self, serializer):
        watch = serializer.save(owner=self.request.user)
        gcal.sync_watch(watch)  # no-op unless Google Calendar is connected; never raises


class ScheduledWatchDetailView(RetrieveUpdateDestroyAPIView):
    """
    GET /api/schedule/<int:pk>/ - Retrieve one scheduled watch.
    PUT/PATCH /api/schedule/<int:pk>/ - Reschedule, edit notes, or mark watched.
    DELETE /api/schedule/<int:pk>/ - Remove it from the calendar.
    """
    serializer_class = ScheduledWatchSerializer

    def get_queryset(self):
        return owned(ScheduledWatch.objects.select_related('movie').all(), self.request)

    def perform_update(self, serializer):
        watch = serializer.save()
        gcal.sync_watch(watch)

    def perform_destroy(self, instance):
        gcal.delete_event(instance)
        instance.delete()


class TMDBSearchView(APIView):
    """
    GET /api/tmdb/search/?q=...[&type=multi] - Search movies via TMDB or
        fallback mock data; type=multi searches TV shows too.
    """

    def get(self, request):
        query = request.query_params.get('q', request.query_params.get('query', ''))
        page = request.query_params.get('page', 1)
        try:
            page = int(page)
        except (ValueError, TypeError):
            page = 1

        if request.query_params.get('type') == 'multi':
            return Response(tmdb_service.search_multi(query, page=page))
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


class TMDBTvDetailView(APIView):
    """
    GET /api/tmdb/tv/<int:tmdb_id>/ - Fetch TV show detail by TMDB ID.
    """

    def get(self, request, tmdb_id):
        details = tmdb_service.get_tv_details(tmdb_id)
        if not details:
            return Response(
                {"error": f"TV show with tmdb_id {tmdb_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(details)


def _parse_list_id(raw):
    if raw in ('', 'all', None):
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


def _parse_number(raw, cast=int):
    if raw in ('', None):
        return None
    try:
        return cast(raw)
    except (ValueError, TypeError):
        return None


class RecommendationFiltersView(APIView):
    """
    GET /api/recommendations/filters/?list_id=<optional>
    Returns the filter options available, derived from the user's own library.
    """

    def get(self, request):
        list_id = _parse_list_id(request.query_params.get('list_id'))
        return Response(get_filter_options(list_id=list_id, user=request.user))


class RecommendationView(APIView):
    """
    GET /api/recommendations/?count=5&list_id=&genres=&directors=&actors=
        &languages=&runtime_min=&runtime_max=&year_min=&year_max=&min_rating=

    Multi-value filters may be repeated (?genres=Horror&genres=Fantasy) or
    given as a comma-separated string (?genres=Horror,Fantasy).
    Returns movies sampled without replacement from the filtered library.
    """

    def _multi(self, request, key):
        values = request.query_params.getlist(key)
        out = []
        for value in values:
            out.extend(part.strip() for part in str(value).split(',') if part.strip())
        return out

    def get(self, request):
        count = _parse_number(request.query_params.get('count')) or 5
        count = max(1, min(count, 20))

        list_id = _parse_list_id(request.query_params.get('list_id'))

        filters = {
            'genres': self._multi(request, 'genres'),
            'directors': self._multi(request, 'directors'),
            'actors': self._multi(request, 'actors'),
            'languages': self._multi(request, 'languages'),
            'runtime_min': _parse_number(request.query_params.get('runtime_min')),
            'runtime_max': _parse_number(request.query_params.get('runtime_max')),
            'year_min': _parse_number(request.query_params.get('year_min')),
            'year_max': _parse_number(request.query_params.get('year_max')),
            'min_rating': _parse_number(request.query_params.get('min_rating'), cast=float),
        }

        data = get_recommendations(count=count, list_id=list_id, filters=filters, user=request.user)
        return Response(data)


class ChatRecommendView(APIView):
    """
    POST /api/chat/  {"message": "...", "count": 5}

    The Discover "Ask" composer's Web-source path. Turns a free-form
    sentence into TMDB discover criteria - genre, language, year/decade,
    runtime, rating, and cast/crew via TMDB's own person search - and
    returns candidates straight from TMDB: open vocabulary, not limited to
    what the user already owns (see services/chat.py parse_open_vocabulary
    and docs/tasks/discover-chat-nlp.md for the design).

    The Library source's Ask mode never calls this: it parses and filters
    entirely client-side instead, against data already loaded in the
    browser (see frontend/src/lib/discoverEngine.js parseLibraryAsk).
    """

    def post(self, request):
        message = (request.data.get('message') or '').strip()
        if not message:
            return Response(
                {"error": "message is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        count = _parse_number(request.data.get('count')) or 5
        count = max(1, min(count, 20))

        filters, reply, understood = parse_open_vocabulary(message)
        unmatched = filters.get("unmatched") or []

        # Nothing in the sentence was understood: say so instead of drawing
        # random movies that look like an answer (unless they asked for random)
        if not understood and not _RANDOM_RE.search(message):
            tip = "Try a genre, year, studio, actor, director, a franchise, or 'like <movie>'."
            note = (f'I didn\'t recognise "{", ".join(unmatched)}". {tip}' if unmatched
                    else f"I couldn't find anything to search for in that. {tip}")
            return Response({
                "results": [], "degraded": False, "pool_size": 0, "message": note,
                "reply": note, "filters": filters, "understood": [], "unmatched": unmatched,
            })

        data = get_web_recommendations(count=count, filters=filters, user=request.user)

        return Response({
            **data, "reply": reply, "filters": filters,
            "understood": understood, "unmatched": unmatched,
        })


def _purge_expired_trash():
    """Hard-deletes anything past the retention window. Called lazily on every
    Trash read instead of needing a cron/Celery job for a feature this small."""
    cutoff = timezone.now() - timezone.timedelta(days=TRASH_RETENTION_DAYS)
    MovieList.all_objects.filter(deleted_at__isnull=False, deleted_at__lt=cutoff).delete()
    MovieListItem.all_objects.filter(deleted_at__isnull=False, deleted_at__lt=cutoff).delete()


class TrashView(APIView):
    """
    GET /api/trash/ - Everything currently in Trash (lists and individually
        removed movies), newest-removed first. Sweeps anything past the
        30-day retention window before returning.

    A movie removed from a list that is *itself* now in Trash isn't listed
    separately here — restoring the list brings it back as one unit
    (list-level restore only; see the plan doc).
    """

    def get(self, request):
        _purge_expired_trash()

        trashed_lists = owned(MovieList.all_objects.filter(deleted_at__isnull=False), request)
        trashed_list_ids = set(trashed_lists.values_list('id', flat=True))

        trashed_items = (
            owned(MovieListItem.all_objects, request, 'list__owner')
            .select_related('list', 'movie')
            .filter(deleted_at__isnull=False)
            .exclude(list_id__in=trashed_list_ids)
        )

        entries = [
            *TrashedListSerializer(trashed_lists, many=True).data,
            *TrashedItemSerializer(trashed_items, many=True).data,
        ]
        entries.sort(key=lambda e: e['deleted_at'], reverse=True)

        return Response({"count": len(entries), "results": entries})


class TrashRestoreView(APIView):
    """
    POST /api/trash/<str:kind>/<int:pk>/restore/ - Un-delete a trashed list
        or list-item. kind is "list" or "item".
    """

    def post(self, request, kind, pk):
        if kind == 'list':
            obj = get_object_or_404(owned(MovieList.all_objects, request), pk=pk, deleted_at__isnull=False)
            obj.deleted_at = None
            obj.save(update_fields=['deleted_at'])
            return Response(TrashedListSerializer(obj).data)

        if kind == 'item':
            obj = get_object_or_404(owned(MovieListItem.all_objects, request, 'list__owner'), pk=pk, deleted_at__isnull=False)
            obj.deleted_at = None
            obj.save(update_fields=['deleted_at'])
            return Response(TrashedItemSerializer(obj).data)

        return Response({"error": "kind must be 'list' or 'item'."}, status=status.HTTP_400_BAD_REQUEST)


class TrashPermanentDeleteView(APIView):
    """
    DELETE /api/trash/<str:kind>/<int:pk>/ - Permanently delete a trashed
        list or list-item right now, instead of waiting out the 30 days.
    """

    def delete(self, request, kind, pk):
        if kind == 'list':
            obj = get_object_or_404(owned(MovieList.all_objects, request), pk=pk, deleted_at__isnull=False)
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        if kind == 'item':
            obj = get_object_or_404(owned(MovieListItem.all_objects, request, 'list__owner'), pk=pk, deleted_at__isnull=False)
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({"error": "kind must be 'list' or 'item'."}, status=status.HTTP_400_BAD_REQUEST)
