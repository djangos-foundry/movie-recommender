"""
Episode arithmetic for TV shows, from the per-season episode counts stored on
Movie.seasons. Kept in step with frontend/src/lib/media.js.
"""


def next_episode(movie, season, episode):
    """The episode after (season, episode), moving into the next season when
    this one is finished; None past the last known episode."""
    counts = {s.get('season_number'): s.get('episode_count') or 0 for s in movie.seasons or []}
    total = counts.get(season, 0)
    if not total or episode < total:
        return season, episode + 1
    later = sorted(n for n, c in counts.items() if n is not None and n > season and c > 0)
    return (later[0], 1) if later else None


def block_end(movie, season, episode, count=1):
    """Last episode of a run of `count` episodes starting at (season, episode)."""
    end = (season, episode)
    for _ in range(max(1, count) - 1):
        nxt = next_episode(movie, *end)
        if not nxt:
            break
        end = nxt
    return end


def episode_label(movie, season, episode, count=1):
    """'S2E8', 'S2E8–E10' for a run in one season, 'S2E9–S3E1' across seasons."""
    start = f"S{season}E{episode}"
    end_season, end_episode = block_end(movie, season, episode, count)
    if (end_season, end_episode) == (season, episode):
        return start
    if end_season == season:
        return f"{start}–E{end_episode}"
    return f"{start}–S{end_season}E{end_episode}"


def advance_progress(watch):
    """A scheduled episode (or binge block) marked watched moves the show's
    progress up to its last episode, on every list entry of that show that
    isn't already further along. A show still in Plan to Watch becomes
    Watching."""
    from ..models import MovieListItem

    movie = watch.movie
    if movie.media_type != 'tv' or watch.season_number is None or watch.episode_number is None:
        return
    end = block_end(movie, watch.season_number, watch.episode_number, watch.episode_count or 1)
    entries = MovieListItem.objects.filter(
        list__owner=watch.owner, list__deleted_at__isnull=True, movie=movie,
    )
    for entry in entries:
        current = None
        if entry.current_season is not None and entry.current_episode is not None:
            current = (entry.current_season, entry.current_episode)
        if current is not None and current >= end:
            continue
        entry.current_season, entry.current_episode = end
        if entry.status == 'plan_to_watch':
            entry.status = 'watching'
        entry.save(update_fields=['current_season', 'current_episode', 'status'])
