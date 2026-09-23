"""
Recommendation engine based on random sampling without replacement.

No machine learning is involved. The user's library defines a taste profile
(which genres they actually collect), that profile weights which genres get
drawn as seeds, and the final five picks are a uniform random sample without
replacement from the resulting candidate pool.

Pipeline:
    1. Read every movie in the user's lists  -> the library
    2. Count genre frequencies               -> the taste profile
    3. Draw seed genres, weighted, WITHOUT replacement
    4. Pull a candidate pool from TMDB for those genres
    5. Drop anything already in the library  -> no re-recommending
    6. random.sample(pool, n)                -> final draw WITHOUT replacement
"""

import random
from collections import Counter

from ..models import Movie, MovieListItem
from .tmdb import tmdb_service

# How many genres to seed the candidate pool with
SEED_GENRE_COUNT = 3

# How many TMDB discover pages to pull per request
DISCOVER_PAGES = 2


def build_taste_profile(list_id=None):
    """
    Count how often each genre appears across the movies in the user's lists.

    Returns (genre_counter, library_tmdb_ids, library_size).
    A movie in three lists is still one movie - the library is de-duplicated
    by tmdb_id so a movie filed in many lists cannot skew the profile.
    """
    items = MovieListItem.objects.select_related('movie')
    if list_id is not None:
        items = items.filter(list_id=list_id)

    genre_counter = Counter()
    library_tmdb_ids = set()
    seen_movie_ids = set()

    for item in items:
        movie = item.movie
        if not movie or movie.id in seen_movie_ids:
            continue
        seen_movie_ids.add(movie.id)
        library_tmdb_ids.add(movie.tmdb_id)

        for genre in (movie.genres or []):
            name = str(genre).strip()
            if name:
                genre_counter[name] += 1

    return genre_counter, library_tmdb_ids, len(seen_movie_ids)


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


def get_recommendations(count=5, list_id=None, rng=None):
    """
    Return `count` movies sampled without replacement, biased toward the
    genres the user already collects.

    The response always includes the profile used, so the UI can explain
    *why* these movies came back rather than presenting a black box.
    """
    rng = rng or random

    genre_counter, library_tmdb_ids, library_size = build_taste_profile(list_id)

    if library_size == 0:
        return {
            "results": [],
            "seed_genres": [],
            "library_size": 0,
            "pool_size": 0,
            "message": "Add some movies to your lists first - recommendations are drawn from the genres you collect.",
        }

    # Genres weighted by how many of the user's movies carry them
    seed_genres = weighted_sample_without_replacement(
        genre_counter, SEED_GENRE_COUNT, rng=rng
    )

    # Build the candidate pool, de-duplicated by tmdb_id
    pool = {}
    for page in range(1, DISCOVER_PAGES + 1):
        for candidate in tmdb_service.discover_by_genres(seed_genres, page=page):
            tmdb_id = candidate.get("tmdb_id") or candidate.get("id")
            if not tmdb_id:
                continue
            if tmdb_id in library_tmdb_ids:
                continue  # already in a list - never recommend it back
            pool.setdefault(tmdb_id, candidate)

    if not pool:
        return {
            "results": [],
            "seed_genres": seed_genres,
            "library_size": library_size,
            "pool_size": 0,
            "message": "No new movies found for your genres right now. Try adding a few more titles to your lists.",
        }

    # The final draw: uniform, distinct, without replacement
    candidates = list(pool.values())
    picks = rng.sample(candidates, min(count, len(candidates)))

    # Attach the reason each pick surfaced
    seed_set = {g.lower() for g in seed_genres}
    for pick in picks:
        matched = [g for g in (pick.get("genres") or []) if g.lower() in seed_set]
        pick["matched_genres"] = matched
        pick["reason"] = (
            f"Because your list leans {matched[0]}" if matched
            else "A wildcard pick from your genres"
        )

    return {
        "results": picks,
        "seed_genres": seed_genres,
        "top_genres": genre_counter.most_common(5),
        "library_size": library_size,
        "pool_size": len(candidates),
        "message": "",
    }
