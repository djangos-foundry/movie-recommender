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
  title: '', // free-text title query, matched on letters and digits only
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

/** Lowercase and drop everything but letters and digits: "Spider-Man" -> "spiderman". */
export function normalizeTitle(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

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
  if ((filters.title || '').trim()) n += 1;
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
  const titleQuery = normalizeTitle(filters.title);

  return records.filter(({ movie, items }) => {
    if (titleQuery
      && !normalizeTitle(movie.title).includes(titleQuery)
      && !normalizeTitle(movie.original_title).includes(titleQuery)) return false;

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
  const titles = new Set();

  for (const { movie, items } of records) {
    if ((movie.title || '').trim()) titles.add(movie.title.trim());
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
    // Everyone in the library, most movies first. The filter panel shows only the top few
    // until you search, so a one-movie actor is still findable (and Ask understands them).
    directors: tally(directors),
    actors: tally(actors),
    languages: tally(languages),
    years: { min: years.length ? Math.min(...years) : 0, max: years.length ? Math.max(...years) : 0 },
    runtime: { max: runtimes.length ? Math.max(...runtimes) : 0 },
    titles: [...titles],
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

// ── Library "Ask": parse a sentence into the same filters shape the filter
// panel already produces, so the existing applyFilters/drawFromBag pipeline
// above can run on it unchanged. See docs/tasks/discover-chat-nlp.md.
//
// Deliberately clamped to the user's OWN vocabulary (their lists, genres,
// directors, actors, languages) - the mirror image of the Web/Ask parser on
// the backend, which is deliberately open. No dependencies, no ML model:
// dictionary lookup plus a handful of regexes, run client-side against data
// already loaded in the browser.

const ASK_STATUS_PHRASES = [
  [/\b(haven'?t watched|not watched yet|still (need|have) to watch|unwatched|plan(?:ning)? to watch|to watch)\b/, 'plan_to_watch'],
  [/\b(already watched|watched already|seen (it|them) already|finished watching)\b/, 'completed'],
  [/\b(currently watching|watching now|still watching|in progress)\b/, 'watching'],
  [/\b(dropped|gave up on|stopped watching)\b/, 'dropped'],
];

const ASK_MOODS = {
  scary: 'horror', spooky: 'horror', creepy: 'horror',
  funny: 'comedy', hilarious: 'comedy', laugh: 'comedy',
  romantic: 'romance', love: 'romance',
  'sci-fi': 'science fiction', scifi: 'science fiction', space: 'science fiction', futuristic: 'science fiction',
  thrilling: 'thriller', tense: 'thriller', suspense: 'thriller',
  animated: 'animation', cartoon: 'animation',
  gangster: 'crime', heist: 'crime',
};

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasWord(text, phrase) {
  if (!phrase) return false;
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${esc}\\b`, 'i').test(text);
}

/** Literal years, decades and relative-date phrases -> { yearMin, yearMax }. */
function parseAskYearRange(text) {
  let yearMin = null;
  let yearMax = null;

  const decade = text.match(/\b(19|20)(\d0)s\b/);
  if (decade) {
    const base = Number(decade[1] + decade[2]);
    if (/\blate\b/.test(text)) { yearMin = base + 5; yearMax = base + 9; }
    else if (/\bearly\b/.test(text)) { yearMin = base; yearMax = base + 4; }
    else { yearMin = base; yearMax = base + 9; }
  }

  const before = text.match(/\bbefore (\d{4})\b/);
  if (before) yearMax = Number(before[1]) - 1;
  const after = text.match(/\bafter (\d{4})\b/);
  if (after) yearMin = Number(after[1]) + 1;

  const between = text.match(/\bbetween (\d{4}) and (\d{4})\b/);
  if (between) {
    const a = Number(between[1]);
    const b = Number(between[2]);
    yearMin = Math.min(a, b);
    yearMax = Math.max(a, b);
  }

  // A bare year is either the one date named, or a second endpoint next to
  // a decade phrase - either way fold it into the min/max found so far.
  const literalYears = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  for (const y of literalYears) {
    yearMin = yearMin === null ? y : Math.min(yearMin, y);
    yearMax = yearMax === null ? y : Math.max(yearMax, y);
  }

  return { yearMin, yearMax };
}

// Words that carry no filtering meaning: never part of a title query and
// never reported as "not recognised".
const ASK_STOPWORDS = new Set((
  'find me movies movie film films show shows give recommend recommendation suggest please from in my the a an '
  + 'some with and of to for on at by or any i want need would like can could you what which that this these '
  + 'those is are be it its tonight today about out up one two three few couple good new old plan list lists '
  + 'under over less than more hours hour hrs hr minutes minute mins min before after between early late '
  + 'rated rating top best great classic short quick brief highly watch watched watching seen got have do does '
  + 'something anything watchlist library there into'
).split(' '));

// Asking for "anything" is a valid, deliberately open request
const ASK_RANDOM_WORDS = new Set(['surprise', 'random', 'anything', 'whatever', 'something', 'anyone', 'randomly']);

const STATUS_VOCAB = ['watch', 'watched', 'watching', 'unwatched', 'completed', 'dropped', 'finished'];

/** Classic Levenshtein distance; inputs here are single words, so O(n*m) is nothing. */
export function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Typo tolerance: the single vocabulary word within 1 edit (2 for words of 8+
 * letters) of `word`, or null when nothing is close or more than one word is
 * equally close. Words under 5 letters are never corrected.
 */
function fuzzyPick(word, vocab) {
  if (word.length < 5) return null;
  const tol = word.length >= 8 ? 2 : 1;
  let best = null;
  let bestDist = Infinity;
  let tied = false;
  for (const v of new Set(vocab)) {
    if (v === word) return null;
    const d = editDistance(word, v);
    if (d > tol) continue;
    if (d < bestDist) { best = v; bestDist = d; tied = false; }
    else if (d === bestDist) tied = true;
  }
  return best && !tied ? best : null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parse a Library-source "Ask" sentence into the EMPTY_FILTERS shape, and
 * report the words nothing could account for.
 * `options` is this library's own getFilterOptions() output, so every
 * matched value is guaranteed to exist for this user.
 * Returns { filters, unmatched }.
 */
export function analyzeLibraryAsk(message, options) {
  const raw = String(message || '');
  let text = raw.toLowerCase();
  const filters = { ...EMPTY_FILTERS };
  const titles = options.titles || [];
  const titleNorms = titles.map(normalizeTitle).filter((t) => t.length >= 4);
  const titleWords = new Set(titles.flatMap((t) => slug(t).split(' ')).filter((w) => w.length >= 3));

  // Typo repair against the list names and status words only. Words that are
  // real genre / title / person words are left alone.
  const listWords = (options.lists || []).flatMap((l) => slug(l.name).split(' ')).filter((w) => w.length >= 3);
  const known = new Set([
    ...Object.keys(ASK_MOODS),
    ...titleWords,
    ...(options.genres || []).flatMap((g) => slug(g.value).split(' ')),
    ...(options.directors || []).flatMap((d) => slug(d.value).split(' ')),
    ...(options.actors || []).flatMap((a) => slug(a.value).split(' ')),
  ]);
  const repairVocab = [...STATUS_VOCAB, ...listWords];
  text = text.replace(/[a-z]{5,}/g, (w) => {
    if (known.has(w) || ASK_STOPWORDS.has(w) || ASK_RANDOM_WORDS.has(w) || repairVocab.includes(w)) return w;
    return fuzzyPick(w, repairVocab) || w;
  });

  const slugText = slug(text);
  // `rest` shrinks as rules claim their words; whatever survives is either
  // a title query or something we did not understand
  let rest = text;
  const claim = (re) => { rest = rest.replace(new RegExp(re.source, 'gi'), ' '); };
  const claimWord = (phrase) => claim(new RegExp(`\\b${escapeRe(phrase)}\\b`));

  // Lists - the user's own, matched by normalized substring so punctuation
  // and spacing differences ("rom-com" vs. a list named "Rom Com") still
  // match. The longest matching name wins, so a short list name can't
  // swallow a sentence meant for a more specific one.
  let bestList = null;
  for (const l of options.lists || []) {
    const s = slug(l.name);
    if (s && slugText.includes(s) && (!bestList || s.length > bestList.s.length)) {
      bestList = { id: l.id, s };
    }
  }
  if (bestList) {
    filters.lists = [String(bestList.id)];
    claim(new RegExp(bestList.s.split(' ').map(escapeRe).join('[^a-z0-9]+')));
  }

  for (const [re, statusValue] of ASK_STATUS_PHRASES) {
    if (re.test(text)) { filters.statuses = [statusValue]; claim(re); break; }
  }

  // Genres - exact names from the library, plus mood words mapped onto them
  const genreNames = (options.genres || []).map((g) => g.value);
  const foundGenres = new Set(genreNames.filter((name) => hasWord(text, name.toLowerCase())));
  foundGenres.forEach((name) => claimWord(name.toLowerCase()));
  const ownedLower = new Map(genreNames.map((n) => [n.toLowerCase(), n]));
  for (const [word, genre] of Object.entries(ASK_MOODS)) {
    if (hasWord(text, word) && ownedLower.has(genre)) { foundGenres.add(ownedLower.get(genre)); claimWord(word); }
  }
  filters.genres = [...foundGenres];

  filters.directors = (options.directors || []).map((d) => d.value).filter((v) => hasWord(text, v.toLowerCase()));
  filters.directors.forEach((v) => claimWord(v.toLowerCase()));
  filters.actors = (options.actors || []).map((a) => a.value).filter((v) => hasWord(text, v.toLowerCase()));
  filters.actors.forEach((v) => claimWord(v.toLowerCase()));
  filters.languages = (options.languages || [])
    .map((l) => l.value)
    .filter((code) => hasWord(text, code.toLowerCase()) || hasWord(text, languageLabel(code).toLowerCase()));
  filters.languages.forEach((code) => { claimWord(code.toLowerCase()); claimWord(languageLabel(code).toLowerCase()); });

  const hours = text.match(/\b(?:under|less than) (?:an? |two |three )?(\d+)?\s*(?:hours?|hrs?)\b/);
  const minutes = text.match(/\b(?:under|less than) (\d+)\s*(?:minutes?|mins?)\b/);
  if (hours) {
    const n = hours[1] ? Number(hours[1]) : (text.includes('two') ? 2 : 1);
    filters.runtimeMax = n * 60;
  } else if (minutes) {
    filters.runtimeMax = Number(minutes[1]);
  } else if (/\b(short|quick|brief)\b/.test(text)) {
    filters.runtimeMax = 100;
  }

  if (/\b(masterpiece|classic)\b/.test(text)) filters.minRating = 8.0;
  else if (/\b(highly[- ]rated|best|top[- ]rated|acclaimed|great)\b/.test(text)) filters.minRating = 7.5;

  const { yearMin, yearMax } = parseAskYearRange(text);
  filters.yearMin = yearMin;
  filters.yearMax = yearMax;

  // Whatever is left: stopwords and bare numbers are noise, the rest is a
  // possible title query. Only a query that hits a real library title counts.
  const words = (rest.match(/[a-z0-9']+/g) || []).filter(
    (w) => w.length > 1 && !w.includes("'") && !/^\d+$/.test(w) && !ASK_STOPWORDS.has(w) && !ASK_RANDOM_WORDS.has(w),
  );
  const hitsTitle = (norm) => norm.length >= 4 && titleNorms.some((t) => t.includes(norm));
  let used = new Set();

  if (words.length) {
    if (hitsTitle(normalizeTitle(words.join(' ')))) {
      filters.title = words.join(' ');
      used = new Set(words);
    } else {
      const hits = words.filter((w) => hitsTitle(normalizeTitle(w)));
      if (hits.length) {
        filters.title = hits.reduce((a, b) => (b.length > a.length ? b : a));
        used = new Set([filters.title]);
      } else {
        for (const w of words) {
          const fix = fuzzyPick(w, [...titleWords]);
          if (fix) { filters.title = fix; used = new Set([w]); break; }
        }
      }
    }
  }

  // A title that itself contains stopwords ("Lord of the Rings") is found
  // by looking for the whole normalized title inside the sentence
  if (!filters.title && words.length) {
    const sentence = normalizeTitle(rest);
    const full = titles
      .filter((t) => normalizeTitle(t).length >= 4 && sentence.includes(normalizeTitle(t)))
      .sort((a, b) => normalizeTitle(b).length - normalizeTitle(a).length)[0];
    if (full) {
      filters.title = full;
      const parts = new Set(slug(full).split(' '));
      used = new Set(words.filter((w) => parts.has(w)));
    }
  }

  return { filters, unmatched: words.filter((w) => !used.has(w)) };
}

/** Filters-only view of analyzeLibraryAsk. */
export function parseLibraryAsk(message, options) {
  return analyzeLibraryAsk(message, options).filters;
}

/**
 * One short label per matched piece of a Library "Ask" query - the
 * "Understood as" chips shown under a round, mirroring what the Web/Ask
 * backend returns (services/chat.py _describe_filters), so both sources
 * show the same kind of readable breakdown of what was searched for.
 */
export function describeLibraryFilters(filters, options) {
  const chips = [];
  filters.statuses.forEach((s) => chips.push(STATUS_LABELS[s] || s));
  filters.genres.forEach((g) => chips.push(g));
  filters.lists.forEach((id) => {
    const name = options.lists.find((l) => String(l.id) === id)?.name;
    if (name) chips.push(name);
  });
  if ((filters.title || '').trim()) chips.push(`Title: ${filters.title.trim()}`);
  filters.directors.forEach((d) => chips.push(d));
  filters.actors.forEach((a) => chips.push(a));
  filters.languages.forEach((l) => chips.push(languageLabel(l)));
  if (filters.yearMin !== null || filters.yearMax !== null) {
    chips.push(
      filters.yearMin !== null && filters.yearMax !== null && filters.yearMin !== filters.yearMax
        ? `${filters.yearMin}-${filters.yearMax}`
        : String(filters.yearMin ?? filters.yearMax),
    );
  }
  if (filters.runtimeMax !== null) chips.push(`Under ${filters.runtimeMax} min`);
  if (filters.minRating !== null) chips.push(`Rated ${filters.minRating}+`);

  // A list can share its name with a genre ("Adventure" the list, "Adventure"
  // the genre) - dedupe so that doesn't show as a literal repeated chip.
  const seen = new Set();
  return chips.filter((c) => {
    const key = c.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Map the UI filters onto the query the backend recommender understands.
 * `title` is deliberately not sent: it only narrows the user's own library.
 */
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
