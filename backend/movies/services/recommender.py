"""
Recommendation engine based on random sampling without replacement.

No machine learning is involved. The user's library defines a taste profile
(which genres they actually collect), that profile weights which genres get
drawn as seeds, and the final five picks are a uniform random sample without
replacement from the resulting candidate pool.

Filters narrow the *library* before the profile is built. That is the whole
point: filtering to Horror cuts a 100-movie library down to the 20 horror
titles, and the recommendation is then drawn from those 20 - not from all 100.
Where TMDB supports the same constraint (language, runtime, year, rating,
cast, crew) it is also passed through to the candidate query, so the movies
that come back respect the filter too.

Pipeline:
    1. Read every movie in the user's lists        -> the library
    2. Apply the user's filters                    -> the narrowed library
    3. Count genre frequencies on what remains     -> the taste profile
    4. Draw seed genres, weighted, WITHOUT replacement
    5. Pull a candidate pool from TMDB for those genres + constraints
    6. Drop anything already in the library        -> no re-recommending
    7. random.sample(pool, n)                      -> final draw WITHOUT replacement
"""

import random
from collections import Counter

from ..models import MovieListItem
from .tmdb import tmdb_service

# How many genres to seed the candidate pool with
SEED_GENRE_COUNT = 3

# How many TMDB discover pages to pull per request
DISCOVER_PAGES = 2

# Cap on how many distinct people/languages are offered as filter options
MAX_PEOPLE_OPTIONS = 40


def _clean_list(values):
    """Normalise a filter value into a list of non-empty strings."""
    if values is None:
        return []
    if isinstance(values, str):
        values = [values]
    return [str(v).strip() for v in values if str(v).strip()]


def _movie_year(movie):
    year = (movie.release_date or "")[:4]
    return int(year) if year.isdigit() else None


def _cast_names(movie):
    return {
        str(c.get("name", "")).strip()
        for c in (movie.cast or [])
        if isinstance(c, dict) and c.get("name")
    }


def _library_movies(list_id=None):
    """
    Every distinct movie across the user's lists.

    A movie filed in three lists is still one movie - de-duplicating here stops
    filing habits from skewing the taste profile.
    """
    items = MovieListItem.objects.select_related('movie')
    if list_id is not None:
        items = items.filter(list_id=list_id)

    movies = []
    seen = set()
    for item in items:
        movie = item.movie
        if movie and movie.id not in seen:
            seen.add(movie.id)
            movies.append(movie)
    return movies


def apply_filters(movies, filters):
    """
    Narrow the library to the movies matching every supplied filter.

    Within one filter the match is OR (Horror *or* Fantasy); across different
    filters it is AND (Horror *and* directed by Nolan). A filter that was not
    supplied is simply not applied.
    """
    filters = filters or {}

    genres = {g.lower() for g in _clean_list(filters.get('genres'))}
    directors = {d.lower() for d in _clean_list(filters.get('directors'))}
    actors = {a.lower() for a in _clean_list(filters.get('actors'))}
    languages = {l.lower() for l in _clean_list(filters.get('languages'))}

    runtime_min = filters.get('runtime_min')
    runtime_max = filters.get('runtime_max')
    year_min = filters.get('year_min')
    year_max = filters.get('year_max')
    min_rating = filters.get('min_rating')

    kept = []
    for movie in movies:
        if genres and not (genres & {str(g).lower() for g in (movie.genres or [])}):
            continue
        if directors and (movie.director or '').lower() not in directors:
            continue
        if actors and not (actors & {n.lower() for n in _cast_names(movie)}):
            continue
        if languages and (movie.original_language or '').lower() not in languages:
            continue

        runtime = movie.runtime or 0
        # runtime 0 means "unknown" - don't exclude on missing data
        if runtime:
            if runtime_min and runtime < int(runtime_min):
                continue
            if runtime_max and runtime > int(runtime_max):
                continue

        year = _movie_year(movie)
        if year is not None:
            if year_min and year < int(year_min):
                continue
            if year_max and year > int(year_max):
                continue

        if min_rating and float(movie.vote_average or 0) < float(min_rating):
            continue

        kept.append(movie)

    return kept


