import React, { useState, useEffect, useRef } from 'react';
import { LIBRARY, getTvSeason } from '../api/client';
import ListPicker from './ListPicker';
import ListMembershipPicker from './ListMembershipPicker';
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
  Plus,
  Loader2,
  Tv,
  Minus,
  Radio,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  isTv,
  yearLabel,
  seasonsLabel,
  episodeCode,
  nextEpisode,
  previousEpisode,
  orderedSeasons,
  watchedInSeason,
} from '../lib/media';

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


export default function MovieDetailPage({
  item,
  onBack,
  onUpdateItem,
  onRemoveItem,
  // Preview mode: a movie that is not in the library yet (opened from a web recommendation).
  // It is read-only, and the only action is adding it to a list. Nothing is saved by opening it.
  isPreview = false,
  lists = [],
  onAdd,
  backLabel = 'Back to Movies',
  memberListIds = [], // custom lists this movie is in (any of its entries)
  onSetLists,
}) {
  const movie = item?.movie || {};
  const [status, setStatus] = useState(item?.status || 'plan_to_watch');
  const [userRating, setUserRating] = useState(item?.user_rating || null);
  const [hoverRating, setHoverRating] = useState(null);
  const [userNotes, setUserNotes] = useState(item?.user_notes || '');
  const [targetListId, setTargetListId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSavingLists, setIsSavingLists] = useState(false);
  // Seasons opened on a show's page: season number -> { status, episodes }
  const [openSeasons, setOpenSeasons] = useState({});
  // TV progress: the last episode watched, or nulls before starting
  const [progress, setProgress] = useState({ season: item?.current_season ?? null, episode: item?.current_episode ?? null });
  // Latest progress, so quick repeated clicks each step from the one before
  const progressRef = useRef(progress);

  useEffect(() => {
    setStatus(item?.status || 'plan_to_watch');
    setUserRating(item?.user_rating || null);
    setUserNotes(item?.user_notes || '');
    setIsSaved(false);
  }, [item]);

  // Progress resets only when another title opens: each save echoes the item back, and an
  // echo from an earlier click must not wind the stepper back while you keep clicking
  useEffect(() => {
    progressRef.current = { season: item?.current_season ?? null, episode: item?.current_episode ?? null };
    setProgress(progressRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // Preview mode (a web pick from Discover) adds to Library only unless you pick a list
  useEffect(() => {
    if (isPreview) setTargetListId(LIBRARY);
  }, [isPreview]);

  const handleAddToList = async () => {
    if (!targetListId || isAdding) return;
    try {
      setIsAdding(true);
      await onAdd?.(targetListId);
    } finally {
      setIsAdding(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    try { await onUpdateItem(item.id, { status: newStatus }); }
    catch (err) { console.error('Failed to update status:', err); }
  };

  // Moving progress on a show you haven't started also marks it as Watching.
  // `step` is 'next', 'previous', or an exact { season, episode } (an episode clicked in a season).
  const handleProgressChange = async (step) => {
    const current = progressRef.current;
    let next = step;
    if (step === 'next') next = nextEpisode(movie, current.season, current.episode);
    else if (step === 'previous') next = previousEpisode(movie, current.season, current.episode);
    if (step === 'next' && !next) return;
    const season = next ? next.season : null;
    const episode = next ? next.episode : null;
    progressRef.current = { season, episode };
    setProgress(progressRef.current);
    const updates = { current_season: season, current_episode: episode };
    if (next && status === 'plan_to_watch') {
      setStatus('watching');
      updates.status = 'watching';
    }
    try { await onUpdateItem(item.id, updates); }
    catch (err) { console.error('Failed to update progress:', err); }
  };

  const toggleSeason = async (seasonNumber) => {
    if (openSeasons[seasonNumber]) {
      setOpenSeasons(({ [seasonNumber]: _closed, ...rest }) => rest);
      return;
    }
    setOpenSeasons((prev) => ({ ...prev, [seasonNumber]: { status: 'loading', episodes: [] } }));
    try {
      const data = await getTvSeason(movie.tmdb_id, seasonNumber);
      setOpenSeasons((prev) => (prev[seasonNumber] ? { ...prev, [seasonNumber]: { status: 'ok', episodes: data.episodes || [] } } : prev));
    } catch {
      setOpenSeasons((prev) => (prev[seasonNumber] ? { ...prev, [seasonNumber]: { status: 'error', episodes: [] } } : prev));
    }
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

  const handleListsChange = async (listIds) => {
    try {
      setIsSavingLists(true);
      await onSetLists?.(item.id, listIds);
    } finally {
      setIsSavingLists(false);
    }
  };

  // Goes straight to Trash; the toast that follows offers Undo
  const handleRemove = async () => {
    try {
      setIsRemoving(true);
      await onRemoveItem(item.id);
      onBack();
    } catch (err) {
      console.error('Failed to remove item:', err);
    } finally {
      setIsRemoving(false);
    }
  };

  if (!item) return null;


  // Derived data
  const tv = isTv(movie);
  const releaseYear = yearLabel(movie);
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

  // TV-only bits
  const episodesLabel = movie.number_of_episodes ? `${movie.number_of_episodes} episodes` : '';
  const network = (movie.networks || []).map((n) => n.name).filter(Boolean).join(', ');
  const nextAir = movie.next_episode_to_air;
  const formatAirDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  let airStatus = '';
  if (tv && movie.release_status) {
    if (movie.release_status === 'Returning Series') {
      airStatus = nextAir?.air_date ? `Returning · next episode ${formatAirDate(nextAir.air_date)}` : 'Returning';
    } else {
      airStatus = movie.release_status;
    }
  }
  const started = progress.season != null && progress.episode != null;
  const upNext = tv ? nextEpisode(movie, progress.season, progress.episode) : null;
  const seasonList = tv ? orderedSeasons(movie) : [];
  const progressItem = { current_season: progress.season, current_episode: progress.episode };

  return (
    <div className="mdp-root custom-scrollbar">

      {/* ── Top Nav Bar ── */}
      <header className="mdp-topbar">
        <button type="button" onClick={onBack} className="mdp-back-btn" aria-label={isPreview ? 'Back' : backLabel}>
          <ArrowLeft size={15} />
          <span>{isPreview ? 'Back' : backLabel}</span>
        </button>

        {isPreview ? (
          <div className="mdp-topbar-right">
            <ListPicker lists={lists} value={targetListId} onChange={setTargetListId} label="" />
            <button
              type="button"
              onClick={handleAddToList}
              disabled={isAdding || !targetListId}
              className="mdp-add-btn"
            >
              {isAdding ? <Loader2 size={13} className="dz-spinner" /> : <Plus size={13} />}
              <span>Add to list</span>
            </button>
          </div>
        ) : (
          <div className="mdp-topbar-right">
            <ListMembershipPicker
              lists={lists}
              memberIds={memberListIds}
              isSaving={isSavingLists}
              onChange={handleListsChange}
            />
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              className="mdp-remove-btn"
              aria-label="Remove"
            >
              <Trash2 size={13} />
              <span>{isRemoving ? 'Removing…' : 'Remove'}</span>
            </button>
          </div>
        )}
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
          <h1 className="mdp-title">
            {movie.title}
            {tv && <span className="tv-tag mdp-tv-tag">TV</span>}
          </h1>

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
            {tv && seasonsLabel(movie) && (
              <span className="mdp-meta-pill">
                <Tv size={12} className="mdp-meta-pill__icon" />
                {[seasonsLabel(movie), episodesLabel].filter(Boolean).join(' · ')}
              </span>
            )}
            {movie.runtime > 0 && (
              <span className="mdp-meta-pill">
                <Clock size={12} className="mdp-meta-pill__icon" />
                {tv
                  ? `~${movie.runtime}m / episode`
                  : `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`}
              </span>
            )}
            {directorName && (
              <span className="mdp-meta-pill">
                <User size={12} className="mdp-meta-pill__icon" />
                {tv ? `Created by ${directorName}` : directorName}
              </span>
            )}
            {network && (
              <span className="mdp-meta-pill">{network}</span>
            )}
            {airStatus && (
              <span className={`mdp-meta-pill ${movie.release_status === 'Returning Series' ? 'mdp-meta-pill--live' : ''}`}>
                <Radio size={12} className="mdp-meta-pill__icon" />
                {airStatus}
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
          {!isPreview && (
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
          )}

          {/* TV progress: the last episode watched */}
          {!isPreview && tv && (
          <div className="mdp-status-block">
            <span className="mdp-status-block__label">Progress</span>
            <div className="mdp-progress">
              {started ? (
                <div className="mdp-progress__stepper">
                  <span className="mdp-progress__code">{episodeCode(progress.season, progress.episode)}</span>
                  <button
                    type="button"
                    className="mdp-progress__btn"
                    onClick={() => handleProgressChange('previous')}
                    aria-label="Back one episode"
                    title="Back one episode"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ) : (
                <span className="mdp-progress__none">Not started</span>
              )}
              {upNext && (
                <button type="button" className="mdp-progress__next" onClick={() => handleProgressChange('next')}>
                  <Plus size={13} />
                  <span>{started ? '1 episode' : 'Watched S1E1'}</span>
                </button>
              )}
              <span className="mdp-progress__hint">
                {upNext ? (started ? `Next up: ${episodeCode(upNext.season, upNext.episode)}` : '') : 'All aired episodes watched'}
              </span>
            </div>
          </div>
          )}
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

        {/* Seasons (TV): progress comes from the "up to SxEy" pointer */}
        {tv && seasonList.length > 0 && (
          <section className="mdp-section">
            <h2 className="mdp-section-title">Seasons</h2>
            <div className="mdp-seasons">
              {seasonList.map((season) => {
                const total = Number(season.episode_count) || 0;
                const watched = watchedInSeason(season, progressItem);
                const done = total > 0 && watched >= total;
                const year = (season.air_date || '').slice(0, 4);
                let state = 'Not started';
                if (!season.air_date && !total) state = 'Not aired';
                else if (done) state = 'Watched';
                else if (watched > 0) state = `${watched} of ${total}`;
                const opened = openSeasons[season.season_number];
                return (
                  <React.Fragment key={season.season_number}>
                  <button
                    type="button"
                    className={`mdp-season ${opened ? 'is-open' : ''}`}
                    aria-expanded={Boolean(opened)}
                    onClick={() => toggleSeason(season.season_number)}
                  >
                    <div className="mdp-season__poster">
                      {season.poster_path
                        ? <img src={season.poster_path} alt="" loading="lazy" />
                        : <Tv size={16} />}
                    </div>
                    <div className="mdp-season__info">
                      <span className="mdp-season__name">{season.name || `Season ${season.season_number}`}</span>
                      <span className="mdp-season__meta">
                        {[total ? `${total} episode${total === 1 ? '' : 's'}` : '', year].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    {!isPreview && total > 0 && season.season_number > 0 && (
                      <div className="mdp-season__bar" aria-hidden="true">
                        <i style={{ width: `${Math.round((watched / total) * 100)}%` }} className={done ? 'is-done' : ''} />
                      </div>
                    )}
                    {!isPreview && season.season_number > 0 && (
                      <span className={`mdp-season__state ${done ? 'is-done' : watched > 0 ? 'is-active' : ''}`}>
                        {done && <CheckCircle2 size={12} />}
                        {state}
                      </span>
                    )}
                    <ChevronDown size={15} className="mdp-season__chevron" />
                  </button>
                  {opened && (
                    <div className="mdp-episodes">
                      {opened.status === 'loading' && <p className="mdp-episodes__note"><Loader2 size={13} className="dz-spinner" /> Loading episodes…</p>}
                      {opened.status === 'error' && <p className="mdp-episodes__note">Couldn't load this season's episodes.</p>}
                      {opened.status === 'ok' && opened.episodes.length === 0 && <p className="mdp-episodes__note">No episodes listed yet.</p>}
                      {opened.episodes.map((ep) => {
                        const isWatched = season.season_number > 0 && watched >= ep.episode_number;
                        const isCurrent = progress.season === season.season_number && progress.episode === ep.episode_number;
                        const aired = ep.air_date ? formatAirDate(ep.air_date) : 'Not aired';
                        const canSet = !isPreview && season.season_number > 0;
                        return (
                          <button
                            key={ep.episode_number}
                            type="button"
                            className={`mdp-episode ${isWatched ? 'is-watched' : ''} ${isCurrent ? 'is-current' : ''}`}
                            disabled={!canSet}
                            title={canSet ? `Mark watched up to ${episodeCode(season.season_number, ep.episode_number)}` : undefined}
                            onClick={() => handleProgressChange({ season: season.season_number, episode: ep.episode_number })}
                          >
                            <span className="mdp-episode__check">{isWatched && <Check size={11} />}</span>
                            <span className="mdp-episode__num">E{ep.episode_number}</span>
                            <span className="mdp-episode__name">{ep.name || `Episode ${ep.episode_number}`}</span>
                            <span className="mdp-episode__meta">
                              {[aired, ep.runtime ? `${ep.runtime}m` : ''].filter(Boolean).join(' · ')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  </React.Fragment>
                );
              })}
            </div>
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
        {!isPreview && (
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
        )}

      </main>
    </div>
  );
}
