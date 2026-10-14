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


def _library_movies(list_id=None, user=None):
    """
    Every distinct movie across the user's lists.

    A movie filed in three lists is still one movie - de-duplicating here stops
    filing habits from skewing the taste profile.
    """
    items = MovieListItem.objects.select_related('movie')
    if user is not None and user.is_authenticated:
        items = items.filter(list__owner=user)
    else:
        items = items.none()  # no signed-in/guest user: no library
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


def get_filter_options(list_id=None, user=None):
    """
    Build the filter menu *from the user's own library*.

    The UI only ever offers genres, directors, actors and languages that
    actually appear in the movies they saved, so no filter can produce an
    empty result by referring to something they do not own.
    """
    movies = _library_movies(list_id, user)

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


def build_taste_profile(list_id=None, filters=None, user=None):
    """
    Count how often each genre appears across the (optionally filtered) library.

    Returns (genre_counter, library_tmdb_ids, filtered_size, total_size).
    `library_tmdb_ids` covers the WHOLE library, not just the filtered subset -
    a movie you own must never be recommended back, even if the current filter
    happens to exclude it.
    """
    all_movies = _library_movies(list_id, user)
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


def get_recommendations(count=5, list_id=None, filters=None, rng=None, user=None):
    """
    Return `count` movies sampled without replacement from the genres of the
    user's filtered library.

    The response reports both the filtered and total library size, so the UI
    can show "drawn from 20 of your 100 movies" rather than being a black box.
    """
    rng = rng or random
    filters = filters or {}

    genre_counter, library_tmdb_ids, filtered_size, total_size = build_taste_profile(
        list_id, filters, user
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
    filtered_movies = apply_filters(_library_movies(list_id, user), filters)
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


def _filter_locally(movies, genres, criteria):
    """Apply genre / excluded-genre / year / language / rating rules to a
    ready-made list of movies (the discover call does this itself on TMDB)."""
    wanted = {g.lower() for g in genres}
    banned = {g.lower() for g in criteria.get("exclude_genres") or []}
    kept = []
    for movie in movies:
        have = {g.lower() for g in movie.get("genres", [])}
        if wanted and not wanted & have:
            continue
        if banned & have:
            continue
        year = (movie.get("release_date") or "")[:4]
        if year.isdigit():
            if criteria.get("year_min") and int(year) < int(criteria["year_min"]):
                continue
            if criteria.get("year_max") and int(year) > int(criteria["year_max"]):
                continue
        elif criteria.get("year_min") or criteria.get("year_max"):
            continue
        language = criteria.get("language")
        if language and movie.get("original_language") != language:
            continue
        if criteria.get("min_rating") and movie.get("vote_average", 0) < float(criteria["min_rating"]):
            continue
        kept.append(movie)
    return kept


def get_web_recommendations(count=5, filters=None, rng=None, user=None):
    """
    Open-vocabulary web search: pull straight from TMDB using the given
    criteria, excluding anything already in ANY of the user's lists.

    Unlike get_recommendations, this never requires an already-owned movie
    to match the filters first - that's the whole point of Web + Ask. Its
    filters come from the chat parser (services/chat.py
    parse_open_vocabulary), which can name a language, year or person that
    nothing in the library resembles yet; get_recommendations would reject
    that as "no movies in your library match", which is the wrong message
    for "find something new". Only the chat endpoint calls this - the
    ordinary Web-source random draw keeps using get_recommendations, whose
    taste-profile seeding from the library is intentional there.
    """
    rng = rng or random
    filters = filters or {}

    library_tmdb_ids = {m.tmdb_id for m in _library_movies(None, user)}

    genres = _clean_list(filters.get("genres"))
    criteria = {
        "language": filters.get("language"),
        "year_min": filters.get("year_min"),
        "year_max": filters.get("year_max"),
        "runtime_max": filters.get("runtime_max"),
        "min_rating": filters.get("min_rating"),
        "cast_ids": filters.get("cast_ids") or [],
        "crew_ids": filters.get("crew_ids") or [],
        "company_ids": filters.get("company_ids") or [],
        "keyword_ids": filters.get("keyword_ids") or [],
        "exclude_genres": _clean_list(filters.get("exclude_genres")),
    }

    # A named franchise ("insidious") is a fixed set of movies, not a filter:
    # list its films in release order instead of sampling at random.
    collection_ids = filters.get("collection_ids") or []
    if collection_ids:
        franchise = {}
        for collection_id in collection_ids:
            for movie in tmdb_service.get_collection_movies(collection_id):
                year = (movie.get("release_date") or "")[:4]
                if year.isdigit():
                    if criteria["year_min"] and int(year) < int(criteria["year_min"]):
                        continue
                    if criteria["year_max"] and int(year) > int(criteria["year_max"]):
                        continue
                if movie["tmdb_id"] not in library_tmdb_ids:
                    franchise.setdefault(movie["tmdb_id"], movie)
        listed = sorted(franchise.values(), key=lambda m: m.get("release_date") or "9999")
        if listed:
            return {"results": listed[:count], "degraded": False, "pool_size": len(listed), "message": ""}
        return {
            "results": [], "degraded": False, "pool_size": 0,
            "message": "You already own everything in that franchise, or TMDB lists nothing for it.",
        }

    # "movies like X": TMDB's own recommendations for that title. Sampled so
    # asking again shows different ones; the movie itself and anything the
    # user owns are skipped; a year filter still applies.
    similar = filters.get("similar_to")
    if similar:
        related = {}
        for movie in tmdb_service.get_similar_movies(similar["id"]):
            year = (movie.get("release_date") or "")[:4]
            if year.isdigit():
                if criteria["year_min"] and int(year) < int(criteria["year_min"]):
                    continue
                if criteria["year_max"] and int(year) > int(criteria["year_max"]):
                    continue
            if movie["tmdb_id"] != similar["id"] and movie["tmdb_id"] not in library_tmdb_ids:
                related.setdefault(movie["tmdb_id"], movie)
        if not related:
            return {
                "results": [], "degraded": False, "pool_size": 0,
                "message": f"TMDB has no recommendations for {similar['title']} that you don't already own.",
            }
        # TMDB lists these most relevant first and quality falls off quickly,
        # so vary the picks only within the top of the list
        candidates = list(related.values())[:15]
        picks = rng.sample(candidates, min(count, len(candidates)))
        return {"results": picks, "degraded": False, "pool_size": len(candidates), "message": ""}

    # Sources TMDB can't filter itself - one of its ready-made lists (trending,
    # now playing, ...) or a director's own directing credits. They are fetched
    # whole and filtered here with the same rules the discover call applies.
    list_kind = filters.get("list_kind")
    director_ids = filters.get("director_ids") or []
    if list_kind or director_ids:
        if list_kind:
            source = tmdb_service.get_movie_list(list_kind)
        else:
            source = [
                m for person_id in director_ids
                for m in tmdb_service.get_director_movies(person_id)
                if m["vote_count"] >= 10
            ]
        kept = {
            m["tmdb_id"]: m for m in _filter_locally(source, genres, criteria)
            if m["tmdb_id"] not in library_tmdb_ids
        }
        candidates = list(kept.values())
        if list_kind:
            candidates = candidates[:20]  # TMDB ranks these; stay near the top
        if not candidates:
            return {
                "results": [], "degraded": not source, "pool_size": 0,
                "message": (
                    "Could not reach TMDB just now. Check your connection and try again."
                    if not source else "Nothing there matched that. Try loosening it."
                ),
            }
        picks = rng.sample(candidates, min(count, len(candidates)))
        return {"results": picks, "degraded": False, "pool_size": len(candidates), "message": ""}

    # A narrow, specific ask (a language + a near year, say) has a small
    # real candidate pool - a high popularity/vote-count bar would often
    # empty it out entirely, so this uses a much lower floor than the
    # ordinary random draw does.
    pool = {}
    discover_status = {}
    for page in (1, 2):
        candidates = tmdb_service.discover_movies(
            genre_names=genres, page=page, min_votes=10, criteria=criteria,
            status_out=discover_status,
        )
        for candidate in candidates:
            tmdb_id = candidate.get("tmdb_id") or candidate.get("id")
            if not tmdb_id or tmdb_id in library_tmdb_ids:
                continue
            pool.setdefault(tmdb_id, candidate)
        if not candidates:
            break

    degraded = bool(discover_status.get("degraded"))

    if not pool:
        return {
            "results": [],
            "degraded": degraded,
            "pool_size": 0,
            "message": (
                "Could not reach TMDB just now. Check your connection and try again."
                if degraded else
                "Nothing on TMDB matched that. Try loosening it."
            ),
        }

    candidates = list(pool.values())
    picks = rng.sample(candidates, min(count, len(candidates)))
    return {"results": picks, "degraded": degraded, "pool_size": len(candidates), "message": ""}
