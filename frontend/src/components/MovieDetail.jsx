import React, { useState, useEffect } from 'react';
import {
  X,
  Star,
  Clock,
  Calendar,
  Trash2,
  CheckCircle2,
  Film,
  Save,
  Tag,
  Share2,
  ExternalLink,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'plan_to_watch', label: 'Plan to Watch', color: '#3b82f6', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'watching', label: 'Watching', color: '#f59e0b', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'completed', label: 'Completed', color: '#10b981', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { value: 'dropped', label: 'Dropped', color: '#ef4444', bg: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

export default function MovieDetail({
  item,
  onClose,
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

  // Sync state if item changes
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
        onClose();
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

  return (
    <aside className="w-[380px] bg-[#161616] border-l border-[#262626] flex flex-col h-full overflow-hidden shadow-2xl animate-fade-in select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#242424] bg-[#181818]/90 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Movie Details
          </span>
          {item.list_name && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              {item.list_name}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          title="Close details (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content Scrollable Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Backdrop Banner with Poster overlay */}
        <div className="relative w-full h-44 bg-zinc-900 overflow-hidden">
          {movie.backdrop_path ? (
            <img
              src={movie.backdrop_path}
              alt=""
              className="w-full h-full object-cover opacity-60 filter blur-[1px] scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-zinc-800 to-zinc-950" />
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-[#161616]/60 to-transparent" />

          {/* Poster & Main Header info overlaid */}
          <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3.5 z-10">
            <div className="w-20 h-28 rounded-lg overflow-hidden shrink-0 border-2 border-zinc-700 bg-zinc-800 shadow-xl">
              {movie.poster_path ? (
                <img
                  src={movie.poster_path}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://via.placeholder.com/150x225/1f1f1f/777777?text=No+Poster';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film size={24} className="text-zinc-500" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <h2 className="text-base font-extrabold text-white leading-tight line-clamp-2 drop-shadow">
                {movie.title}
              </h2>

              <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-zinc-300">
                {releaseYear && (
                  <span className="flex items-center gap-1 font-medium">
                    <Calendar size={11} className="text-zinc-400" /> {releaseYear}
                  </span>
                )}
                {movie.runtime > 0 && (
                  <span className="flex items-center gap-1 font-medium">
                    <Clock size={11} className="text-zinc-400" /> {movie.runtime}m
                  </span>
                )}
                {voteAvg && (
                  <div className="flex items-center gap-1 font-bold text-[#f5c518] bg-black/60 px-1.5 py-0.5 rounded border border-yellow-500/30">
                    <Star size={11} className="fill-[#f5c518]" />
                    <span>{voteAvg}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Details & Interactive Settings Section */}
        <div className="p-4 space-y-5">
          {/* Genres Chips */}
          {genresList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genresList.map((genre, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#242424] text-zinc-300 border border-zinc-700/60"
                >
                  {typeof genre === 'string' ? genre : genre.name}
                </span>
              ))}
            </div>
          )}

          {/* Plot Overview */}
          {movie.overview && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Overview
              </h4>
              <p className="text-xs text-zinc-300 leading-relaxed font-normal bg-[#1c1c1c] p-3 rounded-xl border border-[#2b2b2b]">
                {movie.overview}
              </p>
            </div>
          )}

          {/* Watch Status Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Watch Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      isSelected
                        ? `${opt.bg} border-current ring-1 ring-current font-bold`
                        : 'bg-[#202020] text-zinc-400 border-zinc-800 hover:bg-[#282828] hover:text-zinc-200'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <CheckCircle2 size={14} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personal Rating (10-Star Interactive) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Your Rating
              </label>
              <div className="text-xs font-bold text-[#f5c518]">
                {(hoverRating || userRating) ? `${hoverRating || userRating} / 10` : 'Not Rated'}
              </div>
            </div>

            <div className="bg-[#1c1c1c] p-3 rounded-xl border border-[#2b2b2b] flex items-center justify-between">
              <div
                className="flex items-center gap-1 cursor-pointer"
                onMouseLeave={() => setHoverRating(null)}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
                  const activeScore = hoverRating !== null ? hoverRating : userRating;
                  const isFilled = activeScore !== null && star <= activeScore;

                  return (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onClick={() => handleRatingChange(star)}
                      className="p-0.5 hover:scale-125 transition-transform"
                      title={`Rate ${star}/10`}
                    >
                      <Star
                        size={18}
                        className={`transition-colors ${
                          isFilled
                            ? 'text-[#f5c518] fill-[#f5c518]'
                            : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {userRating && (
                <button
                  onClick={() => handleRatingChange(null)}
                  className="text-[10px] text-zinc-500 hover:text-red-400 px-1.5 py-0.5 rounded transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Personal Notes / Review */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Personal Notes & Review
              </label>
              {isSaved && (
                <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
            </div>

            <div className="space-y-2">
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="Write your personal thoughts, favorite scenes, quotes, or review..."
                rows={4}
                className="w-full bg-[#1c1c1c] border border-[#2b2b2b] rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#f5c518] transition-colors resize-none leading-relaxed"
              />

              <div className="flex justify-end">
                <button
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#252525] hover:bg-[#303030] text-xs font-semibold text-zinc-200 hover:text-[#f5c518] rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
                >
                  <Save size={13} />
                  <span>{isSavingNotes ? 'Saving...' : 'Save Notes'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Remove from list */}
          <div className="pt-2 border-t border-[#242424]">
            <button
              onClick={handleRemove}
              disabled={isRemoving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              <span>{isRemoving ? 'Removing...' : 'Remove from List'}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
