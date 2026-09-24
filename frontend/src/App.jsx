import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import MovieList from './components/MovieList';
import MovieDetailPage from './components/MovieDetailPage';
import MovieSearchModal from './components/MovieSearchModal';
import RecommendationModal from './components/RecommendationModal';
import ChatModal from './components/ChatModal';
import NewListModal from './components/NewListModal';
import ActivityRail from './components/ActivityRail';
import SettingsModal, { DEFAULT_SHORTCUTS } from './components/SettingsModal';
import {
  getLists,
  createList,
  updateList,
  reorderLists,
  deleteList,
  getListMovies,
  addMovieToList,
  updateListItem,
  removeListItem,
  seedSampleData,
} from './api/client';

import { AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function App() {
  // Sidebar open/collapse state (default open)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Keyboard shortcuts state (persisted to localStorage)
  const [shortcuts, setShortcuts] = useState(() => {
    try {
      const saved = localStorage.getItem('cinetrack_shortcuts');
      return saved ? { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) } : DEFAULT_SHORTCUTS;
    } catch (e) {
      return DEFAULT_SHORTCUTS;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Lists & active navigation state
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState('all'); // 'all', 'plan_to_watch', 'watching', 'completed', or list.id
  const [allMovies, setAllMovies] = useState([]);

  // View mode: 'list' or 'movie-detail'
  const [viewMode, setViewMode] = useState('list');
  const [selectedItem, setSelectedItem] = useState(null);

  // Card size: 'small', 'medium', 'large', 'extra-large'
  const [cardSize, setCardSize] = useState('medium');

  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNewListOpen, setIsNewListOpen] = useState(false);
  const [isRecommendOpen, setIsRecommendOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Loading & Network state
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [backendError, setBackendError] = useState(null);

  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleSaveShortcuts = (newShortcuts) => {
    setShortcuts(newShortcuts);
    try {
      localStorage.setItem('cinetrack_shortcuts', JSON.stringify(newShortcuts));
    } catch (e) {
      console.error('Failed to save shortcuts:', e);
    }
    showToast('Keybindings updated!', 'success');
  };

  const handleResetShortcuts = () => {
    setShortcuts(DEFAULT_SHORTCUTS);
    try {
      localStorage.removeItem('cinetrack_shortcuts');
    } catch (e) {
      console.error('Failed to reset shortcuts:', e);
    }
    showToast('Keybindings reset to default', 'info');
  };

  // Helper to identify standard core lists
  const isCoreList = (name) =>
    ['plan to watch', 'watching', 'completed'].includes((name || '').toLowerCase().trim());

  // 1. Fetch all lists
  const fetchLists = useCallback(async () => {
    try {
      setIsLoadingLists(true);
      setBackendError(null);
      const data = await getLists();
      const listData = Array.isArray(data) ? data : [];
      setLists(listData);

      // If no lists exist, try auto-seeding once
      if (listData.length === 0) {
        try {
          const seeded = await seedSampleData();
          if (seeded && seeded.lists) {
            setLists(seeded.lists);
          }
        } catch (seedErr) {
          console.warn('Auto-seed attempt:', seedErr);
        }
      }
    } catch (err) {
      console.error('Error fetching lists:', err);
      setBackendError(
        err.isOffline
          ? 'Backend server is unreachable at http://localhost:8000. Please ensure Django is running.'
          : err.message
      );
    } finally {
      setIsLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // 2. Fetch all movies across all lists
  const fetchAllMovies = useCallback(async () => {
    if (backendError && lists.length === 0) return;

    try {
      setIsLoadingMovies(true);
      const all = [];
      const seenItemIds = new Set();

      for (const list of lists) {
        try {
          const items = await getListMovies(list.id);
          if (Array.isArray(items)) {
            for (const item of items) {
              if (!seenItemIds.has(item.id)) {
                seenItemIds.add(item.id);
                all.push(item);
              }
            }
          }
        } catch (e) {
          console.warn(`Could not load movies for list ${list.id}:`, e);
        }
      }
      setAllMovies(all);
    } catch (err) {
      console.error('Error fetching movies:', err);
      showToast('Could not load movies', 'error');
    } finally {
      setIsLoadingMovies(false);
    }
  }, [lists, backendError]);

  useEffect(() => {
    if (lists.length > 0) {
      fetchAllMovies();
    }
  }, [lists, fetchAllMovies]);

  // Keep selectedItem in sync if allMovies updates
  useEffect(() => {
    if (selectedItem) {
      const updated = allMovies.find((item) => item.id === selectedItem.id);
      if (updated) {
        setSelectedItem(updated);
      }
    }
  }, [allMovies, selectedItem]);

  // Accurate movie counts for each status across all unique movies
  const statusCounts = useMemo(() => {
    const counts = { plan_to_watch: 0, watching: 0, completed: 0 };
    const seen = new Set();
    for (const item of allMovies) {
      const mId = item.movie?.tmdb_id || item.movie?.id || item.id;
      if (!seen.has(mId)) {
        seen.add(mId);
        if (item.status === 'plan_to_watch') counts.plan_to_watch++;
        else if (item.status === 'watching') counts.watching++;
        else if (item.status === 'completed') counts.completed++;
      }
    }
    return counts;
  }, [allMovies]);

  // Total unique movies count across all lists
  const totalAllCount = useMemo(() => {
    const seen = new Set();
    for (const item of allMovies) {
      const mId = item.movie?.tmdb_id || item.movie?.id || item.id;
      seen.add(mId);
    }
    return seen.size;
  }, [allMovies]);

  // Filtered movies to display based on activeListId (All, Status, or Custom List)
  const displayedMovies = useMemo(() => {
    if (activeListId === 'all') {
      const seen = new Set();
      const result = [];
      for (const item of allMovies) {
        const mId = item.movie?.tmdb_id || item.movie?.id || item.id;
        if (!seen.has(mId)) {
          seen.add(mId);
          result.push(item);
        }
      }
      return result;
    }

    if (activeListId === 'plan_to_watch') {
      const seen = new Set();
      const result = [];
      for (const item of allMovies) {
        if (item.status === 'plan_to_watch') {
          const mId = item.movie?.tmdb_id || item.movie?.id || item.id;
          if (!seen.has(mId)) {
            seen.add(mId);
            result.push(item);
          }
        }
      }
      return result;
    }

    if (activeListId === 'watching') {
      const seen = new Set();
      const result = [];
      for (const item of allMovies) {
        if (item.status === 'watching') {
          const mId = item.movie?.tmdb_id || item.movie?.id || item.id;
          if (!seen.has(mId)) {
            seen.add(mId);
            result.push(item);
          }
        }
      }
      return result;
    }

    if (activeListId === 'completed') {
      const seen = new Set();
      const result = [];
      for (const item of allMovies) {
        if (item.status === 'completed') {
          const mId = item.movie?.tmdb_id || item.movie?.id || item.id;
          if (!seen.has(mId)) {
            seen.add(mId);
            result.push(item);
          }
        }
      }
      return result;
    }

    // Custom list by ID
    return allMovies.filter(
      (item) => item.list === Number(activeListId) || item.list === activeListId
    );
  }, [activeListId, allMovies]);

  // Current active list metadata
  const currentListObj = useMemo(() => {
    if (activeListId === 'all') {
      return { id: 'all', name: 'All Movies', color: '#f5c518' };
    }
    if (activeListId === 'plan_to_watch') {
      return { id: 'plan_to_watch', name: 'Plan to Watch', color: '#3b82f6' };
    }
    if (activeListId === 'watching') {
      return { id: 'watching', name: 'Watching', color: '#f59e0b' };
    }
    if (activeListId === 'completed') {
      return { id: 'completed', name: 'Completed', color: '#10b981' };
    }
    const found = lists.find(
      (l) => l.id === activeListId || l.id === Number(activeListId)
    );
    return found || { id: activeListId, name: 'Movies', color: '#f5c518' };
  }, [activeListId, lists]);

  // 3. Create List Handler
  const handleCreateList = async (listData) => {
    const newList = await createList(listData);
    setLists((prev) => [...prev, newList]);
    setActiveListId(newList.id);
    setViewMode('list');
    showToast(`List "${newList.name}" created!`, 'success');
  };

  // 4. Reorder Custom Lists Handler (Drag & Drop)
  const handleReorderCustomLists = async (newCustomLists) => {
    const standardLists = lists.filter((l) => isCoreList(l.name));
    const newAllLists = [...standardLists, ...newCustomLists];
    setLists(newAllLists);

    try {
      const orderedIds = newAllLists.map((l) => l.id);
      await reorderLists(orderedIds);
    } catch (err) {
      console.error('Failed to save list order:', err);
      showToast('Failed to save list order', 'error');
      fetchLists();
    }
  };

  // Up / Down fallback helpers
  const handleMoveListUp = async (listId) => {
    const standardLists = lists.filter((l) => isCoreList(l.name));
    const customLists = lists.filter((l) => !isCoreList(l.name));

    const idx = customLists.findIndex((l) => l.id === listId);
    if (idx <= 0) return;

    const updatedCustom = [...customLists];
    const [moved] = updatedCustom.splice(idx, 1);
    updatedCustom.splice(idx - 1, 0, moved);

    const newAllLists = [...standardLists, ...updatedCustom];
    setLists(newAllLists);

    try {
      const orderedIds = newAllLists.map((l) => l.id);
      await reorderLists(orderedIds);
    } catch (err) {
      console.error('Failed to save list order:', err);
      showToast('Failed to save list order', 'error');
      fetchLists();
    }
  };

  const handleMoveListDown = async (listId) => {
    const standardLists = lists.filter((l) => isCoreList(l.name));
    const customLists = lists.filter((l) => !isCoreList(l.name));

    const idx = customLists.findIndex((l) => l.id === listId);
    if (idx === -1 || idx >= customLists.length - 1) return;

    const updatedCustom = [...customLists];
    const [moved] = updatedCustom.splice(idx, 1);
    updatedCustom.splice(idx + 1, 0, moved);

    const newAllLists = [...standardLists, ...updatedCustom];
    setLists(newAllLists);

    try {
      const orderedIds = newAllLists.map((l) => l.id);
      await reorderLists(orderedIds);
    } catch (err) {
      console.error('Failed to save list order:', err);
      showToast('Failed to save list order', 'error');
      fetchLists();
    }
  };

  // 5. Delete List Handler
  const handleDeleteList = async (listId) => {
    try {
      await deleteList(listId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      setAllMovies((prev) => prev.filter((item) => item.list !== listId));
      if (activeListId === listId) {
        setActiveListId('all');
      }
      showToast('List deleted', 'info');
    } catch (err) {
      console.error('Failed to delete list:', err);
      showToast(err.message || 'Failed to delete list', 'error');
    }
  };

  // 5b. Toggle Favourite Handler
  const handleToggleFavourite = async (listId, newValue) => {
    // Optimistic update
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, is_favourite: newValue } : l))
    );
    try {
      await updateList(listId, { is_favourite: newValue });
      showToast(newValue ? 'Added to Favourites ★' : 'Removed from Favourites', 'success');
    } catch (err) {
      // Revert on error
      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, is_favourite: !newValue } : l))
      );
      showToast('Failed to update favourite', 'error');
    }
  };


  // 6. Add Movie to List Handler
  const handleAddMovie = async (listId, movieData) => {
    let initialStatus = 'plan_to_watch';
    if (activeListId === 'watching') initialStatus = 'watching';
    if (activeListId === 'completed') initialStatus = 'completed';

    const newItem = await addMovieToList(listId, movieData, initialStatus);
    showToast(`Added "${movieData.title}"!`, 'success');

    // Update list count in sidebar lists
    setLists((prev) =>
      prev.map((l) =>
        l.id === Number(listId) ? { ...l, items_count: (l.items_count || 0) + 1 } : l
      )
    );

    // Refresh movies
    await fetchAllMovies();

    // Open detail view for the newly added movie
    if (newItem) {
      setSelectedItem(newItem);
      setViewMode('movie-detail');
    }
  };

  // 7. Update List Item Handler (status, rating, notes)
  const handleUpdateItem = async (itemId, updates) => {
    try {
      const updated = await updateListItem(itemId, updates);
      setAllMovies((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, ...updated } : item))
      );
      if (selectedItem && selectedItem.id === itemId) {
        setSelectedItem((prev) => ({ ...prev, ...updated }));
      }
    } catch (err) {
      console.error('Failed to update item:', err);
      showToast('Failed to update movie', 'error');
    }
  };

  // 8. Remove List Item Handler
  const handleRemoveItem = async (itemId) => {
    try {
      await removeListItem(itemId);
      setAllMovies((prev) => prev.filter((item) => item.id !== itemId));
      if (selectedItem && selectedItem.id === itemId) {
        setSelectedItem(null);
        setViewMode('list');
      }

      // Decrement list count
      setLists((prev) =>
        prev.map((l) =>
          l.id === activeListId
            ? { ...l, items_count: Math.max(0, (l.items_count || 0) - 1) }
            : l
        )
      );
      showToast('Movie removed from list', 'info');
    } catch (err) {
      console.error('Failed to remove item:', err);
      showToast('Failed to remove movie', 'error');
    }
  };

  // 9. Seed Sample Data Handler
  const handleSeedData = async () => {
    try {
      setIsSeeding(true);
      const res = await seedSampleData();
      if (res.lists) {
        setLists(res.lists);
      } else {
        await fetchLists();
      }
      showToast('Sample movies & lists loaded successfully!', 'success');
      await fetchAllMovies();
    } catch (err) {
      console.error('Seed error:', err);
      showToast(err.message || 'Failed to seed sample data', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const matchesShortcut = (e, shortcutStr) => {
      if (!shortcutStr) return false;
      const parts = shortcutStr.split('+');
      const targetKey = parts[parts.length - 1].toLowerCase();
      const requiresCtrl = parts.includes('Ctrl');
      const requiresAlt = parts.includes('Alt');
      const requiresShift = parts.includes('Shift');
      const requiresCmd = parts.includes('Cmd') || parts.includes('Meta');

      if (requiresCtrl && !e.ctrlKey) return false;
      if (!requiresCtrl && e.ctrlKey && targetKey !== 'control') return false;

      if (requiresAlt && !e.altKey) return false;
      if (!requiresAlt && e.altKey && targetKey !== 'alt') return false;

      if (requiresShift && !e.shiftKey) return false;
      if (!requiresShift && e.shiftKey && targetKey !== 'shift') return false;

      if (requiresCmd && !e.metaKey) return false;

      const eventKey = e.key.toLowerCase();
      if (targetKey === 'space' && eventKey === ' ') return true;
      return eventKey === targetKey;
    };

    const handleKeyDown = (e) => {
      // Escape closes modals or exits detail view
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (isSearchOpen) {
          setIsSearchOpen(false);
          return;
        }
        if (isNewListOpen) {
          setIsNewListOpen(false);
          return;
        }
        if (isRecommendOpen) {
          setIsRecommendOpen(false);
          return;
        }
        if (isChatOpen) {
          setIsChatOpen(false);
          return;
        }
        if (viewMode === 'movie-detail') {
          setViewMode('list');
          setSelectedItem(null);
          return;
        }
      }

      // If user is typing in an input/textarea/select, don't trigger non-Escape shortcuts
      const tag = (e.target?.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isInput) return;

      // Toggle Sidebar (default Alt+B)
      if (matchesShortcut(e, shortcuts.toggleSidebar)) {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
        return;
      }

      // Open Settings (default Ctrl+,)
      if (matchesShortcut(e, shortcuts.settings)) {
        e.preventDefault();
        setIsSettingsOpen(true);
        return;
      }

      // Search Movies / TMDB (default Ctrl+K)
      if (matchesShortcut(e, shortcuts.search)) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Add Movie (default Alt+N)
      if (matchesShortcut(e, shortcuts.addMovie)) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, isSettingsOpen, isSearchOpen, isNewListOpen, isRecommendOpen, isChatOpen, viewMode]);

  // Set of movie IDs in the active list (for search modal to show 'Added')
  const existingMovieIds = useMemo(() => {
    return new Set(
      displayedMovies.map((item) => item.movie?.tmdb_id || item.movie?.id).filter(Boolean)
    );
  }, [displayedMovies]);

  // Every movie anywhere in the library - used to mark recommendations already saved
  const allLibraryMovieIds = useMemo(() => {
    return new Set(
      allMovies.map((item) => item.movie?.tmdb_id || item.movie?.id).filter(Boolean)
    );
  }, [allMovies]);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-void)' }}>
      {/* Activity Rail */}
      <ActivityRail
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        onOpenSettings={() => setIsSettingsOpen(true)}
        shortcuts={shortcuts}
        totalMoviesCount={totalAllCount}
      />

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        lists={lists}
        activeListId={activeListId}
        onSelectList={(id) => {
          setActiveListId(id);
          setViewMode('list');
        }}
        onOpenNewList={() => setIsNewListOpen(true)}
        onReorderCustomLists={handleReorderCustomLists}
        onDeleteList={handleDeleteList}
        onToggleFavourite={handleToggleFavourite}
        totalAllMoviesCount={totalAllCount}
        statusCounts={statusCounts}
      />


      {/* Main */}
      {viewMode === 'movie-detail' && selectedItem ? (
        <MovieDetailPage
          item={selectedItem}
          onBack={() => { setViewMode('list'); setSelectedItem(null); }}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
        />
      ) : (
        <MovieList
          currentList={currentListObj}
          items={displayedMovies}
          selectedItemId={selectedItem?.id}
          onSelectItem={(item) => { setSelectedItem(item); setViewMode('movie-detail'); }}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenRecommendations={() => setIsRecommendOpen(true)}
          onOpenChat={() => setIsChatOpen(true)}
          isLoading={isLoadingMovies}
          cardSize={cardSize}
          onCardSizeChange={setCardSize}
          shortcuts={shortcuts}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        shortcuts={shortcuts}
        onSaveShortcuts={handleSaveShortcuts}
        onResetShortcuts={handleResetShortcuts}
      />

      {/* TMDB Search Modal */}
      <MovieSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentList={currentListObj}
        lists={lists}
        onAddMovie={handleAddMovie}
        existingMovieIds={existingMovieIds}
      />

      {/* Recommendation Modal */}
      <RecommendationModal
        isOpen={isRecommendOpen}
        onClose={() => setIsRecommendOpen(false)}
        lists={lists}
        currentList={currentListObj}
        onAddMovie={handleAddMovie}
        existingMovieIds={allLibraryMovieIds}
      />

      {/* Chat Modal */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        lists={lists}
        currentList={currentListObj}
        onAddMovie={handleAddMovie}
        existingMovieIds={allLibraryMovieIds}
      />

      {/* New List Modal */}
      <NewListModal
        isOpen={isNewListOpen}
        onClose={() => setIsNewListOpen(false)}
        onCreate={handleCreateList}
      />

      {/* Toast */}
      {toastMessage && (
        <div className="toast animate-fade-in">
          {toastMessage.type === 'success'
            ? <CheckCircle2 size={15} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            : <AlertCircle  size={15} style={{ color: 'var(--red)',  flexShrink: 0 }} />}
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* Backend Offline Banner */}
      {backendError && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 rounded-full bg-amber-950/90 border border-amber-600/80 shadow-2xl text-xs font-medium text-amber-200 backdrop-blur-md animate-fade-in">
          <AlertCircle size={15} className="text-amber-400 shrink-0" />
          <span>{backendError}</span>
          <button
            type="button"
            onClick={fetchLists}
            className="flex items-center gap-1 ml-2 px-2.5 py-1 rounded-full bg-amber-800/80 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors"
          >
            <RefreshCw size={11} className={isLoadingLists ? 'animate-spin' : ''} />
            <span>Retry</span>
          </button>
        </div>
      )}
    </div>
  );
}
