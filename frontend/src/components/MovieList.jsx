import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Star,
  Film,
  Calendar,
  Clock,
  Filter,
  SlidersHorizontal,
  FolderOpen,
} from 'lucide-react';

const STATUS_BADGES = {
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  watching: { label: 'Watching', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  completed: { label: 'Completed', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  dropped: { label: 'Dropped', bg: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

export default function MovieList({
  currentList,
  items = [],
  selectedItemId,
  onSelectItem,
  onOpenSearch,
  isLoading = false,
}) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [localSearch, setLocalSearch] = useState('');
  const [sortBy, setSortBy] = useState('added'); // 'added', 'rating', 'title', 'year'

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        if (localSearch.trim()) {
          const q = localSearch.toLowerCase();
          const title = (item.movie?.title || '').toLowerCase();
          const notes = (item.user_notes || '').toLowerCase();
          return title.includes(q) || notes.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') {
          const rA = a.user_rating || a.movie?.vote_average || 0;
          const rB = b.user_rating || b.movie?.vote_average || 0;
          return rB - rA;
        }
        if (sortBy === 'title') {
          return (a.movie?.title || '').localeCompare(b.movie?.title || '');
        }
        if (sortBy === 'year') {
          const yA = (a.movie?.release_date || '').substring(0, 4);
          const yB = (b.movie?.release_date || '').substring(0, 4);
          return yB.localeCompare(yA);
        }
        // default added_at or id desc
        return b.id - a.id;
      });
  }, [items, filterStatus, localSearch, sortBy]);

  const listName = currentList?.name || 'All Movies';
  const listColor = currentList?.color || '#f5c518';

  return (
    <main className="flex-1 flex flex-col h-full bg-[#121212] overflow-hidden min-w-0 select-none">
      {/* Top Header */}
      <header className="p-4 border-b border-[#242424] bg-[#161616] shrink-0">
        <div className="flex items-center justify-between gap-4 mb-3">
          {/* Title & Count */}
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: listColor }}
            />
            <h1 className="text-xl font-extrabold text-white tracking-wide truncate">
              {listName}
            </h1>
            <span className="text-xs font-bold text-zinc-400 bg-[#222222] px-2.5 py-0.5 rounded-full border border-zinc-700/50 shrink-0">
              {items.length} {items.length === 1 ? 'movie' : 'movies'}
            </span>
          </div>

          {/* "+ Add Movie" primary button */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#f5c518] hover:bg-[#e2b616] text-black font-extrabold text-xs rounded-xl shadow-md transition-transform active:scale-95 shrink-0"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Add Movie</span>
          </button>
        </div>

        {/* Quick Search & Filter Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search to Add or Filter Bar */}
          <div
            onClick={onOpenSearch}
            className="flex-1 min-w-[200px] flex items-center gap-2.5 bg-[#1f1f1f] hover:bg-[#252525] border border-[#333333] hover:border-[#444444] rounded-xl px-3.5 py-2 text-zinc-400 text-xs cursor-pointer transition-all shadow-inner"
          >
            <Search size={15} className="text-[#f5c518]" />
            <span className="truncate">Search movie to add to {listName}...</span>
            <kbd className="ml-auto hidden sm:inline-block bg-[#2b2b2b] text-[10px] text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
              Ctrl+K
            </kbd>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center bg-[#1c1c1c] p-1 rounded-xl border border-[#2b2b2b] gap-1 overflow-x-auto custom-scrollbar">
            {['all', 'plan_to_watch', 'watching', 'completed'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg capitalize transition-all whitespace-nowrap ${
                  filterStatus === st
                    ? 'bg-[#f5c518] text-black shadow-sm font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {st.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="shrink-0 flex items-center gap-1 text-zinc-400 text-xs">
            <SlidersHorizontal size={13} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#1c1c1c] border border-[#2b2b2b] text-zinc-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-[#f5c518]"
            >
              <option value="added">Recently Added</option>
              <option value="rating">Highest Rating</option>
              <option value="title">Title (A-Z)</option>
              <option value="year">Release Year</option>
            </select>
          </div>
        </div>
      </header>

      {/* Movies Grid / List */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-3">
            <div className="w-8 h-8 border-2 border-[#f5c518] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading movies...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-h-[500px] text-center p-8 border border-dashed border-[#2b2b2b] rounded-2xl bg-[#161616]/40">
            <div className="w-16 h-16 rounded-2xl bg-[#1f1f1f] flex items-center justify-center text-zinc-500 mb-4 border border-zinc-800">
              <FolderOpen size={32} className="text-[#f5c518]/70" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              {localSearch || filterStatus !== 'all' ? 'No movies match your filters' : 'Your list is empty'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-5 leading-relaxed">
              {localSearch || filterStatus !== 'all'
                ? 'Try adjusting your status tab or clearing search term.'
                : `No movies in "${listName}" yet. Search for movies from TMDB to start tracking.`}
            </p>
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#f5c518] hover:bg-[#e2b616] text-black font-extrabold text-xs rounded-xl shadow-lg transition-transform active:scale-95"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Search and add your first movie</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredItems.map((item) => {
              const movie = item.movie || {};
              const isSelected = selectedItemId === item.id;
              const year = movie.release_date ? movie.release_date.substring(0, 4) : '';
              const rating = item.user_rating || (movie.vote_average ? Number(movie.vote_average).toFixed(1) : null);
              const statusBadge = STATUS_BADGES[item.status] || STATUS_BADGES.plan_to_watch;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className={`group relative flex flex-col bg-[#1a1a1a] rounded-xl overflow-hidden border transition-all cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1 ${
                    isSelected
                      ? 'border-[#f5c518] ring-2 ring-[#f5c518]/30 shadow-[#f5c518]/10'
                      : 'border-[#292929] hover:border-[#444444] hover:bg-[#202020]'
                  }`}
                >
                  {/* Poster Image Container */}
                  <div className="relative aspect-[2/3] w-full bg-[#202020] overflow-hidden">
                    {movie.poster_path ? (
                      <img
                        src={movie.poster_path}
                        alt={movie.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://via.placeholder.com/300x450/1c1c1c/888888?text=No+Poster';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                        <Film size={36} />
                        <span className="text-[11px] mt-2 font-semibold text-zinc-500">No Poster</span>
                      </div>
                    )}

                    {/* Gradient Overlay for badges */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                    {/* Top IMDb Rating Pill */}
                    {rating && (
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-yellow-500/40 shadow-sm">
                        <Star size={12} className="text-[#f5c518] fill-[#f5c518]" />
                        <span className="text-xs font-extrabold text-white">{rating}</span>
                      </div>
                    )}

                    {/* Watch Status Pill on bottom of poster */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border backdrop-blur-md ${statusBadge.bg}`}
                      >
                        {statusBadge.label}
                      </span>

                      {item.user_rating && (
                        <span className="text-[10px] font-extrabold bg-[#f5c518] text-black px-1.5 py-0.5 rounded shadow">
                          ★ {item.user_rating}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Movie Info */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white group-hover:text-[#f5c518] transition-colors truncate">
                        {movie.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                        {year && <span>{year}</span>}
                        {movie.runtime > 0 && (
                          <>
                            <span>•</span>
                            <span>{movie.runtime}m</span>
                          </>
                        )}
                      </div>
                    </div>

                    {item.user_notes && (
                      <p className="mt-2 text-[10px] text-zinc-500 italic line-clamp-1 border-t border-zinc-800 pt-1.5">
                        "{item.user_notes}"
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
