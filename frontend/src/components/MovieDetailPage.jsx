import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Star,
  Clock,
  Calendar,
  Trash2,
  CheckCircle2,
  Film,
  Save,
  ExternalLink,
  User,
  ChevronRight,
  Folder,
} from 'lucide-react';

const STATUS_OPTIONS = [
  {
    value: 'plan_to_watch',
    label: 'Plan to Watch',
    activeClass: 'mdp-status-pill--plan',
  },
  {
    value: 'watching',
    label: 'Watching',
    activeClass: 'mdp-status-pill--watching',
  },
  {
    value: 'completed',
    label: 'Completed',
    activeClass: 'mdp-status-pill--completed',
  },
  {
    value: 'dropped',
    label: 'Dropped',
    activeClass: 'mdp-status-pill--dropped',
  },
];


export default function MovieDetailPage({ item, onBack, onUpdateItem, onRemoveItem }) {
  if (!item) return null;

  const movie = item.movie || {};
  const [status, setStatus] = useState(item.status || 'plan_to_watch');
  const [userRating, setUserRating] = useState(item.user_rating || null);
  const [hoverRating, setHoverRating] = useState(null);
  const [userNotes, setUserNotes] = useState(item.user_notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    setStatus(item.status || 'plan_to_watch');
    setUserRating(item.user_rating || null);
    setUserNotes(item.user_notes || '');
    setIsSaved(false);
  }, [item]);

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    try { await onUpdateItem(item.id, { status: newStatus }); }
    catch (err) { console.error('Failed to update status:', err); }
  };

  const handleRatingChange = async (rating) => {
    const nextRating = userRating === rating ? null : rating;
    setUserRating(nextRating);
    try { await onUpdateItem(item.id, { user_rating: nextRating }); }
    catch (err) { console.error('Failed to update rating:', err); }
  };

  const handleSaveNotes = async () => {
    try {
      setIsSavingNotes(true);
      await onUpdateItem(item.id, { user_notes: userNotes });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleRemove = async () => {
    if (window.confirm(`Remove "${movie.title}" from this list?`)) {
      try {
        setIsRemoving(true);
        await onRemoveItem(item.id);
        onBack();
      } catch (err) {
        console.error('Failed to remove item:', err);
      } finally {
        setIsRemoving(false);
      }
    }
  };

  // Derived data
  const releaseYear = movie.release_date ? movie.release_date.substring(0, 4) : '';
  const voteAvg = movie.vote_average ? Number(movie.vote_average).toFixed(1) : null;
  const genresList = Array.isArray(movie.genres) ? movie.genres : [];

  let directorName = '';
  if (movie.director) {
    directorName = movie.director;
  } else if (movie.raw_data?.credits?.crew) {
    const dir = movie.raw_data.credits.crew.find((c) => c.job === 'Director');
    if (dir) directorName = dir.name;
  } else if (movie.raw_data?.crew) {
    const dir = movie.raw_data.crew.find((c) => c.job === 'Director');
    if (dir) directorName = dir.name;
  }

  let castList = [];
  if (Array.isArray(movie.cast)) {
    castList = movie.cast;
  } else if (typeof movie.cast === 'string') {
    try { castList = JSON.parse(movie.cast); } catch (e) { }
  }

  const formatMoney = (amount) => {
    if (!amount || amount <= 0) return null;
    return '$' + Number(amount).toLocaleString();
  };

  const releaseStatus = movie.raw_data?.status || 'Released';
  const originalLanguage =
    movie.raw_data?.original_language?.toUpperCase() ||
    movie.spoken_languages?.[0]?.english_name ||
    null;
  const prodCountries = movie.raw_data?.production_countries?.map((c) => c.name).join(', ');

  const backdropUrl = movie.backdrop_path || movie.poster_path;

  return (
    <div className="mdp-root custom-scrollbar">

      {/* ── Top Nav Bar ── */}
      <header className="mdp-topbar">
        <button type="button" onClick={onBack} className="mdp-back-btn">
          <ArrowLeft size={15} />
          <span>Back to Movies</span>
        </button>

        <div className="mdp-topbar-right">
          <div className="mdp-list-pill" title={`Saved in list: ${item.list_name || 'My List'}`}>
            <Folder size={12} className="mdp-list-pill__icon" />
            <span className="mdp-list-pill__label">List</span>
            <span className="mdp-list-pill__divider">·</span>
            <span className="mdp-list-pill__name">{item.list_name || 'My List'}</span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemoving}
            className="mdp-remove-btn"
          >
            <Trash2 size={13} />
            <span>{isRemoving ? 'Removing…' : 'Remove'}</span>
          </button>
        </div>
      </header>

      {/* ── Hero: Backdrop ── */}
      <div className="mdp-backdrop-wrap">
        {backdropUrl ? (
          <img
            src={backdropUrl}
            alt={movie.title}
            className="mdp-backdrop-img"
          />
        ) : (
          <div className="mdp-backdrop-empty">
            <Film size={60} />
          </div>
        )}
        {/* Bottom fade — seamless blend into dark background */}
        <div className="mdp-backdrop-fade-bottom" />
        {/* Left fade */}
        <div className="mdp-backdrop-fade-left" />
        {/* Top fade */}
        <div className="mdp-backdrop-fade-top" />
      </div>

      {/* ── Hero Content: Poster + Info ── */}
      <div className="mdp-hero-content">
        {/* Poster */}
        <div className="mdp-poster-wrap">
          {movie.poster_path ? (
            <img src={movie.poster_path} alt={movie.title} className="mdp-poster-img" />
          ) : (
            <div className="mdp-poster-empty">
              <Film size={40} />
              <span>No Poster</span>
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="mdp-info-panel">
          {/* Breadcrumb-style sub-label */}

          {/* Title */}
          <h1 className="mdp-title">{movie.title}</h1>

          {/* Original title */}
          {movie.original_title && movie.original_title !== movie.title && (
            <p className="mdp-original-title">Original: {movie.original_title}</p>
          )}

          {/* Tagline */}
          {movie.tagline && (
            <p className="mdp-tagline">"{movie.tagline}"</p>
          )}

          {/* Metadata pill row */}
          <div className="mdp-meta-row">
            {releaseYear && (
              <span className="mdp-meta-pill">
                <Calendar size={12} className="mdp-meta-pill__icon" />
                {releaseYear}
              </span>
            )}
            {movie.runtime > 0 && (
              <span className="mdp-meta-pill">
                <Clock size={12} className="mdp-meta-pill__icon" />
                {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
              </span>
            )}
            {directorName && (
              <span className="mdp-meta-pill">
                <User size={12} className="mdp-meta-pill__icon" />
                {directorName}
              </span>
            )}
            {voteAvg && (
              <span className="mdp-meta-pill mdp-meta-pill--rating">
                <Star size={12} className="mdp-meta-pill__icon mdp-meta-pill__icon--star" />
                <strong>{voteAvg}</strong>
                <span className="mdp-meta-pill__sub">/10</span>
              </span>
            )}
          </div>

          {/* Genre tags */}
          {genresList.length > 0 && (
            <div className="mdp-genre-row">
              {genresList.map((genre) => (
                <span key={genre} className="mdp-genre-tag">{genre}</span>
              ))}
            </div>
          )}

          {/* Watch Status */}
          <div className="mdp-status-block">
            <span className="mdp-status-block__label">Watch Status</span>
            <div className="mdp-status-pills">
              {STATUS_OPTIONS.map((opt) => {
                const isActive = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleStatusChange(opt.value)}
                    className={`mdp-status-pill ${isActive ? opt.activeClass : 'mdp-status-pill--inactive'}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Body ── */}
      <main className="mdp-body">

        {/* Overview */}
        {movie.overview && (
          <section className="mdp-section">
            <h2 className="mdp-section-title">Overview</h2>
            <p className="mdp-overview-text">{movie.overview}</p>
          </section>
        )}

        {/* Cast Section */}
        {castList.length > 0 && (
          <section className="mdp-section">
            <h2 className="mdp-section-title">Cast Section</h2>
            <div className="mdp-cast-scroll">
              {castList.slice(0, 14).map((actor) => (
                <div key={actor.id || actor.name} className="mdp-cast-card">
                  <div className="mdp-cast-avatar">
                    {actor.profile_path ? (
                      <img src={actor.profile_path} alt={actor.name} className="mdp-cast-avatar-img" />
                    ) : (
                      <div className="mdp-cast-avatar-fallback">
                        {actor.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <div className="mdp-cast-info">
                    <p className="mdp-cast-name">{actor.name}</p>
                    {actor.character && (
                      <p className="mdp-cast-char">{actor.character}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Details Grid */}
        {(formatMoney(movie.budget) || formatMoney(movie.revenue) || originalLanguage || prodCountries || releaseStatus || movie.imdb_id || movie.homepage) && (
          <section className="mdp-section">
            <h2 className="mdp-section-title">Details Grid</h2>
            <div className="mdp-details-grid">
              {formatMoney(movie.budget) && (
                <div className="mdp-detail-card">
                  <span className="mdp-detail-label">Budget</span>
                  <span className="mdp-detail-value">{formatMoney(movie.budget)}</span>
                </div>
              )}
              {formatMoney(movie.revenue) && (
                <div className="mdp-detail-card">
                  <span className="mdp-detail-label">Box Office</span>
                  <span className="mdp-detail-value">{formatMoney(movie.revenue)}</span>
                </div>
              )}
              {originalLanguage && (
                <div className="mdp-detail-card">
                  <span className="mdp-detail-label">Language</span>
                  <span className="mdp-detail-value">{originalLanguage}</span>
                </div>
              )}
              {prodCountries && (
                <div className="mdp-detail-card">
                  <span className="mdp-detail-label">Country</span>
                  <span className="mdp-detail-value">{prodCountries}</span>
                </div>
              )}
              {releaseStatus && (
                <div className="mdp-detail-card">
                  <span className="mdp-detail-label">Status</span>
                  <span className="mdp-detail-value">{releaseStatus}</span>
                </div>
              )}
              {movie.imdb_id && (
                <div className="mdp-detail-card">
                  <span className="mdp-detail-label">IMDb</span>
                  <a
                    href={`https://www.imdb.com/title/${movie.imdb_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mdp-detail-link"
                  >
                    {movie.imdb_id} <ExternalLink size={11} />
                  </a>
                </div>
              )}
              {movie.homepage && (
                <div className="mdp-detail-card">
                  <span className="mdp-detail-label">Website</span>
                  <a
                    href={movie.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="mdp-detail-link"
                  >
                    Visit Page <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Personal Review & Rating */}
        <section className="mdp-section">
          <h2 className="mdp-section-title">Personal Review</h2>
          <div className="mdp-review-card">

            {/* Rating row inside review */}
            <div className="mdp-review-rating-row">
              <span className="mdp-review-rating-label">Your Rating</span>
              <div className="mdp-review-stars">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
                  const isFilled = (hoverRating || userRating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingChange(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      className="mdp-star-btn"
                    >
                      <Star
                        size={20}
                        className={isFilled ? 'mdp-star--filled' : 'mdp-star--empty'}
                      />
                    </button>
                  );
                })}
                {userRating && (
                  <span className="mdp-review-rating-val">{userRating}/10</span>
                )}
              </div>
              {userRating && (
                <button
                  type="button"
                  onClick={() => handleRatingChange(null)}
                  className="mdp-clear-rating"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Notes textarea */}
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="Add your personal thoughts, memorable quotes, or viewing notes here…"
              rows={5}
              className="mdp-review-textarea"
            />

            {/* Save row */}
            <div className="mdp-review-footer">
              {isSaved && (
                <span className="mdp-review-saved">
                  <CheckCircle2 size={14} />
                  Saved
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={isSavingNotes}
                className="mdp-review-save-btn"
              >
                <Save size={14} />
                {isSavingNotes ? 'Saving…' : 'Save Review'}
              </button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
