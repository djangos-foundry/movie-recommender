import React, { useState, useEffect, useCallback } from 'react';
import { X, Star, Plus, Check, Loader2, Film, Sparkles, Shuffle, Dices } from 'lucide-react';
import { getRecommendations } from '../api/client';

export default function RecommendationModal({
  isOpen,
  onClose,
  lists = [],
  currentList,
  onAddMovie,
  existingMovieIds = new Set(),
}) {
  const [data, setData] = useState(null);
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

  const draw = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await getRecommendations(5);
      setData(res);
    } catch (err) {
      setError(err.message || 'Could not fetch recommendations.');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Draw a fresh set every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setAddedIds(new Set());
      draw();
    }
  }, [isOpen, draw]);

  if (!isOpen) return null;

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
                {data && data.library_size > 0
                  ? `Sampled from ${data.pool_size} candidates, based on your ${data.library_size} saved ${data.library_size === 1 ? 'movie' : 'movies'}`
                  : 'Random picks drawn from the genres you collect'}
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

        {/* ── Seed genres ── */}
        {seedGenres.length > 0 && !isLoading && (
          <div className="rec__seeds">
            <span className="rec__seeds-label">Drawn from</span>
            {seedGenres.map((g) => (
              <span key={g} className="rec__seed-chip">{g}</span>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="amm__error">
            <span>{error}</span>
            <button onClick={() => setError('')} className="amm__error-dismiss">Dismiss</button>
          </div>
        )}

        {/* ── Body ── */}
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

                  {movie.reason && (
                    <span className="rec__reason">{movie.reason}</span>
                  )}

                  {movie.overview && (
                    <p className="amm__result-overview">{movie.overview}</p>
                  )}
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
            onClick={draw}
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
