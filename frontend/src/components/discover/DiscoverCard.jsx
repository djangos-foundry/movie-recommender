import React from 'react';
import { Film, Globe, Bookmark, Plus, Check, Loader2 } from 'lucide-react';
import { STATUS_LABELS, movieYear } from '../../lib/discoverEngine';

export default function DiscoverCard({
  movie,
  status,
  isWeb = false,
  isBookmarked = false,
  inLibrary = false,
  isAdding = false,
  onOpen,
  onToggleBookmark,
  onAdd,
}) {
  const year = movieYear(movie);
  const genre = (movie.genres || [])[0];
  const rating = movie.vote_average && Number(movie.vote_average) > 0 ? Number(movie.vote_average).toFixed(1) : null;
  const meta = [year, genre, rating].filter(Boolean).join(' · ');

  const canOpen = typeof onOpen === 'function';

  return (
    <article className="dz-card">
      <div className="dz-card__poster">
        <button
          type="button"
          className="dz-card__open dz-focusable"
          style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
          disabled={!canOpen}
          onClick={onOpen}
          aria-label={canOpen ? `Open ${movie.title}` : movie.title}
        >
          {movie.poster_path ? (
            <img
              src={movie.poster_path}
              alt=""
              loading="lazy"
              className="dz-card__img"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Film size={36} opacity={0.4} />
            </span>
          )}
        </button>

        <span className="dz-pill">
          {isWeb ? <><Globe size={13} /> Web</> : STATUS_LABELS[status] || ''}
        </span>

        <button
          type="button"
          className={`dz-mark ${isBookmarked ? 'is-on' : ''}`}
          aria-pressed={isBookmarked}
          aria-label={isBookmarked ? 'Remove from shortlist' : 'Add to shortlist'}
          onClick={onToggleBookmark}
        >
          <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>

      <button
        type="button"
        className="dz-card__text dz-focusable"
        disabled={!canOpen}
        onClick={onOpen}
      >
        <span className="dz-card__title">{movie.title}</span>
        <span className="dz-card__meta">{meta}</span>
      </button>

      {isWeb && (
        inLibrary ? (
          <button type="button" className="dz-btn dz-btn--sm" disabled>
            <Check size={14} />In library
          </button>
        ) : (
          <button type="button" className="dz-btn dz-btn--sm" disabled={isAdding} onClick={onAdd}>
            {isAdding ? <Loader2 size={14} className="dz-spinner" /> : <Plus size={14} />}Add to list
          </button>
        )
      )}
    </article>
  );
}
