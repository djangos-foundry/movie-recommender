import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MovieList from './components/MovieList';
import MovieDetail from './components/MovieDetail';
import MovieSearchModal from './components/MovieSearchModal';
import NewListModal from './components/NewListModal';
import {
  getLists,
  createList,
  getListMovies,
  addMovieToList,
  updateListItem,
  removeListItem,
  seedSampleData,
} from './api/client';
import { AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function App() {
  // Lists & active navigation state
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState('all'); // 'all' or list.id
  const [currentMovies, setCurrentMovies] = useState([]);

  // Selected item for right detail panel
  const [selectedItem, setSelectedItem] = useState(null);

  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNewListOpen, setIsNewListOpen] = useState(false);

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

  // 2. Fetch movies for active list or aggregate for 'all'
  const fetchMovies = useCallback(async () => {
    if (backendError && lists.length === 0) return;

    try {
      setIsLoadingMovies(true);
      if (activeListId === 'all') {
        // Aggregate movies from all lists
        const allItems = [];
        const seenMovieIds = new Set();

        for (const list of lists) {
          try {
            const items = await getListMovies(list.id);
            if (Array.isArray(items)) {
              for (const item of items) {
                if (!seenMovieIds.has(item.movie?.id || item.id)) {
                  seenMovieIds.add(item.movie?.id || item.id);
                  allItems.push(item);
                }
              }
            }
          } catch (e) {
            console.warn(`Could not load movies for list ${list.id}:`, e);
          }
        }
        setCurrentMovies(allItems);
      } else {
        const items = await getListMovies(activeListId);
        setCurrentMovies(Array.isArray(items) ? items : []);
      }
    } catch (err) {
      console.error('Error fetching movies:', err);
      showToast('Could not load movies for this list', 'error');
    } finally {
      setIsLoadingMovies(false);
    }
  }, [activeListId, lists, backendError]);

  useEffect(() => {
    if (lists.length > 0 || activeListId === 'all') {
      fetchMovies();
    }
  }, [activeListId, lists, fetchMovies]);

  // Keep selectedItem in sync if currentMovies updates
  useEffect(() => {
    if (selectedItem) {
      const updated = currentMovies.find((item) => item.id === selectedItem.id);
      if (updated) {
        setSelectedItem(updated);
      }
    }
  }, [currentMovies]);

  // 3. Create List Handler
  const handleCreateList = async (listData) => {
    const newList = await createList(listData);
    setLists((prev) => [...prev, newList]);
    setActiveListId(newList.id);
    showToast(`List "${newList.name}" created!`, 'success');
  };

  // 4. Add Movie to List Handler
  const handleAddMovie = async (listId, movieData) => {
    const newItem = await addMovieToList(listId, movieData);
    showToast(`Added "${movieData.title}"!`, 'success');

    // Update list count in sidebar lists
    setLists((prev) =>
      prev.map((l) =>
        l.id === Number(listId)
          ? { ...l, items_count: (l.items_count || 0) + 1 }
          : l
      )
    );

    // Refresh current list movies
    await fetchMovies();

    // Automatically select the newly added movie to view its detail
    if (newItem) {
      setSelectedItem(newItem);
    }
  };

  // 5. Update List Item Handler (status, rating, notes)
  const handleUpdateItem = async (itemId, updates) => {
    const updated = await updateListItem(itemId, updates);
    setCurrentMovies((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updated } : item))
    );
    if (selectedItem && selectedItem.id === itemId) {
      setSelectedItem((prev) => ({ ...prev, ...updated }));
    }
  };

  // 6. Remove List Item Handler
  const handleRemoveItem = async (itemId) => {
    await removeListItem(itemId);
    setCurrentMovies((prev) => prev.filter((item) => item.id !== itemId));
    if (selectedItem && selectedItem.id === itemId) {
      setSelectedItem(null);
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
  };

  // 7. Seed Sample Data Handler
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
      await fetchMovies();
    } catch (err) {
      console.error('Seed error:', err);
      showToast(err.message || 'Failed to seed sample data', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  // Keyboard shortcut: Ctrl+K / Cmd+K to open search, Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        if (isSearchOpen) setIsSearchOpen(false);
        else if (isNewListOpen) setIsNewListOpen(false);
        else if (selectedItem) setSelectedItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, isNewListOpen, selectedItem]);

  // Current active list object
  const currentListObj =
    activeListId === 'all'
      ? { id: 'all', name: 'All Movies', color: '#f5c518' }
      : lists.find((l) => l.id === activeListId) || { id: activeListId, name: 'Movies', color: '#f5c518' };

  // Total count across all lists
  const totalAllCount = lists.reduce((acc, l) => acc + (l.items_count || 0), 0);

  // Set of movie IDs in the active list
  const existingMovieIds = new Set(
    currentMovies.map((item) => item.movie?.tmdb_id || item.movie?.id).filter(Boolean)
  );

  return (
    <div className="flex h-screen w-screen bg-[#121212] text-white overflow-hidden select-none">
      {/* 1. Left Column: Sidebar */}
      <Sidebar
        lists={lists}
        activeListId={activeListId}
        onSelectList={(id) => {
          setActiveListId(id);
          // Keep detail drawer open if desired or clear
        }}
        onOpenNewList={() => setIsNewListOpen(true)}
        onSeedData={handleSeedData}
        isSeeding={isSeeding}
        totalAllMoviesCount={totalAllCount}
      />

      {/* 2. Middle Column: Movie List */}
      <MovieList
        currentList={currentListObj}
        items={currentMovies}
        selectedItemId={selectedItem?.id}
        onSelectItem={(item) => setSelectedItem(item)}
        onOpenSearch={() => setIsSearchOpen(true)}
        isLoading={isLoadingMovies}
      />

      {/* 3. Right Column: Movie Detail Drawer */}
      {selectedItem && (
        <MovieDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
        />
      )}

      {/* TMDB Search Modal */}
      <MovieSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentList={currentListObj}
        lists={lists}
        onAddMovie={handleAddMovie}
        existingMovieIds={existingMovieIds}
      />

      {/* New List Modal */}
      <NewListModal
        isOpen={isNewListOpen}
        onClose={() => setIsNewListOpen(false)}
        onCreate={handleCreateList}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#1f1f1f] border border-[#333333] shadow-2xl text-xs font-semibold text-white animate-fade-in">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 size={16} className="text-[#f5c518]" />
          ) : (
            <AlertCircle size={16} className="text-red-400" />
          )}
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* Backend Offline Banner */}
      {backendError && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 rounded-full bg-amber-950/90 border border-amber-600/80 shadow-2xl text-xs font-medium text-amber-200 backdrop-blur-md animate-fade-in">
          <AlertCircle size={15} className="text-amber-400 shrink-0" />
          <span>{backendError}</span>
          <button
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
