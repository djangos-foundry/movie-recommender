// Pure logic for the Discover section: no React, no network.
//
// A "record" is one distinct movie in the library together with every list
// item that holds it: { key, movie, items }. A movie filed in three lists is
// still one record, so filing habits never skew the draw.

export const MAX_DRAW = 20;
export const MIN_DRAW = 1;

export const STATUS_LABELS = {
  plan_to_watch: 'Plan to watch',
  watching: 'Watching',
  completed: 'Completed',
  dropped: 'Dropped',
};

export const EMPTY_FILTERS = {
  statuses: [],
  genres: [],
  lists: [],
  directors: [],
  actors: [],
  languages: [],
  yearMin: null,
  yearMax: null,
  minRating: null,
  runtimeMax: null,
};

// TMDB returns ISO-639-1 codes; show something readable for the common ones
const LANGUAGE_NAMES = {
  en: 'English', ja: 'Japanese', hi: 'Hindi', ko: 'Korean', fr: 'French',
  es: 'Spanish', de: 'German', it: 'Italian', zh: 'Chinese', cn: 'Chinese',
  ru: 'Russian', pt: 'Portuguese', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
  sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', nl: 'Dutch',
  pl: 'Polish', tr: 'Turkish', th: 'Thai', ar: 'Arabic', fa: 'Persian',
};
export const languageLabel = (code) => LANGUAGE_NAMES[code] || (code || '').toUpperCase();

const MULTI_KEYS = ['statuses', 'genres', 'lists', 'directors', 'actors', 'languages'];
const MAX_PEOPLE_OPTIONS = 40;

export function movieKey(movie, fallback) {
  return movie?.tmdb_id || movie?.id || fallback;
}

export function movieYear(movie) {
  const y = (movie?.release_date || '').slice(0, 4);
  return /^\d{4}$/.test(y) ? Number(y) : null;
}

function castNames(movie) {
  return (movie?.cast || [])
    .filter((c) => c && typeof c === 'object' && c.name)
    .map((c) => String(c.name).trim())
    .filter(Boolean);
}

/** Collapse the per-list items into one record per distinct movie. */
export function buildRecords(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = movieKey(item.movie, `item-${item.id}`);
    const existing = byKey.get(key);
    if (existing) existing.items.push(item);
    else byKey.set(key, { key, movie: item.movie || {}, items: [item] });
  }
  // Most recently added item first, so a card opens the freshest entry
  for (const rec of byKey.values()) rec.items.sort((a, b) => b.id - a.id);
  return [...byKey.values()];
}

export function activeFilterCount(filters) {
  let n = 0;
  for (const key of MULTI_KEYS) n += (filters[key] || []).length;
  if (filters.yearMin !== null || filters.yearMax !== null) n += 1;
  if (filters.minRating !== null) n += 1;
  if (filters.runtimeMax !== null) n += 1;
  return n;
}

/**
 * Within one filter the match is OR (Sci-Fi or Drama); across different
 * filters it is AND. A movie that matches by status or list matches if ANY of
 * its list items does.
 */
export function applyFilters(records, filters) {
  const has = (key) => (filters[key] || []).length > 0;
  const genres = new Set((filters.genres || []).map((g) => g.toLowerCase()));
  const directors = new Set((filters.directors || []).map((d) => d.toLowerCase()));
  const actors = new Set((filters.actors || []).map((a) => a.toLowerCase()));
  const languages = new Set((filters.languages || []).map((l) => l.toLowerCase()));
  const statuses = new Set(filters.statuses || []);
  const lists = new Set((filters.lists || []).map(String));

  return records.filter(({ movie, items }) => {
    if (has('statuses') && !items.some((it) => statuses.has(it.status))) return false;
    if (has('lists') && !items.some((it) => lists.has(String(it.list)))) return false;

    if (has('genres') && !(movie.genres || []).some((g) => genres.has(String(g).toLowerCase()))) return false;
    if (has('directors') && !directors.has((movie.director || '').toLowerCase())) return false;
    if (has('actors') && !castNames(movie).some((n) => actors.has(n.toLowerCase()))) return false;
    if (has('languages') && !languages.has((movie.original_language || '').toLowerCase())) return false;

    // Missing data (year / runtime unknown) is never a reason to exclude
    const year = movieYear(movie);
    if (year !== null) {
      if (filters.yearMin !== null && year < filters.yearMin) return false;
      if (filters.yearMax !== null && year > filters.yearMax) return false;
    }
    if (filters.runtimeMax !== null && movie.runtime && movie.runtime > filters.runtimeMax) return false;
    if (filters.minRating !== null && Number(movie.vote_average || 0) < filters.minRating) return false;

    return true;
  });
}

function tally(list) {
  const counts = new Map();
  for (const v of list) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Filter menu built from the library itself, so no option can match nothing. */
export function getFilterOptions(records) {
  const years = [];
  const runtimes = [];
  const genres = [];
  const directors = [];
  const actors = [];
  const languages = [];
  const statuses = [];
  const listCounts = new Map();

  for (const { movie, items } of records) {
    genres.push(...(movie.genres || []).map((g) => String(g).trim()).filter(Boolean));
    if ((movie.director || '').trim()) directors.push(movie.director.trim());
    actors.push(...castNames(movie));
    if ((movie.original_language || '').trim()) languages.push(movie.original_language.trim());
    const y = movieYear(movie);
    if (y) years.push(y);
    if (movie.runtime) runtimes.push(movie.runtime);

    statuses.push(...new Set(items.map((it) => it.status)));
    for (const it of items) {
      const entry = listCounts.get(it.list) || { id: it.list, name: it.list_name || 'List', count: 0 };
      entry.count += 1;
      listCounts.set(it.list, entry);
    }
  }

  return {
    statuses: tally(statuses),
    genres: tally(genres),
    lists: [...listCounts.values()].sort((a, b) => b.count - a.count),
    directors: tally(directors).slice(0, MAX_PEOPLE_OPTIONS),
    actors: tally(actors).slice(0, MAX_PEOPLE_OPTIONS),
    languages: tally(languages),
    years: { min: years.length ? Math.min(...years) : 0, max: years.length ? Math.max(...years) : 0 },
    runtime: { max: runtimes.length ? Math.max(...runtimes) : 0 },
  };
}

/** Fisher-Yates over a copy: a uniform random permutation. */
function shuffled(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Take `count` records out of the bag without putting them back.
 * `seen` holds keys already drawn; anything in it is out of the bag.
 */
export function drawFromBag(pool, seen, count, rng = Math.random) {
  const remaining = pool.filter((rec) => !seen.has(rec.key));
  const picks = shuffled(remaining, rng).slice(0, Math.max(0, count));
  return { picks, remainingAfter: remaining.length - picks.length };
}

export function clampCount(value, fallback = 5) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DRAW, Math.max(MIN_DRAW, n));
}

/** Map the UI filters onto the query the backend recommender understands. */
export function toBackendFilters(filters) {
  const out = {
    genres: filters.genres || [],
    directors: filters.directors || [],
    actors: filters.actors || [],
    languages: filters.languages || [],
  };
  if (filters.yearMin !== null) out.year_min = filters.yearMin;
  if (filters.yearMax !== null) out.year_max = filters.yearMax;
  if (filters.minRating !== null) out.min_rating = filters.minRating;
  if (filters.runtimeMax !== null) out.runtime_max = filters.runtimeMax;
  return out;
}
