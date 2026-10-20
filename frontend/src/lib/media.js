// Small helpers for titles that can be a movie or a TV show (movie.media_type).
// TMDB numbers movies and shows separately, so a title is keyed by both.

export const isTv = (movie) => movie?.media_type === 'tv';

/** Stable key for a title: 'movie:603' or 'tv:1399'. */
export function titleKey(movie, fallback) {
  const id = movie?.tmdb_id || movie?.id;
  if (!id) return fallback;
  return `${movie?.media_type || 'movie'}:${id}`;
}

/** Key for a list item's title, falling back to the item itself. */
export const itemKey = (item) => titleKey(item?.movie, `item-${item?.id}`);

/** "2022–" for a running show, "2005–2013" for an ended one, "2010" for a movie. */
export function yearLabel(movie) {
  const start = (movie?.release_date || '').slice(0, 4);
  if (!isTv(movie) || !start) return start;
  const ended = ['Ended', 'Canceled'].includes(movie.release_status);
  const end = (movie.last_air_date || '').slice(0, 4);
  if (!ended) return `${start}–`;
  return end && end !== start ? `${start}–${end}` : start;
}

export function seasonsLabel(movie) {
  const n = Number(movie?.number_of_seasons);
  if (!n) return '';
  return `${n} season${n === 1 ? '' : 's'}`;
}

/** "S2E5" */
export const episodeCode = (season, episode) => `S${season}E${episode}`;

/** Progress of a show's list item, e.g. "S2E5", or '' when not started. */
export function progressLabel(item) {
  if (item?.current_season == null || item?.current_episode == null) return '';
  return episodeCode(item.current_season, item.current_episode);
}

/** Regular seasons in order, with Specials (season 0) last. */
export function orderedSeasons(movie) {
  const seasons = Array.isArray(movie?.seasons) ? movie.seasons : [];
  return [...seasons].sort((a, b) => {
    const x = a.season_number || 999;
    const y = b.season_number || 999;
    return x - y;
  });
}

function episodeCount(movie, season) {
  const s = (movie?.seasons || []).find((x) => x.season_number === season);
  return s ? Number(s.episode_count) || 0 : 0;
}

/**
 * The episode after (season, episode), moving into the next season when this one
 * is finished. With no progress yet that's S1E1. Returns null past the last
 * known episode.
 */
export function nextEpisode(movie, season, episode) {
  if (season == null || episode == null || (season === 0 && episode === 0)) return { season: 1, episode: 1 };
  const count = episodeCount(movie, season);
  if (!count || episode < count) return { season, episode: episode + 1 };
  const later = orderedSeasons(movie).find((s) => s.season_number > season && s.episode_count > 0);
  return later ? { season: later.season_number, episode: 1 } : null;
}

/** The episode before (season, episode), or null at S1E1 (meaning "not started"). */
export function previousEpisode(movie, season, episode) {
  if (season == null || episode == null) return null;
  if (episode > 1) return { season, episode: episode - 1 };
  const earlier = orderedSeasons(movie)
    .filter((s) => s.season_number > 0 && s.season_number < season && s.episode_count > 0)
    .pop();
  return earlier ? { season: earlier.season_number, episode: earlier.episode_count } : null;
}

/** How many episodes of `season` are watched, given progress at (season, episode). */
export function watchedInSeason(seasonInfo, item) {
  const cs = item?.current_season;
  const ce = item?.current_episode;
  if (cs == null || ce == null) return 0;
  if (seasonInfo.season_number < cs && seasonInfo.season_number > 0) return seasonInfo.episode_count;
  if (seasonInfo.season_number === cs) return Math.min(ce, seasonInfo.episode_count || ce);
  return 0;
}

/** Display title for a scheduled watch: "Severance · S2E6" for an episode. */
export function watchTitle(movie, season, episode) {
  const title = movie?.title || '';
  if (season == null || episode == null) return title;
  return `${title} · ${episodeCode(season, episode)}`;
}