def get_filter_options(list_id=None):
    """
    Build the filter menu *from the user's own library*.

    The UI only ever offers genres, directors, actors and languages that
    actually appear in the movies they saved, so no filter can produce an
    empty result by referring to something they do not own.
    """
    movies = _library_movies(list_id)

    genres = Counter()
    directors = Counter()
    actors = Counter()
    languages = Counter()
    runtimes = []
    years = []

    for movie in movies:
        for g in (movie.genres or []):
            name = str(g).strip()
            if name:
                genres[name] += 1

        if (movie.director or '').strip():
            directors[movie.director.strip()] += 1

        for name in _cast_names(movie):
            actors[name] += 1

        if (movie.original_language or '').strip():
            languages[movie.original_language.strip()] += 1

        if movie.runtime:
            runtimes.append(movie.runtime)

        year = _movie_year(movie)
        if year:
            years.append(year)

    return {
        "genres": [{"value": n, "count": c} for n, c in genres.most_common()],
        "directors": [{"value": n, "count": c} for n, c in directors.most_common(MAX_PEOPLE_OPTIONS)],
        "actors": [{"value": n, "count": c} for n, c in actors.most_common(MAX_PEOPLE_OPTIONS)],
        "languages": [{"value": n, "count": c} for n, c in languages.most_common()],
        "runtime": {
            "min": min(runtimes) if runtimes else 0,
            "max": max(runtimes) if runtimes else 0,
        },
        "years": {
            "min": min(years) if years else 0,
            "max": max(years) if years else 0,
        },
        "library_size": len(movies),
    }


def build_taste_profile(list_id=None, filters=None):
    """
    Count how often each genre appears across the (optionally filtered) library.

    Returns (genre_counter, library_tmdb_ids, filtered_size, total_size).
    `library_tmdb_ids` covers the WHOLE library, not just the filtered subset -
    a movie you own must never be recommended back, even if the current filter
    happens to exclude it.
    """
    all_movies = _library_movies(list_id)
    filtered = apply_filters(all_movies, filters)

    genre_counter = Counter()
    for movie in filtered:
        for genre in (movie.genres or []):
            name = str(genre).strip()
            if name:
                genre_counter[name] += 1

    library_tmdb_ids = {m.tmdb_id for m in all_movies}
    return genre_counter, library_tmdb_ids, len(filtered), len(all_movies)


def weighted_sample_without_replacement(weights, k, rng=None):
    """
    Draw up to k distinct keys, where a key's chance of being drawn is
    proportional to its weight. Each key can be drawn at most once - once
    picked it is removed from the pool, which is what makes this sampling
    *without* replacement.
    """
    rng = rng or random
    pool = {key: float(weight) for key, weight in weights.items() if weight > 0}
    picked = []

    while pool and len(picked) < k:
        total = sum(pool.values())
        if total <= 0:
            break

        threshold = rng.uniform(0, total)
        cumulative = 0.0
        chosen = None
        for key, weight in pool.items():
            cumulative += weight
            if cumulative >= threshold:
                chosen = key
                break
        if chosen is None:
            chosen = next(iter(pool))

        picked.append(chosen)
        del pool[chosen]  # removed -> cannot be drawn again

    return picked


def _person_ids(movies, filters):
    """
    Resolve the filtered actor/director names to TMDB person ids using the
    library's own stored credits, so the candidate query can be constrained
    to those people too.

    Some stored credits carry no id (they came from the mock fallback). Those
    simply yield no id - the library-side name filter still applied, so the
    filter is never silently ignored, it just cannot narrow TMDB as well.
    """
    wanted_actors = {a.lower() for a in _clean_list(filters.get('actors'))}
    wanted_directors = {d.lower() for d in _clean_list(filters.get('directors'))}

    cast_ids, crew_ids = set(), set()
    for movie in movies:
        if wanted_actors:
            for c in (movie.cast or []):
                if isinstance(c, dict) and c.get('id') and str(c.get('name', '')).lower() in wanted_actors:
                    cast_ids.add(c['id'])
        if wanted_directors:
            for c in (movie.crew or []):
                if (
                    isinstance(c, dict)
                    and c.get('id')
                    and c.get('job') == 'Director'
                    and str(c.get('name', '')).lower() in wanted_directors
                ):
                    crew_ids.add(c['id'])

    return sorted(cast_ids), sorted(crew_ids)


