import React from 'react';
import {
  Film,
  Bookmark,
  Heart,
  Plus,
  Compass,
  Sparkles,
  Database,
  Tv,
  List
} from 'lucide-react';

export default function Sidebar({
  lists = [],
  activeListId,
  onSelectList,
  onOpenNewList,
  onSeedData,
  isSeeding,
  totalAllMoviesCount = 0,
}) {
  // Built-in lists identification
  const watchlist = lists.find((l) => l.name.toLowerCase() === 'watchlist');
  const favorites = lists.find((l) => l.name.toLowerCase() === 'favorites');
  const customLists = lists.filter(
    (l) => l.name.toLowerCase() !== 'watchlist' && l.name.toLowerCase() !== 'favorites'
  );

  return (
    <aside className="w-64 bg-[#181818] border-r border-[#262626] flex flex-col h-full select-none">
      {/* App Branding */}
      <div className="p-4 border-b border-[#262626] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-[#f5c518] text-black font-extrabold text-sm px-2 py-1 rounded tracking-tighter uppercase shadow-sm">
            IMDb
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              CINETRACK
            </span>
            <span className="text-[10px] text-zinc-400">Movie Hub & Tracker</span>
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
        {/* Quick Built-in Navigation */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Navigation
          </div>
          <nav className="space-y-1">
            {/* All Movies virtual view */}
            <button
              onClick={() => onSelectList('all')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeListId === 'all'
                  ? 'bg-[#f5c518]/15 text-[#f5c518] border-l-2 border-[#f5c518]'
                  : 'text-zinc-300 hover:bg-[#222222] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Film size={16} className={activeListId === 'all' ? 'text-[#f5c518]' : 'text-zinc-400'} />
                <span>All Movies</span>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                  activeListId === 'all' ? 'bg-[#f5c518] text-black' : 'bg-[#282828] text-zinc-400'
                }`}
              >
                {totalAllMoviesCount}
              </span>
            </button>

            {/* Watchlist */}
            {watchlist && (
              <button
                onClick={() => onSelectList(watchlist.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeListId === watchlist.id
                    ? 'bg-[#f5c518]/15 text-[#f5c518] border-l-2 border-[#f5c518]'
                    : 'text-zinc-300 hover:bg-[#222222] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Bookmark
                    size={16}
                    className={activeListId === watchlist.id ? 'text-[#f5c518]' : 'text-zinc-400'}
                  />
                  <span>Watchlist</span>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    activeListId === watchlist.id ? 'bg-[#f5c518] text-black' : 'bg-[#282828] text-zinc-400'
                  }`}
                >
                  {watchlist.items_count || 0}
                </span>
              </button>
            )}

            {/* Favorites */}
            {favorites && (
              <button
                onClick={() => onSelectList(favorites.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeListId === favorites.id
                    ? 'bg-[#f5c518]/15 text-[#f5c518] border-l-2 border-[#f5c518]'
                    : 'text-zinc-300 hover:bg-[#222222] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Heart
                    size={16}
                    className={activeListId === favorites.id ? 'text-[#f5c518]' : 'text-red-400'}
                  />
                  <span>Favorites</span>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    activeListId === favorites.id ? 'bg-[#f5c518] text-black' : 'bg-[#282828] text-zinc-400'
                  }`}
                >
                  {favorites.items_count || 0}
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Custom Categories / Lists */}
        <div>
          <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <span>Lists & Genres</span>
            <button
              onClick={onOpenNewList}
              title="Create new list"
              className="text-zinc-400 hover:text-[#f5c518] hover:bg-[#282828] p-1 rounded transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-1">
            {customLists.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500 italic">No custom lists yet</div>
            ) : (
              customLists.map((list) => {
                const isActive = activeListId === list.id;
                return (
                  <button
                    key={list.id}
                    onClick={() => onSelectList(list.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#252525] text-white border-l-2'
                        : 'text-zinc-300 hover:bg-[#222222] hover:text-white'
                    }`}
                    style={isActive ? { borderLeftColor: list.color || '#f5c518' } : {}}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: list.color || '#f5c518' }}
                      />
                      <span className="truncate">{list.name}</span>
                    </div>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                        isActive ? 'bg-zinc-700 text-white' : 'bg-[#282828] text-zinc-400'
                      }`}
                    >
                      {list.items_count || 0}
                    </span>
                  </button>
                );
              })
            )}

            {/* Quick Inline New List Button */}
            <button
              onClick={onOpenNewList}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-[#222222] transition-colors border border-dashed border-[#333333] mt-2"
            >
              <Plus size={14} className="text-[#f5c518]" />
              <span>+ New List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer / Database Seed Quick Action */}
      <div className="p-3 border-t border-[#262626] bg-[#141414]">
        <button
          onClick={onSeedData}
          disabled={isSeeding}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[#222222] hover:bg-[#2a2a2a] text-zinc-300 hover:text-[#f5c518] transition-colors border border-[#333333] disabled:opacity-50"
        >
          <Database size={13} className="text-[#f5c518]" />
          <span>{isSeeding ? 'Seeding...' : 'Seed Sample Data'}</span>
        </button>
      </div>
    </aside>
  );
}
