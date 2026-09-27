import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shuffle, SlidersHorizontal, ChevronUp, ChevronDown, X, Globe, Loader2 } from 'lucide-react';
import '../discover.css';
import DiscoverSidebar from './discover/DiscoverSidebar';
import DiscoverFilters from './discover/DiscoverFilters';
import DiscoverCard from './discover/DiscoverCard';
import { getRecommendations } from '../api/client';
import { loadJson, saveJson } from '../lib/prefs';
import {
  EMPTY_FILTERS,
  STATUS_LABELS,
  activeFilterCount,
  applyFilters,
  buildRecords,
  clampCount,
  drawFromBag,
  getFilterOptions,
  languageLabel,
  movieYear,
  toBackendFilters,
} from '../lib/discoverEngine';

const STORE_KEY = 'cinetrack_discover';
const MAX_ROUNDS = 40;
const WEB_ATTEMPTS = 3;

const DEFAULT_STORE = {
  seen: [],       // library keys already drawn from the current bag
  webSeen: [],    // TMDB ids already shown from the web
  rounds: [],     // { id, n, source, count, keys | movies }
  shortlist: [],  // { source, key, title, year, movie? }
  counter: 0,
};

export default function Discover({
  visible = true,
  items = [],
  lists = [],
  isLoading = false,
  libraryIds = new Set(),
  prefs,
  onPrefsChange,
  isSidebarOpen = true,
  isFiltersOpen = true,
  onSetFiltersOpen,
  onOpenItem,
  onAddMovie,
  onPreviewWeb,
  clearHistorySignal = 0,
  detailNode = null,
}) {
  const [store, setStore] = useState(() => ({ ...DEFAULT_STORE, ...loadJson(STORE_KEY, {}) }));
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [source, setSource] = useState(prefs.discoverSource);
  const [countText, setCountText] = useState(String(prefs.discoverCount));
  const [viewedRoundId, setViewedRoundId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [addingKey, setAddingKey] = useState(null);
  // True after the user presses Recommend on an empty bag (the last batch stays visible until then)
  const [showBagEmpty, setShowBagEmpty] = useState(false);
  const [message, setMessage] = useState({ text: '', tone: 'info' });

  useEffect(() => { saveJson(STORE_KEY, store); }, [store]);
  useEffect(() => { setCountText(String(prefs.discoverCount)); }, [prefs.discoverCount]);

  // ── Library, filters, bag ──────────────────────────────────────────────
  const records = useMemo(() => buildRecords(items), [items]);
  const recordsByKey = useMemo(() => new Map(records.map((r) => [r.key, r])), [records]);
  const options = useMemo(() => getFilterOptions(records), [records]);
  const pool = useMemo(() => applyFilters(records, filters), [records, filters]);
  const seenSet = useMemo(() => new Set(store.seen), [store.seen]);
  const bagLeft = useMemo(() => pool.filter((r) => !seenSet.has(r.key)).length, [pool, seenSet]);

  const filterCount = activeFilterCount(filters);
  const count = clampCount(countText, prefs.discoverCount);

  const { rounds, shortlist } = store;
  const latestRound = rounds[rounds.length - 1] || null;
  const viewedRound = rounds.find((r) => r.id === viewedRoundId) || latestRound;
  const viewedIndex = viewedRound ? rounds.indexOf(viewedRound) : -1;
  const previousRound = viewedIndex > 0 ? rounds[viewedIndex - 1] : null;
  const isEmptyStage = rounds.length === 0;

  const defaultListId = useMemo(() => {
    const plan = lists.find((l) => (l.name || '').toLowerCase().trim() === 'plan to watch');
    return (plan || lists[0])?.id;
  }, [lists]);

  // Turn a stored round back into the movies to show
  const resolveRound = (round) => {
    if (!round) return [];
    if (round.source === 'web') {
      return (round.movies || []).map((movie) => ({
        key: movie.tmdb_id, movie, status: null, web: true, rec: recordsByKey.get(movie.tmdb_id),
      }));
    }
    return (round.keys || [])
      .map((k) => recordsByKey.get(k))
      .filter(Boolean)
      .map((rec) => ({ key: rec.key, movie: rec.movie, status: rec.items[0]?.status, web: false, rec }));
  };

  const viewedCards = useMemo(
    () => resolveRound(viewedRound),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewedRound, recordsByKey],
  );
  const previousCards = useMemo(
    () => resolveRound(previousRound),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previousRound, recordsByKey],
  );

  // ── Actions ────────────────────────────────────────────────────────────
  const handleFiltersChange = (next) => {
    setFilters(next);
    // A different filter set is a different bag, so nothing counts as seen yet
    setStore((s) => ({ ...s, seen: [] }));
    setShowBagEmpty(false);
    setMessage({ text: '', tone: 'info' });
  };
  const patchFilters = (patch) => handleFiltersChange({ ...filters, ...patch });

  const pushRound = (round) => {
    setStore((s) => {
      const n = s.counter + 1;
      const next = [...s.rounds, { id: Date.now() + n, n, ...round }];
      const trimmed = prefs.keepHistory ? next.slice(-MAX_ROUNDS) : next.slice(-1);
      return {
        ...s,
        counter: n,
        rounds: trimmed,
        seen: round.source === 'library' ? [...s.seen, ...round.keys] : s.seen,
        webSeen: round.source === 'web'
          ? [...s.webSeen, ...round.movies.map((m) => m.tmdb_id)]
          : s.webSeen,
      };
    });
    setViewedRoundId(null);
    setShowBagEmpty(false);
  };

  const drawFromLibrary = () => {
    const { picks } = drawFromBag(pool, seenSet, count);
    if (picks.length === 0) return;
    pushRound({ source: 'library', count: picks.length, keys: picks.map((p) => p.key) });
  };

  const drawFromWeb = async () => {
    const singleList = filters.lists.length === 1 ? filters.lists[0] : null;
    const already = new Set(store.webSeen);
    const collected = [];
    let note = '';
    let degraded = false;

    for (let attempt = 0; attempt < WEB_ATTEMPTS && collected.length < count; attempt += 1) {
      const res = await getRecommendations(count, singleList, toBackendFilters(filters));
      if (res?.degraded) degraded = true;
      if (res?.message && !(res.results || []).length) note = res.message;
      for (const movie of res?.results || []) {
        const id = movie.tmdb_id;
        if (!id || already.has(id) || collected.some((m) => m.tmdb_id === id)) continue;
        collected.push(movie);
        if (collected.length === count) break;
      }
      if (!(res?.results || []).length) break;
    }

    if (collected.length === 0) {
      setMessage({
        text: note || 'No new web picks for these filters. Try loosening them.',
        tone: 'info',
      });
      return;
    }
    if (degraded) {
      setMessage({ text: 'TMDB was unreachable, so these came from a small offline catalogue.', tone: 'info' });
    }
    pushRound({ source: 'web', count: collected.length, movies: collected });
  };

  const handleRecommend = async () => {
    if (isDrawing) return;
    setCountText(String(count));
    setMessage({ text: '', tone: 'info' });
    try {
      setIsDrawing(true);
      if (source === 'library') {
        // The last movies were already shown; only now, on the next press, say the bag is empty
        if (pool.length > 0 && bagLeft === 0) setShowBagEmpty(true);
        else drawFromLibrary();
      } else {
        await drawFromWeb();
      }
    } catch (err) {
      setMessage({ text: err.message || 'Could not fetch recommendations.', tone: 'error' });
    } finally {
      setIsDrawing(false);
    }
  };

  const handleReshuffle = () => {
    setStore((s) => ({ ...s, seen: [] }));
    setShowBagEmpty(false);
    setMessage({ text: '', tone: 'info' });
  };

  const handleClearHistory = () => {
    setStore((s) => ({ ...s, rounds: [], seen: [], webSeen: [], counter: 0 }));
    setViewedRoundId(null);
    setShowBagEmpty(false);
    setMessage({ text: '', tone: 'info' });
  };

  const handleSelectRound = (id) => {
    setViewedRoundId(id);
    setShowBagEmpty(false);
  };

  const handleSourceChange = (next) => {
    setSource(next);
    setShowBagEmpty(false);
  };

  // Settings > Discover > Clear history bumps this counter
  const lastClearSignal = useRef(clearHistorySignal);
  useEffect(() => {
    if (clearHistorySignal === lastClearSignal.current) return;
    lastClearSignal.current = clearHistorySignal;
    handleClearHistory();
  });

  const isBookmarked = (src, key) => shortlist.some((s) => s.source === src && s.key === key);

  const toggleBookmark = (src, key, movie) => {
    setStore((s) => {
      const exists = s.shortlist.some((e) => e.source === src && e.key === key);
      if (exists) return { ...s, shortlist: s.shortlist.filter((e) => !(e.source === src && e.key === key)) };
      const entry = {
        source: src,
        key,
        title: movie.title,
        year: movieYear(movie) || '',
        ...(src === 'web' ? { movie } : {}),
      };
      return { ...s, shortlist: [...s.shortlist, entry] };
    });
  };

  const removeShortlisted = (entry) => {
    setStore((s) => ({
      ...s,
      shortlist: s.shortlist.filter((e) => !(e.source === entry.source && e.key === entry.key)),
    }));
  };

  const clearShortlist = () => setStore((s) => ({ ...s, shortlist: [] }));

  const openShortlisted = (entry) => {
    const rec = recordsByKey.get(entry.key);
    if (rec?.items[0]) onOpenItem?.(rec.items[0]);
  };

  const addWebMovie = async (movie) => {
    if (!defaultListId) {
      setMessage({ text: 'Create a list first, then add movies to it.', tone: 'error' });
      return;
    }
    try {
      setAddingKey(movie.tmdb_id);
      // Add quietly (App shows a toast); the card flips to "In library" without leaving Discover
      await onAddMovie?.(defaultListId, movie, { openDetail: false });
      // No longer a candidate once it is in a list
      removeShortlisted({ source: 'web', key: movie.tmdb_id });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to add movie', tone: 'error' });
    } finally {
      setAddingKey(null);
    }
  };

  const stepCount = (delta) => setCountText(String(clampCount(count + delta, prefs.discoverCount)));

  // ── Derived display values ─────────────────────────────────────────────
  const libraryProblem = (() => {
    if (source !== 'library') return '';
    if (isLoading && records.length === 0) return '';
    if (records.length === 0) return 'Your library is empty. Add movies in Library first, or switch the source to Web.';
    if (pool.length === 0) return 'No movies in your library match these filters. Loosen them or reset.';
    return '';
  })();

  const bagEmpty = source === 'library' && pool.length > 0 && bagLeft === 0;
  const canRecommend = !isDrawing && !libraryProblem && !showBagEmpty;
  const ctaLabel = showBagEmpty ? 'Bag is empty' : isEmptyStage ? 'Recommend' : `Recommend`;

  const seenInPool = pool.length - bagLeft;
  const meterPct = pool.length ? `${Math.round((bagLeft / pool.length) * 100)}%` : '0%';
  const bagSub = filterCount > 0
    ? `${seenInPool} seen · filters match ${pool.length} of ${records.length}`
    : `${seenInPool} seen · ${records.length} in your library`;

  const chips = [];
  const addChip = (label, remove) => chips.push({ label, remove });
  filters.statuses.forEach((s) => addChip(STATUS_LABELS[s] || s, () => patchFilters({ statuses: filters.statuses.filter((x) => x !== s) })));
  filters.genres.forEach((g) => addChip(g, () => patchFilters({ genres: filters.genres.filter((x) => x !== g) })));
  filters.lists.forEach((id) => {
    const name = options.lists.find((l) => String(l.id) === id)?.name || 'List';
    addChip(name, () => patchFilters({ lists: filters.lists.filter((x) => x !== id) }));
  });
  filters.directors.forEach((d) => addChip(d, () => patchFilters({ directors: filters.directors.filter((x) => x !== d) })));
  filters.actors.forEach((a) => addChip(a, () => patchFilters({ actors: filters.actors.filter((x) => x !== a) })));
  filters.languages.forEach((l) => addChip(languageLabel(l), () => patchFilters({ languages: filters.languages.filter((x) => x !== l) })));
  if (filters.yearMin !== null || filters.yearMax !== null) {
    addChip(
      `${filters.yearMin ?? options.years.min}–${filters.yearMax ?? options.years.max}`,
      () => patchFilters({ yearMin: null, yearMax: null }),
    );
  }
  if (filters.minRating !== null) addChip(`Rating ${filters.minRating}+`, () => patchFilters({ minRating: null }));
  if (filters.runtimeMax !== null) addChip(`Up to ${filters.runtimeMax} min`, () => patchFilters({ runtimeMax: null }));

  const showChips = prefs.showFilterChips && chips.length > 0;
  const stripRound = showBagEmpty ? viewedRound : previousRound;
  const stripCards = showBagEmpty ? viewedCards : previousCards;

  const composer = (
    <div className={`dz-composer ${isEmptyStage ? 'dz-composer--center' : 'dz-composer--dock'}`}>
      {showChips && (
        <div className="dz-composer__chips">
          <span className="dz-composer__label">Drawing from</span>
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              className="dz-chip is-on"
              aria-label={`Remove filter ${c.label}`}
              onClick={c.remove}
            >
              {c.label}
              <X size={12} className="dz-chip__x" />
            </button>
          ))}
        </div>
      )}
      <div className="dz-composer__row">
        <div className="dz-step" role="group" aria-label="How many movies">
          <input
            className="dz-step__input"
            type="text"
            inputMode="numeric"
            value={countText}
            aria-label="How many movies"
            onChange={(e) => setCountText(e.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={() => setCountText(String(count))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canRecommend) handleRecommend();
              if (e.key === 'ArrowUp') { e.preventDefault(); stepCount(1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); stepCount(-1); }
            }}
          />
          <span className="dz-step__unit">{count === 1 ? 'movie' : 'movies'}</span>
          <div className="dz-step__arrows">
            <button type="button" className="dz-step__arrow" aria-label="More movies" disabled={count >= 20} onClick={() => stepCount(1)}>
              <ChevronUp size={14} />
            </button>
            <button type="button" className="dz-step__arrow" aria-label="Fewer movies" disabled={count <= 1} onClick={() => stepCount(-1)}>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
        <div className="dz-composer__spacer" />
        <button type="button" className="dz-cta" disabled={!canRecommend} onClick={handleRecommend}>
          {isDrawing && <Loader2 size={18} className="dz-spinner" />}
          {ctaLabel}
        </button>
      </div>
    </div>
  );

  const renderCards = (cards) => (
    <div className={`dz-grid ${isFiltersOpen ? 'dz-grid--filters-open' : 'dz-grid--filters-closed'}`}>
      {cards.map((c) => (
        <DiscoverCard
          key={`${c.web ? 'w' : 'l'}-${c.key}`}
          movie={c.movie}
          status={c.status}
          isWeb={c.web}
          isBookmarked={isBookmarked(c.web ? 'web' : 'library', c.key)}
          inLibrary={Boolean(c.rec) || libraryIds.has(c.movie.tmdb_id)}
          isAdding={addingKey === c.movie.tmdb_id}
          onOpen={c.rec ? () => onOpenItem?.(c.rec.items[0]) : () => onPreviewWeb?.(c.movie)}
          onToggleBookmark={() => toggleBookmark(c.web ? 'web' : 'library', c.key, c.movie)}
          onAdd={() => addWebMovie(c.movie)}
        />
      ))}
    </div>
  );

  const roundMeta = viewedRound?.source === 'web'
    ? `${viewedRound.count} from TMDB · titles you own are left out`
    : `${viewedRound?.count ?? 0} from your library · none repeated`;

  return (
    <div className="dz" style={{ display: visible ? 'contents' : 'none' }}>
      <DiscoverSidebar
        isOpen={isSidebarOpen}
        keepHistory={prefs.keepHistory}
        rounds={rounds}
        viewedRoundId={viewedRound?.id ?? null}
        onSelectRound={handleSelectRound}
        onClearHistory={handleClearHistory}
        shortlist={shortlist}
        onOpenShortlisted={openShortlisted}
        onAddShortlisted={(entry) => addWebMovie(entry.movie)}
        onRemoveShortlisted={removeShortlisted}
        onClearShortlist={clearShortlist}
        source={source}
        onSourceChange={handleSourceChange}
      />

      {detailNode || (
        <main className="dz-main">
          <header className="dz-topbar">
            <div className="dz-topbar__left">
              {source === 'web' ? (
                <>
                  <Globe size={18} />
                  <div>
                    <div className="dz-topbar__strong">Searching the web</div>
                    <div className="dz-topbar__sub">Uses your filters and taste. Skips anything you own.</div>
                  </div>
                </>
              ) : !isEmptyStage && pool.length > 0 ? (
                <>
                  <div>
                    <div className="dz-topbar__strong">{bagLeft} left of {pool.length}</div>
                    <div className="dz-topbar__sub">{bagSub}</div>
                  </div>
                  <div className="dz-meter" role="img" aria-label={`${bagLeft} of ${pool.length} movies left in the bag`}>
                    <div className="dz-meter__fill" style={{ width: meterPct }} />
                  </div>
                  <button
                    type="button"
                    className={`dz-btn ${bagEmpty ? 'dz-btn--hot' : ''}`}
                    disabled={seenInPool === 0}
                    onClick={handleReshuffle}
                  >
                    <Shuffle size={16} />Reshuffle
                  </button>
                </>
              ) : null}
            </div>
            <button
              type="button"
              className="dz-btn"
              aria-expanded={isFiltersOpen}
              onClick={() => onSetFiltersOpen?.(!isFiltersOpen)}
            >
              <SlidersHorizontal size={16} />Filters
              {filterCount > 0 && <span className="dz-badge">{filterCount}</span>}
            </button>
          </header>

          {isEmptyStage ? (
            <div className="dz-stage dz-stage--empty">
              <h1 className="dz-heading dz-stage__heading">What should we watch tonight?</h1>
              {composer}
              {(libraryProblem || message.text) && (
                <p className={`dz-notice ${message.tone === 'error' ? 'dz-notice--error' : ''}`} style={{ maxWidth: 520 }}>
                  {message.text || libraryProblem}
                </p>
              )}
            </div>
          ) : (
            <div className="dz-stage">
              <div className="dz-scroll">
                {(libraryProblem || message.text) && (
                  <p className={`dz-notice ${message.tone === 'error' ? 'dz-notice--error' : ''}`}>
                    {message.text || libraryProblem}
                  </p>
                )}

                {viewedRound && !showBagEmpty && (
                  <section>
                    <div className="dz-round__head">
                      <h2 className="dz-heading dz-round__title">Round {viewedRound.n}</h2>
                      <span className="dz-round__meta">{roundMeta}</span>
                    </div>
                    {viewedCards.length > 0 ? renderCards(viewedCards) : (
                      <p className="dz-notice">The movies from this round are no longer in your library.</p>
                    )}
                  </section>
                )}

                {showBagEmpty && (
                  <div className="dz-empty-card">
                    <h2 className="dz-heading dz-empty-card__title">You&apos;ve seen everything.</h2>
                    <p className="dz-empty-card__body">
                      All {pool.length} {pool.length === 1 ? 'movie has' : 'movies have'} had {pool.length === 1 ? 'its' : 'their'} turn.
                      Reshuffle to put them back, or look further with the web.
                    </p>
                    <div className="dz-empty-card__actions">
                      <button type="button" className="dz-cta" onClick={handleReshuffle}>
                        <Shuffle size={18} />Reshuffle the bag
                      </button>
                      <button type="button" className="dz-btn" style={{ height: 48, padding: '0 20px', fontSize: 14 }} onClick={() => handleSourceChange('web')}>
                        <Globe size={18} />Search the web instead
                      </button>
                    </div>
                    <p className="dz-mute" style={{ fontSize: 12 }}>
                      Reshuffling keeps your filters and shortlist. Only the seen list is cleared.
                    </p>
                  </div>
                )}

                {prefs.keepHistory && stripRound && stripCards.length > 0 && (
                  <section>
                    <div className="dz-label"><span>{showBagEmpty ? 'Last round' : 'Passed earlier'} · Round {stripRound.n}</span></div>
                    <div className="dz-strip">
                      {stripCards.map((c) => (
                        <div key={`p-${c.key}`} className="dz-strip__item">
                          <div className="dz-strip__poster">
                            {c.movie.poster_path && (
                              <img
                                src={c.movie.poster_path}
                                alt=""
                                loading="lazy"
                                className="dz-card__img"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                          </div>
                          <div className="dz-strip__title">{c.movie.title}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
              {composer}
            </div>
          )}

          <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {viewedRound ? `Round ${viewedRound.n}: ${viewedRound.count} movies` : ''}
          </div>
        </main>
      )}

      {!detailNode && (
        <DiscoverFilters
          isOpen={isFiltersOpen}
          options={options}
          filters={filters}
          onChange={handleFiltersChange}
          poolSize={pool.length}
          totalSize={records.length}
          showChips={prefs.showFilterChips}
          onToggleShowChips={() => onPrefsChange?.({ showFilterChips: !prefs.showFilterChips })}
          onClose={() => onSetFiltersOpen?.(false)}
        />
      )}
    </div>
  );
}
