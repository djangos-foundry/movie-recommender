import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Star, Plus, Check, Loader2, Film, Sparkles, Shuffle, Dices,
  SlidersHorizontal, RotateCcw, AlertTriangle,
} from 'lucide-react';
import { getRecommendations, getRecommendationFilters } from '../api/client';

// TMDB returns ISO-639-1 codes; show something readable for the common ones
const LANGUAGE_NAMES = {
  en: 'English', ja: 'Japanese', hi: 'Hindi', ko: 'Korean', fr: 'French',
  es: 'Spanish', de: 'German', it: 'Italian', zh: 'Chinese', cn: 'Chinese',
  ru: 'Russian', pt: 'Portuguese', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
  sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', nl: 'Dutch',
  pl: 'Polish', tr: 'Turkish', th: 'Thai', ar: 'Arabic', fa: 'Persian',
};
const languageLabel = (code) => LANGUAGE_NAMES[code] || (code || '').toUpperCase();

const EMPTY_FILTERS = {
  genres: [],
  directors: [],
  actors: [],
  languages: [],
  runtime_min: '',
  runtime_max: '',
  min_rating: '',
};

export default function RecommendationModal({
  isOpen,
  onClose,
  lists = [],
  currentList,
  onAddMovie,
  existingMovieIds = new Set(),
}) {
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [targetListId, setTargetListId] = useState('');
  const [addedIds, setAddedIds] = useState(new Set());
  const [addingId, setAddingId] = useState(null);

  // Default the destination list the same way the Add Movie modal does
  useEffect(() => {
    if (currentList && currentList.id !== 'all' && lists.some((l) => l.id === currentList.id)) {
      setTargetListId(currentList.id);
    } else if (lists.length > 0) {
      const def = lists.find((l) => l.name.toLowerCase() === 'plan to watch') || lists[0];
      setTargetListId(def.id);
    }
  }, [currentList, lists]);

  const draw = useCallback(async (activeFilters) => {
    try {
      setIsLoading(true);
      setError('');
      const res = await getRecommendations(5, null, activeFilters);
      setData(res);
    } catch (err) {
      setError(err.message || 'Could not fetch recommendations.');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // On open: load the filter menu built from the library, then draw
  useEffect(() => {
    if (!isOpen) return;
    setAddedIds(new Set());
    setFilters(EMPTY_FILTERS);
    getRecommendationFilters()
      .then(setOptions)
      .catch(() => setOptions(null));
    draw(EMPTY_FILTERS);
  }, [isOpen, draw]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    for (const key of ['genres', 'directors', 'actors', 'languages']) {
      n += (filters[key] || []).length;
    }
    if (filters.runtime_min !== '' || filters.runtime_max !== '') n += 1;
    if (filters.min_rating !== '') n += 1;
    return n;
  }, [filters]);

  if (!isOpen) return null;

  const toggleMulti = (key, value) => {
    setFilters((prev) => {
      const current = prev[key] || [];
      return {
        ...prev,
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  };

  const setScalar = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    draw(EMPTY_FILTERS);
  };

  const handleAdd = async (movie) => {
    const listId = targetListId || lists[0]?.id;
    if (!listId) {
      setError('Please select a list first');
      return;
    }
    try {
      setAddingId(movie.tmdb_id);
      setError('');
      await onAddMovie(listId, movie);
      setAddedIds((prev) => new Set([...prev, movie.tmdb_id]));
    } catch (err) {
      setError(err.message || 'Failed to add movie');
    } finally {
      setAddingId(null);
    }
  };

  const results = data?.results || [];
  const seedGenres = data?.seed_genres || [];
  const runtimeBounds = options?.runtime || { min: 0, max: 0 };

  // "Drawn from 20 of your 100 movies" - the headline number for the filter feature
  const narrowed = data && data.library_total > 0 && data.library_size !== data.library_total;

  return (
    <div className="modal-overlay">
      <div className="rec">
        {/* ── Header ── */}
        <div className="rec__header">
          <div className="rec__header-left">
            <span className="rec__header-icon"><Sparkles size={15} /></span>
            <div>
              <h3 className="rec__title">Recommended for You</h3>
              <p className="rec__subtitle">
                {data && data.library_total > 0 ? (
                  <>
                    Drawn from{' '}
                    <strong className={narrowed ? 'rec__narrowed' : ''}>
                      {data.library_size}
                    </strong>
                    {' '}of your {data.library_total} saved movies
                    {data.pool_size > 0 && <> · {data.pool_size} candidates</>}
                  </>
                ) : (
                  'Random picks drawn from the genres you collect'
                )}
              </p>
            </div>
          </div>

          <div className="rec__header-right">
            <div className="amm__list-selector">
              <span className="amm__list-label">Add to</span>
              <div className="amm__list-select-wrap">
                <select
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  className="amm__list-select"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <span className="amm__list-select-caret">▾</span>
              </div>
            </div>

            <button onClick={onClose} className="amm__close-btn" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="rec__filterbar">
          <button
            type="button"
            className={`rec__filter-toggle ${showFilters ? 'is-open' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={13} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="rec__filter-count">{activeFilterCount}</span>
            )}
          </button>

          {seedGenres.length > 0 && !isLoading && (
            <div className="rec__seeds-inline">
              <span className="rec__seeds-label">Drawn from</span>
              {seedGenres.map((g) => (
                <span key={g} className="rec__seed-chip">{g}</span>
              ))}
            </div>
          )}

          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters} className="rec__reset-btn">
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* ── Filter panel ── */}
        {showFilters && (
          <div className="rec__filters custom-scrollbar">
            {!options && <p className="rec__filter-empty">Loading filters…</p>}

            {options && (
              <>
                {options.genres?.length > 0 && (
                  <FilterGroup label="Genre">
                    {options.genres.map((g) => (
                      <Chip
                        key={g.value}
                        active={filters.genres.includes(g.value)}
                        onClick={() => toggleMulti('genres', g.value)}
                      >
                        {g.value} <span className="rec__chip-count">{g.count}</span>
                      </Chip>
                    ))}
                  </FilterGroup>
                )}

                {options.languages?.length > 1 && (
                  <FilterGroup label="Language">
                    {options.languages.map((l) => (
                      <Chip
                        key={l.value}
                        active={filters.languages.includes(l.value)}
                        onClick={() => toggleMulti('languages', l.value)}
                      >
                        {languageLabel(l.value)} <span className="rec__chip-count">{l.count}</span>
                      </Chip>
                    ))}
                  </FilterGroup>
                )}

                {options.directors?.length > 0 && (
                  <FilterGroup label="Director">
                    <div className="rec__scroll-chips custom-scrollbar">
                      {options.directors.map((d) => (
                        <Chip
                          key={d.value}
                          active={filters.directors.includes(d.value)}
                          onClick={() => toggleMulti('directors', d.value)}
                        >
                          {d.value} <span className="rec__chip-count">{d.count}</span>
                        </Chip>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {options.actors?.length > 0 && (
                  <FilterGroup label="Actor">
                    <div className="rec__scroll-chips custom-scrollbar">
                      {options.actors.map((a) => (
                        <Chip
                          key={a.value}
                          active={filters.actors.includes(a.value)}
                          onClick={() => toggleMulti('actors', a.value)}
                        >
                          {a.value} <span className="rec__chip-count">{a.count}</span>
                        </Chip>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {/* Runtime slider */}
                {runtimeBounds.max > 0 && (
                  <FilterGroup label="Runtime">
                    <div className="rec__slider-row">
                      <span className="rec__slider-value">
                        {filters.runtime_min || runtimeBounds.min} min
                      </span>
                      <input
                        type="range"
                        className="rec__slider"
                        min={runtimeBounds.min}
                        max={runtimeBounds.max}
                        value={filters.runtime_min || runtimeBounds.min}
                        onChange={(e) => setScalar('runtime_min', Number(e.target.value))}
                      />
                      <span className="rec__slider-sep">to</span>
                      <input
                        type="range"
                        className="rec__slider"
                        min={runtimeBounds.min}
                        max={runtimeBounds.max}
                        value={filters.runtime_max || runtimeBounds.max}
                        onChange={(e) => setScalar('runtime_max', Number(e.target.value))}
                      />
                      <span className="rec__slider-value">
                        {filters.runtime_max || runtimeBounds.max} min
                      </span>
                    </div>
                  </FilterGroup>
                )}

                {/* Minimum rating */}
                <FilterGroup label="Minimum rating">
                  <div className="rec__slider-row">
                    <input
                      type="range"
                      className="rec__slider"
                      min={0}
                      max={9}
                      step={0.5}
                      value={filters.min_rating === '' ? 0 : filters.min_rating}
                      onChange={(e) => setScalar('min_rating', Number(e.target.value) || '')}
                    />
                    <span className="rec__slider-value">
                      {filters.min_rating === '' || filters.min_rating === 0
                        ? 'Any'
                        : `${filters.min_rating}+`}
                    </span>
                  </div>
                </FilterGroup>

                <button
                  type="button"
                  className="rec__apply-btn"
                  onClick={() => draw(filters)}
                  disabled={isLoading}
                >
                  {isLoading
                    ? <Loader2 size={14} className="amm__spinner" />
                    : <Sparkles size={14} strokeWidth={2.5} />}
                  <span>Apply &amp; Recommend</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Degraded / error notices ── */}
        {data?.degraded && results.length > 0 && (
          <div className="rec__notice">
            <AlertTriangle size={13} />
            <span>{data.message}</span>
          </div>
        )}

        {error && (
          <div className="amm__error">
            <span>{error}</span>
            <button onClick={() => setError('')} className="amm__error-dismiss">Dismiss</button>
          </div>
        )}

        {/* ── Results ── */}
        <div className="rec__body custom-scrollbar">
          {isLoading && (
            <div className="amm__state">
              <Loader2 size={24} className="amm__spinner" />
              <span>Shuffling your picks…</span>
            </div>
          )}

          {!isLoading && results.length === 0 && (
            <div className="amm__state">
              <div className="amm__state-icon"><Dices size={28} /></div>
              <p className="amm__state-title">Nothing to recommend yet</p>
              <p className="amm__state-hint">
                {data?.message || 'Add a few movies to your lists, then try again.'}
              </p>
            </div>
          )}

          {!isLoading && results.map((movie) => {
            const year = movie.release_date?.substring(0, 4) || '';
            const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : null;
            const alreadyAdded = existingMovieIds.has(movie.tmdb_id) || addedIds.has(movie.tmdb_id);
            const isAdding = addingId === movie.tmdb_id;

            return (
              <div key={movie.tmdb_id} className="rec__row">
                <div className="rec__poster">
                  {movie.poster_path ? (
                    <img
                      src={movie.poster_path}
                      alt={movie.title}
                      loading="lazy"
                      className="rec__poster-img"
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/70x105/1a1a1a/555?text=N/A'; }}
                    />
                  ) : (
                    <Film size={18} className="amm__result-poster-placeholder" />
                  )}
                </div>

                <div className="rec__info">
                  <div className="rec__title-row">
                    <span className="rec__movie-title">{movie.title}</span>
                    {year && <span className="amm__result-year">{year}</span>}
                    {rating && (
                      <span className="rec__rating">
                        <Star size={11} className="amm__result-star" />
                        <span>{rating}</span>
                      </span>
                    )}
                  </div>

                  {movie.reason && <span className="rec__reason">{movie.reason}</span>}
                  {movie.overview && <p className="amm__result-overview">{movie.overview}</p>}
                </div>

                <div className="amm__result-action">
                  {alreadyAdded ? (
                    <span className="amm__result-added">
                      <Check size={12} /> Added
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAdd(movie)}
                      disabled={isAdding}
                      className="amm__result-add-btn"
                    >
                      {isAdding ? <Loader2 size={13} className="amm__spinner" /> : <Plus size={13} />}
                      <span>Add</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className="rec__footer">
          <span className="rec__footer-note">
            Picked at random — no two draws are alike
          </span>
          <button
            type="button"
            onClick={() => draw(filters)}
            disabled={isLoading}
            className="rec__shuffle-btn"
          >
            {isLoading
              ? <Loader2 size={14} className="amm__spinner" />
              : <Shuffle size={14} strokeWidth={2.5} />}
            <span>Shuffle again</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div className="rec__filter-group">
      <span className="rec__filter-label">{label}</span>
      <div className="rec__chips">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rec__chip ${active ? 'is-active' : ''}`}
    >
      {children}
    </button>
  );
}
