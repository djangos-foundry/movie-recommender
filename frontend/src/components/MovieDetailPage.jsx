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
} from 'lucide-react';

const STATUS_OPTIONS = [
  {
    value: 'plan_to_watch',
    label: 'Plan to Watch',
    activeBg: 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-blue-500/20',
  },
  {
    value: 'watching',
    label: 'Watching',
    activeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-500/20',
  },
  {
    value: 'completed',
    label: 'Completed',
    activeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-500/20',
  },
  {
    value: 'dropped',
    label: 'Dropped',
    activeBg: 'bg-red-500/20 text-red-400 border-red-500/40 shadow-red-500/20',
  },
];

export default function MovieDetailPage({
  item,
  onBack,
  onUpdateItem,
  onRemoveItem,
}) {
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
    try {
      await onUpdateItem(item.id, { status: newStatus });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleRatingChange = async (rating) => {
    const nextRating = userRating === rating ? null : rating;
    setUserRating(nextRating);
    try {
      await onUpdateItem(item.id, { user_rating: nextRating });
    } catch (err) {
      console.error('Failed to update rating:', err);
    }
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
    if (window.confirm(`Are you sure you want to remove "${movie.title}" from this list?`)) {
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

  const releaseYear = movie.release_date ? movie.release_date.substring(0, 4) : '';
  const voteAvg = movie.vote_average ? Number(movie.vote_average).toFixed(1) : null;
  const genresList = Array.isArray(movie.genres) ? movie.genres : [];

  // Director extraction
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

  // Parse cast list
  let castList = [];
  if (Array.isArray(movie.cast)) {
    castList = movie.cast;
  } else if (typeof movie.cast === 'string') {
    try {
      castList = JSON.parse(movie.cast);
    } catch (e) {}
  }

  // Currency formatter
  const formatMoney = (amount) => {
    if (!amount || amount <= 0) return null;
    return '$' + Number(amount).toLocaleString();
  };

  const releaseStatus = movie.raw_data?.status || 'Released';
  const originalLanguage =
    movie.raw_data?.original_language?.toUpperCase() ||
    (movie.spoken_languages?.[0]?.english_name) ||
    'English';
  const prodCountries = movie.raw_data?.production_countries?.map((c) => c.name).join(', ');

  const backdropUrl = movie.backdrop_path || movie.poster_path;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#121212] text-white custom-scrollbar select-none">
      {/* 1. Top Navigation Bar - Height 64px (h-16) aligned horizontally */}
      <header className="sticky top-0 z-30 h-16 bg-[#121212]/90 backdrop-blur-md border-b border-[#242424] px-6 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-zinc-300 hover:text-white text-xs font-semibold transition-all border border-[#333333]"
        >
          <ArrowLeft size={16} />
          <span>Back to Movies</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1c1c1c] border border-zinc-800 text-xs text-zinc-400">
            <span>List:</span>
            <span className="text-white font-semibold">{item.list_name || 'My List'}</span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemoving}
            title="Remove movie from list"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-800/40 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
            <span>Remove</span>
          </button>
        </div>
      </header>

      {/* 2. Hero Backdrop - Fixed height 280px */}
      <div className="movie-hero-backdrop">
        {backdropUrl ? (
          <img
            src={backdropUrl}
            alt={movie.title}
            className="w-full h-full object-cover object-center opacity-40 filter blur-[1px]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <Film size={54} className="text-zinc-700" />
          </div>
        )}
        {/* Dark gradient fade overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#121212] via-[#121212]/40 to-[#121212]/80" />
      </div>

      {/* 3. Main Hero Card - Poster on Left, Details on Right */}
      <div className="-mt-32 relative z-20 max-w-6xl mx-auto px-6 w-full">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Left: Fixed poster card */}
          <div className="movie-poster-card shrink-0">
            {movie.poster_path ? (
              <img
                src={movie.poster_path}
                alt={movie.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-800">
                <Film size={48} />
                <span className="text-xs font-semibold mt-2">No Poster</span>
              </div>
            )}
          </div>

          {/* Right: Movie Title, Badges, Status & Rating */}
          <div className="flex-1 space-y-4 min-w-0 pt-2">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-md">
                {movie.title}
              </h1>

              {movie.original_title && movie.original_title !== movie.title && (
                <p className="text-xs text-zinc-400 font-medium mt-1">
                  Original Title: {movie.original_title}
                </p>
              )}

              {movie.tagline && (
                <p className="text-sm font-medium text-[#f5c518] italic mt-1.5">
                  "{movie.tagline}"
                </p>
              )}
            </div>

            {/* Metadata badges row */}
            <div className="flex items-center gap-3 text-xs text-zinc-300 font-medium flex-wrap">
              {releaseYear && (
                <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-zinc-700/60">
                  <Calendar size={13} className="text-[#f5c518]" />
                  <span>{releaseYear}</span>
                </span>
              )}

              {movie.runtime > 0 && (
                <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-zinc-700/60">
                  <Clock size={13} className="text-[#f5c518]" />
                  <span>
                    {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                  </span>
                </span>
              )}

              {directorName && (
                <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-zinc-700/60">
                  <User size={13} className="text-[#f5c518]" />
                  <span>Dir: {directorName}</span>
                </span>
              )}

              {voteAvg && (
                <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md border border-yellow-500/40 font-bold text-white">
                  <Star size={13} className="text-[#f5c518] fill-[#f5c518]" />
                  <span>{voteAvg}</span>
                  <span className="text-zinc-500 font-normal">/10</span>
                </span>
              )}

              {/* Genre Pills */}
              {genresList.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {genresList.map((genre) => (
                    <span
                      key={genre}
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#222222] border border-zinc-700/60 text-zinc-300"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Watch Status Selector Pills */}
            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#2a2a2a] space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Watch Status
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {STATUS_OPTIONS.map((opt) => {
                  const isSelected = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleStatusChange(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        isSelected
                          ? `${opt.activeBg} font-bold shadow-md`
                          : 'border-[#333333] text-zinc-400 hover:text-white hover:bg-[#242424]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 10-Star Personal Rating */}
            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#2a2a2a] space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Your Rating
                </h3>
                {userRating ? (
                  <span className="text-xs font-bold text-[#f5c518]">
                    {userRating} / 10
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500 italic">Not rated</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 py-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
                  const isFilled = (hoverRating || userRating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingChange(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      className="p-0.5 hover:scale-125 transition-transform"
                    >
                      <Star
                        size={18}
                        className={
                          isFilled
                            ? 'text-[#f5c518] fill-[#f5c518]'
                            : 'text-zinc-600 hover:text-zinc-400'
                        }
                      />
                    </button>
                  );
                })}
              </div>

              {userRating && (
                <button
                  type="button"
                  onClick={() => handleRatingChange(null)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 underline block"
                >
                  Clear rating
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Content Sections: Synopsis, Cast, Metadata, Notes */}
      <main className="max-w-6xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Synopsis / Overview */}
        <div className="space-y-2">
          <h2 className="text-base font-bold text-white tracking-wide">Overview</h2>
          <p className="text-sm text-zinc-300 leading-relaxed font-normal">
            {movie.overview || 'No synopsis available for this title.'}
          </p>
        </div>

        {/* Top Cast & Crew Gallery */}
        {castList.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">Top Cast & Crew</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {castList.slice(0, 12).map((actor) => (
                <div
                  key={actor.id || actor.name}
                  className="bg-[#1a1a1a] p-2.5 rounded-xl border border-[#2a2a2a] flex flex-col items-center text-center gap-2"
                >
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                    {actor.profile_path ? (
                      <img
                        src={actor.profile_path}
                        alt={actor.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 font-bold text-xs">
                        {actor.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="text-xs font-bold text-white truncate">{actor.name}</p>
                    {actor.character && (
                      <p className="text-[10px] text-zinc-400 truncate">{actor.character}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Production & Release Details */}
        <div className="space-y-3">
          <h2 className="text-base font-bold text-white">Production & Details</h2>
          <div className="bg-[#181818] p-5 rounded-2xl border border-[#262626] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {formatMoney(movie.budget) && (
              <div>
                <span className="text-zinc-500 font-medium block mb-0.5">Budget</span>
                <span className="text-white font-semibold">{formatMoney(movie.budget)}</span>
              </div>
            )}
            {formatMoney(movie.revenue) && (
              <div>
                <span className="text-zinc-500 font-medium block mb-0.5">Box Office Revenue</span>
                <span className="text-white font-semibold">{formatMoney(movie.revenue)}</span>
              </div>
            )}
            {releaseStatus && (
              <div>
                <span className="text-zinc-500 font-medium block mb-0.5">Release Status</span>
                <span className="text-white font-semibold">{releaseStatus}</span>
              </div>
            )}
            {originalLanguage && (
              <div>
                <span className="text-zinc-500 font-medium block mb-0.5">Original Language</span>
                <span className="text-white font-semibold">{originalLanguage}</span>
              </div>
            )}
            {prodCountries && (
              <div>
                <span className="text-zinc-500 font-medium block mb-0.5">Production Countries</span>
                <span className="text-white font-semibold">{prodCountries}</span>
              </div>
            )}
            {movie.imdb_id && (
              <div>
                <span className="text-zinc-500 font-medium block mb-0.5">IMDb Reference</span>
                <a
                  href={`https://www.imdb.com/title/${movie.imdb_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#f5c518] hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>{movie.imdb_id}</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
            {movie.homepage && (
              <div>
                <span className="text-zinc-500 font-medium block mb-0.5">Official Website</span>
                <a
                  href={movie.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#f5c518] hover:underline flex items-center gap-1 truncate font-semibold"
                >
                  <span>Visit Page</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Personal Review & Notes */}
        <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-[#2a2a2a] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Personal Notes & Review</span>
            </h2>
            {isSaved && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 size={14} />
                <span>Saved</span>
              </span>
            )}
          </div>

          <textarea
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="Add your personal thoughts, memorable quotes, or viewing notes here..."
            rows={4}
            className="w-full bg-[#121212] text-xs text-zinc-200 rounded-xl p-3.5 border border-[#333333] focus:border-[#f5c518] focus:outline-none transition-colors resize-none leading-relaxed"
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#f5c518] hover:bg-[#e2b616] text-black text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Save size={14} />
              <span>{isSavingNotes ? 'Saving...' : 'Save Notes'}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
