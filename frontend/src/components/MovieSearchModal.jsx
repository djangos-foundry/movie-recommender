import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Star, Plus, Check, Loader2, Film } from 'lucide-react';
import { searchTMDB } from '../api/client';

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

  // Sync targetListId when currentList changes
  useEffect(() => {
    if (currentList && currentList.id !== 'all') {
      setTargetListId(currentList.id);
    } else if (lists.length > 0) {
      const defaultList = lists.find((l) => l.name.toLowerCase() === 'watchlist') || lists[0];
      setTargetListId(defaultList.id);
    }
  }, [currentList, lists]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setResults([]);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError('');
        const data = await searchTMDB(query);
        setResults(data.results || []);
      } catch (err) {
        setError(err.message || 'Search failed. Backend may still be starting.');
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const handleAdd = async (movie) => {
    const listId = targetListId || (lists[0] && lists[0].id);
    if (!listId) {
      setError('Please select a list first');
      return;
    }

    try {
      setAddingId(movie.id);
      setError('');
      await onAddMovie(listId, movie);
      setAddedIds((prev) => new Set([...prev, movie.id]));
    } catch (err) {
      setError(err.message || 'Failed to add movie');
    } finally {
      setAddingId(null);
    }
  };

  const getReleaseYear = (dateStr) => {
    if (!dateStr) return '';
    return dateStr.substring(0, 4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[#1c1c1c] border border-[#333333] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header & Search Bar */}
        <div className="p-4 border-b border-[#2d2d2d] bg-[#181818]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="bg-[#f5c518] text-black font-extrabold text-xs px-2 py-0.5 rounded tracking-wider">
                SEARCH
              </span>
              <h3 className="text-base font-bold text-white">Find Movies from TMDB</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type movie title (e.g. Interstellar, Inception, Dune)..."
                className="w-full bg-[#121212] border border-[#333333] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#f5c518] transition-colors"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Target List Selector */}
            <div className="shrink-0 flex items-center gap-1.5">
              <label className="text-xs text-zinc-400 font-medium">Add to:</label>
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="bg-[#121212] border border-[#333333] text-white text-xs font-semibold rounded-lg px-2.5 py-2.5 focus:outline-none focus:border-[#f5c518]"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/50 text-red-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-white text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 gap-3">
              <Loader2 size={28} className="animate-spin text-[#f5c518]" />
              <span className="text-xs">Searching movies...</span>
            </div>
          )}

          {!isLoading && query && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 gap-2">
              <Film size={32} className="text-zinc-600" />
              <span className="text-sm font-medium text-zinc-300">No movies found for "{query}"</span>
              <span className="text-xs text-zinc-500">Try searching another title</span>
            </div>
          )}

          {!isLoading && !query && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
              <Search size={32} className="text-zinc-600" />
              <span className="text-sm font-medium text-zinc-400">Search TMDB database</span>
              <span className="text-xs text-zinc-500">
                Type above to search millions of movies and add them directly to your lists
              </span>
            </div>
          )}

          {!isLoading &&
            results.map((movie) => {
              const year = getReleaseYear(movie.release_date);
              const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : null;
              const isAlreadyAdded = existingMovieIds.has(movie.id) || addedIds.has(movie.id);
              const isAdding = addingId === movie.id;

              return (
                <div
                  key={movie.id}
                  className="flex items-center gap-3.5 p-3 rounded-xl bg-[#222222] border border-[#2e2e2e] hover:border-[#404040] hover:bg-[#262626] transition-all"
                >
                  {/* Poster Thumbnail */}
                  <div className="w-14 h-20 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-zinc-700/50 flex items-center justify-center shadow">
                    {movie.poster_path ? (
                      <img
                        src={movie.poster_path}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://via.placeholder.com/150x225/1f1f1f/777777?text=No+Poster';
                        }}
                      />
                    ) : (
                      <Film size={20} className="text-zinc-600" />
                    )}
                  </div>

                  {/* Movie Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white truncate max-w-[320px]">
                        {movie.title}
                      </h4>
                      {year && (
                        <span className="text-xs text-zinc-400 font-medium shrink-0">({year})</span>
                      )}
                    </div>

                    {rating && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex items-center gap-1 bg-[#121212] px-2 py-0.5 rounded-full border border-zinc-700/60">
                          <Star size={12} className="text-[#f5c518] fill-[#f5c518]" />
                          <span className="text-xs font-bold text-white">{rating}</span>
                          <span className="text-[10px] text-zinc-400">/10</span>
                        </div>
                      </div>
                    )}

                    {movie.overview && (
                      <p className="text-xs text-zinc-400 line-clamp-2 mt-1.5 leading-relaxed">
                        {movie.overview}
                      </p>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="shrink-0">
                    {isAlreadyAdded ? (
                      <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-950/40 border border-green-800/60 text-green-400 text-xs font-semibold">
                        <Check size={14} />
                        <span>Added</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAdd(movie)}
                        disabled={isAdding}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#f5c518] hover:bg-[#e2b616] text-black text-xs font-bold transition-transform active:scale-95 shadow disabled:opacity-50"
                      >
                        {isAdding ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Plus size={14} />
                        )}
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#2d2d2d] bg-[#161616] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
