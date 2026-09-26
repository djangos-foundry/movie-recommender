import React, { useState, useMemo, useRef } from 'react';
import { Search, Plus, Star, Film, ChevronDown, FolderOpen, X } from 'lucide-react';

const STATUS_BADGES = {
  plan_to_watch: { label: 'Plan to Watch', cls: 'badge--blue' },
  watching:      { label: 'Watching',       cls: 'badge--amber' },
  completed:     { label: 'Completed',      cls: 'badge--green' },
  dropped:       { label: 'Dropped',        cls: 'badge--red' },
};

const SIZES = [
  { id: 'small',       label: 'S' },
  { id: 'medium',      label: 'M' },
  { id: 'large',       label: 'L' },
  { id: 'extra-large', label: 'XL' },
];

const SORT_OPTIONS = [
  { value: 'added',  label: 'Recently Added' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'title',  label: 'Title A–Z' },
  { value: 'year',   label: 'Year' },
];

export default function MovieList({
  currentList,
  items = [],
  selectedItemId,
  onSelectItem,
  onOpenSearch,
  isLoading = false,
  cardSize = 'medium',
  onCardSizeChange,
  shortcuts = {},
  onRemoveItem,
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('added');
  const [sortOpen, setSortOpen] = useState(false);
  const searchRef = useRef(null);

  const listName  = currentList?.name  || 'All Movies';
  const listColor = currentList?.color || '#f5c518';

  const filtered = useMemo(() => {
    return items
      .filter((item) => {
        if (!search.trim()) return true;
        return (item.movie?.title || '').toLowerCase().includes(search.toLowerCase());
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return (b.user_rating || b.movie?.vote_average || 0) - (a.user_rating || a.movie?.vote_average || 0);
        if (sortBy === 'title')  return (a.movie?.title || '').localeCompare(b.movie?.title || '');
        if (sortBy === 'year')   return ((b.movie?.release_date || '').substring(0, 4)).localeCompare((a.movie?.release_date || '').substring(0, 4));
        return b.id - a.id;
      });
  }, [items, search, sortBy]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label || 'Sort';

  return (
    <main className="main-content">
      {/* ── Topbar ── */}
      <header className="topbar">
        {/* Left: list title */}
        <div className="topbar__left">
          <h1 className="topbar__title">{listName}</h1>
          <span className="topbar__count">{items.length}</span>
        </div>


        {/* Center: search */}
        <div className="topbar__search-wrap">
          <div className="topbar__search" onClick={() => searchRef.current?.focus()}>
            <Search size={14} className="topbar__search-icon" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${listName}…`}
              className="topbar__search-input"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="topbar__search-clear"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            ) : (
              <kbd className="topbar__search-kbd">{shortcuts.search || 'Ctrl+K'}</kbd>
            )}
          </div>
        </div>

        {/* Right: controls */}
        <div className="topbar__right">
          {/* Sort */}
          <div className="topbar__sort" style={{ position: 'relative' }}>
            <button
              type="button"
              className="topbar__sort-btn"
              onClick={() => setSortOpen((v) => !v)}
            >
              <span>{currentSortLabel}</span>
              <ChevronDown size={13} className={`topbar__sort-chevron ${sortOpen ? 'is-open' : ''}`} />
            </button>
            {sortOpen && (
              <>
                <div className="topbar__sort-backdrop" onClick={() => setSortOpen(false)} />
                <div className="topbar__sort-dropdown">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`topbar__sort-option ${sortBy === o.value ? 'is-active' : ''}`}
                      onClick={() => { setSortBy(o.value); setSortOpen(false); }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Card size */}
          <div className="topbar__sizes">
            {SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onCardSizeChange?.(s.id)}
                className={`topbar__size-btn ${cardSize === s.id ? 'is-active' : ''}`}
                title={`${s.id} cards`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Add movie */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="topbar__add-btn"
            title={`Add Movie (${shortcuts.addMovie || 'Alt+N'})`}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Add Movie</span>
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="content-area custom-scrollbar">
        {isLoading ? (
          <div className="state-centered">
            <div className="spinner" />
            <span className="state-centered__label">Loading movies…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="state-empty">
            <div className="state-empty__icon">
              <FolderOpen size={28} />
            </div>
            <h3 className="state-empty__title">
              {search ? 'No results found' : 'Nothing here yet'}
            </h3>
            <p className="state-empty__body">
              {search
                ? `No movies match "${search}".`
                : `Start by adding movies to "${listName}".`}
            </p>
            {!search && (
              <button type="button" onClick={onOpenSearch} className="topbar__add-btn">
                <Plus size={15} strokeWidth={2.5} />
                <span>Add your first movie</span>
              </button>
            )}
          </div>
        ) : (
          <div className={`movie-grid size-${cardSize}`}>
            {filtered.map((item) => {
              const movie = item.movie || {};
              const isSelected = selectedItemId === item.id;
              const year = movie.release_date?.substring(0, 4) || '';
              const rating = item.user_rating
                ? Number(item.user_rating).toFixed(1)
                : movie.vote_average && Number(movie.vote_average) > 0
                ? Number(movie.vote_average).toFixed(1)
                : null;
              const badge = STATUS_BADGES[item.status] || STATUS_BADGES.plan_to_watch;

              return (
                <article
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className={`movie-card ${isSelected ? 'movie-card--selected' : ''}`}
                >
                  {/* Poster */}
                  <div className="movie-card__poster">
                    {movie.poster_path ? (
                      <img
                        src={movie.poster_path}
                        alt={movie.title}
                        loading="lazy"
                        className="movie-card__img"
                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/300x450/1a1a1a/555?text=No+Poster'; }}
                      />
                    ) : (
                      <div className="movie-card__no-poster">
                        <Film size={32} />
                      </div>
                    )}
                    {/* Top-right delete button (cross in circle, scales with size, hidden until hovered at that location) */}
                    <button
                      type="button"
                      className="movie-card__delete-btn"
                      title={`Remove "${movie.title}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Are you sure you want to remove "${movie.title}" from this list?`)) {
                          onRemoveItem?.(item.id);
                        }
                      }}
                      aria-label={`Remove ${movie.title}`}
                    >
                      <X className="movie-card__delete-icon" />
                    </button>

                    <div className="movie-card__gradient" />
                    {/* Status badge */}
                    <span className={`movie-card__status-badge badge ${badge.cls}`}>{badge.label}</span>
                  </div>

                  {/* Info */}
                  <div className="movie-card__info">
                    <h3 className="movie-card__title">{movie.title}</h3>
                    <div className="movie-card__meta">
                      {year && <span>{year}</span>}
                      {movie.runtime > 0 && (
                        <>
                          <span className="movie-card__dot">·</span>
                          <span>{movie.runtime}m</span>
                        </>
                      )}
                      {rating && (
                        <>
                          <span className="movie-card__dot">·</span>
                          <span className="movie-card__rating">
                            <Star size={10} className="movie-card__star" />
                            {' '}{rating}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
