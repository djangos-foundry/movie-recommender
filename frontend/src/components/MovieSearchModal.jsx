import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Star, Plus, Check, Loader2, Film } from 'lucide-react';
import { searchTMDB } from '../api/client';

// Inline TMDB logo SVG (official blue T badge)
function TmdbBadge() {
  return (
    <span className="add-movie-modal__tmdb-badge" aria-label="TMDB">
      TMDb
    </span>
  );
}

export default function MovieSearchModal({
  isOpen,
  onClose,
  currentList,
  lists = [],
  onAddMovie,
  existingMovieIds = new Set(),
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [targetListId, setTargetListId] = useState(currentList?.id || '');
  const [addedIds, setAddedIds] = useState(new Set());
  const [addingId, setAddingId] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (currentList && currentList.id !== 'all') {
      setTargetListId(currentList.id);
    } else if (lists.length > 0) {
      const def = lists.find((l) => l.name.toLowerCase() === 'watchlist') || lists[0];
      setTargetListId(def.id);
    }
  }, [currentList, lists]);

  useEffect(() => {
    if (isOpen) {
      setResults([]); setError(''); setQuery('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setIsLoading(false); return; }
    const t = setTimeout(async () => {
      try {
        setIsLoading(true); setError('');
        const data = await searchTMDB(query);
        setResults(data.results || []);
      } catch (err) {
        setError(err.message || 'Search failed. Backend may still be starting.');
      } finally {
        setIsLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  if (!isOpen) return null;

  const handleAdd = async (movie) => {
    const listId = targetListId || lists[0]?.id;
    if (!listId) { setError('Please select a list first'); return; }
    try {
      setAddingId(movie.id); setError('');
      await onAddMovie(listId, movie);
      setAddedIds((prev) => new Set([...prev, movie.id]));
    } catch (err) {
      setError(err.message || 'Failed to add movie');
    } finally {
      setAddingId(null);
    }
  };

  const getYear = (d) => d?.substring(0, 4) || '';

  const targetListName = lists.find((l) => String(l.id) === String(targetListId))?.name || 'Select a list';

  return (
    <div className="modal-overlay">
      <div className="amm">
        {/* ── Header ── */}
        <div className="amm__header">
          <div className="amm__header-left">
            <h3 className="amm__title">Add Movie</h3>
          </div>

          <div className="amm__header-right">
            {/* List selector */}
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

        {/* ── Search bar ── */}
        <div className="amm__search-wrap">
          <Search size={16} className="amm__search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a movie title…"
            className="amm__search-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="amm__search-clear" aria-label="Clear">
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="amm__error">
            <span>{error}</span>
            <button onClick={() => setError('')} className="amm__error-dismiss">Dismiss</button>
          </div>
        )}

        {/* ── Results ── */}
        <div className="amm__results custom-scrollbar">
          {isLoading && (
            <div className="amm__state">
              <Loader2 size={24} className="amm__spinner" />
              <span>Searching…</span>
            </div>
          )}

          {!isLoading && !query && (
            <div className="amm__state">
              <div className="amm__state-icon"><Film size={28} /></div>
              <p className="amm__state-title">Find a movie to add</p>
              <p className="amm__state-hint">Start typing a title above to search the database</p>
            </div>
          )}

          {!isLoading && query && results.length === 0 && (
            <div className="amm__state">
              <div className="amm__state-icon"><Search size={24} /></div>
              <p className="amm__state-title">No results for "{query}"</p>
              <p className="amm__state-hint">Try a different title or check your spelling</p>
            </div>
          )}

          {!isLoading && results.map((movie) => {
            const year = getYear(movie.release_date);
            const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : null;
            const alreadyAdded = existingMovieIds.has(movie.id) || addedIds.has(movie.id);
            const isAdding = addingId === movie.id;

            return (
              <div key={movie.id} className="amm__result-row">
                {/* Poster */}
                <div className="amm__result-poster">
                  {movie.poster_path ? (
                    <img
                      src={movie.poster_path}
                      alt={movie.title}
                      loading="lazy"
                      className="amm__result-poster-img"
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/60x90/1a1a1a/555?text=N/A'; }}
                    />
                  ) : (
                    <Film size={18} className="amm__result-poster-placeholder" />
                  )}
                </div>

                {/* Info */}
                <div className="amm__result-info">
                  <div className="amm__result-title-row">
                    <span className="amm__result-title">{movie.title}</span>
                    {year && <span className="amm__result-year">{year}</span>}
                  </div>
                  {rating && (
                    <div className="amm__result-rating">
                      <Star size={11} className="amm__result-star" />
                      <span>{rating}</span>
                    </div>
                  )}
                  {movie.overview && (
                    <p className="amm__result-overview">{movie.overview}</p>
                  )}
                </div>

                {/* Add button */}
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

        {/* ── TMDB Attribution Footer ── */}
        <div className="amm__footer">
          <TmdbBadge />
          <span className="amm__footer-text">
            Powered by <strong>The Movie Database</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