def get_recommendations(count=5, list_id=None, filters=None, rng=None):
    """
    Return `count` movies sampled without replacement from the genres of the
    user's filtered library.

    The response reports both the filtered and total library size, so the UI
    can show "drawn from 20 of your 100 movies" rather than being a black box.
    """
    rng = rng or random
    filters = filters or {}

    genre_counter, library_tmdb_ids, filtered_size, total_size = build_taste_profile(
        list_id, filters
    )

    base = {
        "seed_genres": [],
        "top_genres": genre_counter.most_common(5),
        "library_size": filtered_size,
        "library_total": total_size,
        "filters_applied": {k: v for k, v in filters.items() if v not in (None, '', [], {})},
        "pool_size": 0,
        "degraded": False,
    }

    if total_size == 0:
        return {
            **base,
            "results": [],
            "message": "Add some movies to your lists first - recommendations are drawn from the genres you collect.",
        }

    if filtered_size == 0:
        return {
            **base,
            "results": [],
            "message": "No movies in your library match those filters. Try loosening them.",
        }

    # An explicit genre filter IS the user's stated intent - use it directly as
    # the seed set instead of re-sampling genres they did not ask for.
    chosen_genres = _clean_list(filters.get('genres'))
    if chosen_genres:
        seed_genres = chosen_genres
    else:
        seed_genres = weighted_sample_without_replacement(
            genre_counter, SEED_GENRE_COUNT, rng=rng
        )

    # Constraints TMDB itself can honour, so results respect the filter too
    filtered_movies = apply_filters(_library_movies(list_id), filters)
    cast_ids, crew_ids = _person_ids(filtered_movies, filters)
    languages = _clean_list(filters.get('languages'))

    criteria = {
        "runtime_min": filters.get('runtime_min'),
        "runtime_max": filters.get('runtime_max'),
        "year_min": filters.get('year_min'),
        "year_max": filters.get('year_max'),
        "min_rating": filters.get('min_rating'),
        "cast_ids": cast_ids,
        "crew_ids": crew_ids,
    }

    # TMDB's with_original_language takes a single value, so several selected
    # languages mean one query each, merged - otherwise picking two languages
    # would silently drop the language constraint altogether.
    language_queries = languages or [None]
    pages = DISCOVER_PAGES if len(language_queries) == 1 else 1

    pool = {}
    discover_status = {}
    for language in language_queries:
        for page in range(1, pages + 1):
            candidates = tmdb_service.discover_movies(
                genre_names=seed_genres,
                page=page,
                criteria={**criteria, "language": language},
                status_out=discover_status,
            )
            for candidate in candidates:
                tmdb_id = candidate.get("tmdb_id") or candidate.get("id")
                if not tmdb_id or tmdb_id in library_tmdb_ids:
                    continue  # already in a list - never recommend it back
                pool.setdefault(tmdb_id, candidate)

    degraded = bool(discover_status.get("degraded"))

    if not pool:
        return {
            **base,
            "seed_genres": seed_genres,
            "results": [],
            "degraded": degraded,
            "message": (
                "Could not reach TMDB just now, so there was nothing to draw from. "
                "Check your connection and try again."
                if degraded else
                "No new movies matched those filters. Try widening them or adding more titles to your lists."
            ),
        }

    # The final draw: uniform, distinct, without replacement
    candidates = list(pool.values())
    picks = rng.sample(candidates, min(count, len(candidates)))

    seed_set = {g.lower() for g in seed_genres}
    for pick in picks:
        matched = [g for g in (pick.get("genres") or []) if g.lower() in seed_set]
        pick["matched_genres"] = matched
        pick["reason"] = (
            f"Because your list leans {matched[0]}" if matched
            else "A wildcard pick from your genres"
        )

    return {
        **base,
        "seed_genres": seed_genres,
        "pool_size": len(candidates),
        "results": picks,
        "degraded": degraded,
        "message": (
            "TMDB was unreachable, so these came from a small offline catalogue."
            if degraded else ""
        ),
    }
