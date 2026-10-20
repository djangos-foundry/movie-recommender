import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import MovieList from './components/MovieList';
import MovieDetailPage from './components/MovieDetailPage';
import MovieSearchModal from './components/MovieSearchModal';
import Discover from './components/Discover';
import Schedule from './components/Schedule';
import NewListModal from './components/NewListModal';
import AuthModal from './components/AuthModal';
import TrashPage from './components/TrashPage';
import ActivityRail from './components/ActivityRail';
import SettingsModal from './components/SettingsModal';
import MobileTabBar from './components/MobileTabBar';
import MobileMore from './components/MobileMore';
import useIsMobile from './lib/useIsMobile';
import './mobile.css';
import { DEFAULT_SHORTCUTS, matchesShortcut, loadShortcuts, isBareKey, isTypingTarget } from './lib/shortcuts';
import { itemKey, titleKey } from './lib/media';
import { loadPrefs, savePrefs, applyAccent, applyTheme, resolveTheme, watchSystemTheme } from './lib/prefs';
import {
  getLists,
  createList,
  updateList,
  reorderLists,
  deleteList,
  getLibraryMovies,
  addMovieToList,
  updateListItem,
  setItemLists,
  removeListItem,
  getTMDBMovie,
  getMe,
  loginWithGoogle,
  logout,
  getCalendarStatus,
  connectCalendar,
  disconnectCalendar,
  restoreTrashEntry,
} from './api/client';
import { requestCalendarCode, browserTimeZone } from './lib/googleCalendar';

import { AlertCircle, RefreshCw, CheckCircle2, Trash2 } from 'lucide-react';

// Library poster-size shortcuts → the cardSize preference
const CARD_SIZE_SHORTCUTS = [
  { action: 'cardSmall', id: 'small', label: 'Small' },
  { action: 'cardMedium', id: 'medium', label: 'Medium' },
  { action: 'cardLarge', id: 'large', label: 'Large' },
  { action: 'cardExtraLarge', id: 'extra-large', label: 'Extra large' },
];

export default function App() {
  // Sidebar open/collapse state (default open)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Keyboard shortcuts state (persisted to localStorage)
  const [shortcuts, setShortcuts] = useState(() => {
    try {
      const saved = localStorage.getItem('cinetrack_shortcuts');
      return loadShortcuts(saved ? JSON.parse(saved) : null);
    } catch (e) {
      return DEFAULT_SHORTCUTS;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // The Library list's own search box, focused by the "Search this list" shortcut
  const librarySearchRef = React.useRef(null);

  // Lists & active navigation state
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState('all'); // 'all', 'plan_to_watch', 'watching', 'completed', or list.id
  const [allMovies, setAllMovies] = useState([]);

  // View mode: 'list', 'movie-detail' (a saved movie) or 'movie-preview' (a web pick not in the library)
  const [viewMode, setViewMode] = useState('list');
  const [selectedItem, setSelectedItem] = useState(null);
  const [previewMovie, setPreviewMovie] = useState(null);

  // Which section of the app is showing: 'library' or 'discover'
  const [activeSection, setActiveSection] = useState('library');

  // User preferences (accent, Discover defaults, poster size), persisted to localStorage
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => { savePrefs(prefs); }, [prefs]);
  // Theme: Dark (default), Light, or System (follows the OS, live)
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(prefs.theme));
  useEffect(() => {
    setResolvedTheme(resolveTheme(prefs.theme));
    if (prefs.theme !== 'system') return undefined;
    return watchSystemTheme(() => setResolvedTheme(resolveTheme('system')));
  }, [prefs.theme]);
  useEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);
  useEffect(() => { applyAccent(prefs.accent, resolvedTheme); }, [prefs.accent, resolvedTheme]);
  const handlePrefsChange = useCallback((patch) => setPrefs((prev) => ({ ...prev, ...patch })), []);

  // Bumped by Settings to ask Discover to wipe its round history
  const [clearDiscoverSignal, setClearDiscoverSignal] = useState(0);

  // Modals
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNewListOpen, setIsNewListOpen] = useState(false);

  // Loading & Network state
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [backendError, setBackendError] = useState(null);

  // `action` adds a button to the toast, e.g. { label: 'Undo', onClick }. A newer toast replaces
  // the current one and restarts the timer, so an old timer never clears a fresh toast early.
  const toastTimerRef = React.useRef(null);
  const showToast = (message, type = 'info', action = null) => {
    clearTimeout(toastTimerRef.current);
    setToastMessage({ message, type, action });
    toastTimerRef.current = setTimeout(() => setToastMessage(null), action ? 6000 : 4000);
  };
  const dismissToast = () => {
    clearTimeout(toastTimerRef.current);
    setToastMessage(null);
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  // Phone width: side panels become drawers over the content, one at a time ('left' | 'right' | null)
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState(null);
  const toggleMobilePanel = useCallback((side) => setMobilePanel((prev) => (prev === side ? null : side)), []);
  const closeMobilePanel = useCallback(() => setMobilePanel(null), []);
  const isLeftPanelOpen = isMobile ? mobilePanel === 'left' : isSidebarOpen;
  const toggleLeftPanel = isMobile ? () => toggleMobilePanel('left') : handleToggleSidebar;

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

  // Who is signed in (null = guest). Guests can use the app; signing in with
  // Google keeps their lists on the account.
  const [authUser, setAuthUser] = useState(null);
  const [googleClientId, setGoogleClientId] = useState('');
  useEffect(() => {
    getMe()
      .then((me) => {
        setAuthUser(me.user);
        setGoogleClientId(me.google_client_id || '');
      })
      .catch((err) => console.warn('Could not load account:', err));
  }, []);

  // Reload afterwards so every screen refetches data for the new account.
  const handleGoogleCredential = useCallback(async (credential) => {
    try {
      await loginWithGoogle(credential);
      window.location.reload();
    } catch (err) {
      showToast(err.message || 'Google sign-in failed', 'error');
    }
  }, []);

  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
      window.location.reload();
    } catch (err) {
      showToast(err.message || 'Sign out failed', 'error');
    }
  }, []);

  // Google Calendar sync: only meaningful for a signed-in Google account
  const [calendar, setCalendar] = useState(null);
  const [isCalendarBusy, setIsCalendarBusy] = useState(false);
  useEffect(() => {
    if (!authUser) { setCalendar(null); return; }
    getCalendarStatus().then(setCalendar).catch((err) => console.warn('Could not load calendar status:', err));
  }, [authUser]);

  const handleConnectCalendar = async () => {
    if (isCalendarBusy || !googleClientId) return;
    setIsCalendarBusy(true);
    try {
      // requestCalendarCode must be called straight from the click (popup rule)
      const code = await requestCalendarCode(googleClientId, authUser?.email);
      const result = await connectCalendar(code, browserTimeZone());
      setCalendar(result);
      showToast(
        result.synced
          ? `Google Calendar connected. ${result.synced} upcoming ${result.synced === 1 ? 'watch' : 'watches'} added.`
          : 'Google Calendar connected. New watches will appear in it.',
        'success',
      );
    } catch (err) {
      showToast(err.message || 'Could not connect Google Calendar', 'error');
    } finally {
      setIsCalendarBusy(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      setCalendar(await disconnectCalendar(false));
      showToast('Google Calendar disconnected. Existing events stay in Google.', 'info');
    } catch (err) {
      showToast(err.message || 'Could not disconnect', 'error');
    }
  };

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // 2. Fetch all movies: every list plus the hidden Library, in one request
  const fetchAllMovies = useCallback(async () => {
    if (backendError && lists.length === 0) return;

    try {
      setIsLoadingMovies(true);
      const items = await getLibraryMovies();
      setAllMovies(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Error fetching movies:', err);
      showToast('Could not load movies', 'error');
    } finally {
      setIsLoadingMovies(false);
    }
  }, [lists, backendError]);

  // Re-runs whenever the lists change (a list deleted or restored changes
  // what All Movies contains), and works with zero lists too.
  useEffect(() => {
    fetchAllMovies();
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
      const mId = itemKey(item);
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
      const mId = itemKey(item);
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
        const mId = itemKey(item);
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
          const mId = itemKey(item);
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
          const mId = itemKey(item);
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
          const mId = itemKey(item);
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

  // 5a. Rename a list / change its icon (from the sidebar's list menu)
  const [listEdit, setListEdit] = useState(null); // { list, focus: 'name' | 'icon' }
  const handleUpdateList = async (listId, changes) => {
    const updated = await updateList(listId, changes);
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, ...changes, ...(updated || {}) } : l)));
    showToast('List updated', 'success');
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
  const handleAddMovie = async (listId, movieData, { openDetail = true, status } = {}) => {
    let initialStatus = 'plan_to_watch';
    if (activeListId === 'watching') initialStatus = 'watching';
    if (activeListId === 'completed') initialStatus = 'completed';
    if (status) initialStatus = status;

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

    // Open detail view for the newly added movie (Discover adds quietly and stays put)
    if (newItem && openDetail) {
      setPreviewMovie(null);
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

  // Tick boxes on a movie's page: which custom lists it is in
  const handleSetLists = async (itemId, listIds) => {
    try {
      const { item } = await setItemLists(itemId, listIds);
      await Promise.all([fetchAllMovies(), fetchLists()]);
      if (item) setSelectedItem(item);
    } catch (err) {
      console.error('Failed to change lists:', err);
      showToast(err.message || 'Failed to change lists', 'error');
    }
  };

  // Custom lists the open movie is in, across all of its entries
  const selectedListIds = useMemo(() => {
    if (!selectedItem?.movie) return [];
    const key = titleKey(selectedItem.movie);
    const customIds = new Set(lists.map((l) => l.id));
    return allMovies.filter((it) => titleKey(it.movie) === key && customIds.has(it.list)).map((it) => it.list);
  }, [allMovies, lists, selectedItem]);

  // 8. Remove List Item Handler
  // Removing soft-deletes into Trash (30 days), so it happens straight away with an Undo
  // instead of a confirm dialog.
  const handleRemoveItem = async (itemId) => {
    const removed = allMovies.find((item) => item.id === itemId);
    try {
      await removeListItem(itemId);
      setAllMovies((prev) => prev.filter((item) => item.id !== itemId));
      if (selectedItem && selectedItem.id === itemId) {
        setSelectedItem(null);
        setViewMode('list');
      }

      // Decrement the count of the list the movie was in
      setLists((prev) =>
        prev.map((l) =>
          l.id === removed?.list
            ? { ...l, items_count: Math.max(0, (l.items_count || 0) - 1) }
            : l
        )
      );
      const title = removed?.movie?.title;
      showToast(title ? `Moved "${title}" to Trash` : 'Moved to Trash', 'trash', {
        label: 'Undo',
        onClick: async () => {
          dismissToast();
          try {
            await restoreTrashEntry('item', itemId);
            await fetchLists();
            showToast(title ? `Restored "${title}"` : 'Restored', 'success');
          } catch (err) {
            console.error('Failed to restore item:', err);
            showToast('Could not undo. The movie is still in Trash.', 'error');
          }
        },
      });
    } catch (err) {
      console.error('Failed to remove item:', err);
      showToast('Failed to remove movie', 'error');
    }
  };

  // Switching sections always lands on that section's main view, never a stale detail page
  const selectSection = useCallback((section) => {
    setActiveSection(section);
    setViewMode('list');
    setSelectedItem(null);
    setPreviewMovie(null);
    setMobilePanel(null);
  }, []);

  // Trash is a page inside Library
  const openTrash = useCallback(() => {
    selectSection('library');
    setViewMode('trash');
  }, [selectSection]);

  // More only exists as a phone tab; widening the window lands back on Library
  useEffect(() => {
    setMobilePanel(null);
    if (!isMobile && activeSection === 'more') selectSection('library');
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global Keyboard Shortcuts
  useEffect(() => {
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
        if (listEdit) {
          setListEdit(null);
          return;
        }
        if (viewMode !== 'list') {
          setViewMode('list');
          setSelectedItem(null);
          setPreviewMovie(null);
          return;
        }
      }

      // Shortcuts with Ctrl or Alt stay live while typing in a field (for example the
      // movie-count box in Discover); single-key ones like N only fire when you're not typing.
      const isDialogOpen = isSearchOpen || isNewListOpen || !!listEdit || isAuthOpen;
      const fires = (shortcut) => matchesShortcut(e, shortcut)
        && !(isBareKey(shortcut) && (isTypingTarget(document.activeElement) || isDialogOpen));

      // Open / close Settings (default Ctrl+,)
      if (fires(shortcuts.settings)) {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
        return;
      }

      // Nothing else fires while Settings is open
      if (isSettingsOpen) return;

      // Toggle Trash (default Ctrl+Shift+Backspace)
      if (fires(shortcuts.toggleTrash)) {
        e.preventDefault();
        setIsTrashOpen((prev) => !prev);
        return;
      }

      // Toggle left sidebar (default Alt+B)
      if (fires(shortcuts.toggleSidebar)) {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
        return;
      }

      // Switch section (default Ctrl+Shift+1 / 2 / 3)
      if (fires(shortcuts.goLibrary)) {
        e.preventDefault();
        selectSection('library');
        return;
      }
      if (fires(shortcuts.goDiscover)) {
        e.preventDefault();
        selectSection('discover');
        return;
      }
      if (fires(shortcuts.goSchedule)) {
        e.preventDefault();
        selectSection('schedule');
        return;
      }

      // Section shortcuts: only while that section's main view is showing.
      // Calendar's own shortcuts live in Schedule.jsx.
      if (viewMode !== 'list') return;

      // Library: Add a movie (default N)
      if (activeSection === 'library' && fires(shortcuts.addMovie)) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Library: jump into the list's search bar (default /); Esc there leaves it again
      if (activeSection === 'library' && fires(shortcuts.focusSearch)) {
        e.preventDefault();
        librarySearchRef.current?.focus();
        librarySearchRef.current?.select();
        return;
      }

      // Library: poster size (default Ctrl+Shift+S / M / L / X), same setting as Settings › Appearance
      if (activeSection === 'library') {
        const size = CARD_SIZE_SHORTCUTS.find(({ action }) => fires(shortcuts[action]));
        if (size) {
          e.preventDefault();
          setPrefs((prev) => ({ ...prev, cardSize: size.id }));
          showToast(`Poster size: ${size.label}`, 'success');
          return;
        }
      }

      // Discover: toggle the filters panel (default Ctrl+Alt+B)
      if (activeSection === 'discover' && fires(shortcuts.toggleFilters)) {
        e.preventDefault();
        setPrefs((prev) => ({ ...prev, filtersOpen: !prev.filtersOpen }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, isSettingsOpen, isSearchOpen, isNewListOpen, listEdit, isAuthOpen, viewMode, activeSection, selectSection]);

  // Set of movie IDs in the active list (for search modal to show 'Added')
  const existingMovieIds = useMemo(() => {
    return new Set(
      displayedMovies.map((item) => titleKey(item.movie)).filter(Boolean)
    );
  }, [displayedMovies]);

  // Every movie anywhere in the library - used to mark recommendations already saved
  const allLibraryMovieIds = useMemo(() => {
    return new Set(
      allMovies.map((item) => titleKey(item.movie)).filter(Boolean)
    );
  }, [allMovies]);

  const openItemDetail = (item) => {
    setSelectedItem(item);
    setViewMode('movie-detail');
  };

  // A web recommendation opened from Discover. Nothing is saved: the extra TMDB lookup only
  // fills in cast, runtime and so on.
  const openWebPreview = useCallback(async (movie) => {
    setSelectedItem(null);
    setPreviewMovie(movie);
    setViewMode('movie-preview');
    try {
      const full = await getTMDBMovie(movie.tmdb_id, movie.media_type);
      setPreviewMovie((current) => (current && titleKey(current) === titleKey(movie) ? { ...movie, ...full } : current));
    } catch (err) {
      console.warn('Could not load full movie details:', err);
    }
  }, []);

  const closeDetail = () => {
    setViewMode('list');
    setSelectedItem(null);
    setPreviewMovie(null);
  };

  // The phone/browser Back button closes an open page (movie, preview, Trash) and returns
  // to the section it was opened from, instead of leaving the app: opening a page adds one
  // history entry, Back pops it, and closing the page from inside the app drops it too.
  const pageInHistory = React.useRef(false);
  useEffect(() => {
    if (viewMode !== 'list' && !pageInHistory.current) {
      window.history.pushState({ cinetrackPage: true }, '');
      pageInHistory.current = true;
    } else if (viewMode === 'list' && pageInHistory.current) {
      pageInHistory.current = false;
      window.history.back();
    }
  }, [viewMode]);
  useEffect(() => {
    const onPopState = () => {
      if (!pageInHistory.current) return;
      pageInHistory.current = false;
      setViewMode('list');
      setSelectedItem(null);
      setPreviewMovie(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  let detailPage = null;
  if (viewMode === 'movie-detail' && selectedItem) {
    detailPage = (
      <MovieDetailPage
        item={selectedItem}
        lists={lists}
        onBack={closeDetail}
        backLabel={activeSection === 'discover' ? 'Back to Discover' : 'Back to Movies'}
        memberListIds={selectedListIds}
        onSetLists={handleSetLists}
        onUpdateItem={handleUpdateItem}
        onRemoveItem={handleRemoveItem}
      />
    );
  } else if (viewMode === 'movie-preview' && previewMovie) {
    detailPage = (
      <MovieDetailPage
        item={{ id: null, movie: previewMovie }}
        isPreview
        lists={lists}
        onAdd={(listId) => handleAddMovie(listId, previewMovie, { status: 'plan_to_watch' })}
        onBack={closeDetail}
      />
    );
  }

  return (
    <div className={`app-shell ${isMobile ? 'app-shell--mobile' : ''}`}>
      {/* Activity Rail (a bottom tab bar on phones) */}
      {isMobile ? (
        <MobileTabBar activeSection={activeSection} onSelectSection={selectSection} />
      ) : (
      <ActivityRail
        activeSection={activeSection}
        onSelectSection={selectSection}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTrash={openTrash}
        shortcuts={shortcuts}
        totalMoviesCount={totalAllCount}
        user={authUser}
        googleClientId={googleClientId}
        onGoogleCredential={handleGoogleCredential}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={handleSignOut}
        calendar={calendar}
        isCalendarBusy={isCalendarBusy}
        onConnectCalendar={handleConnectCalendar}
        onDisconnectCalendar={handleDisconnectCalendar}
      />
      )}

      {/* Tapping outside an open drawer closes it */}
      {isMobile && mobilePanel && (
        <div className="m-scrim" onClick={closeMobilePanel} aria-hidden="true" />
      )}

      {/* Library section */}
      {activeSection === 'library' && (
        <>
          <Sidebar
            isOpen={isLeftPanelOpen}
            lists={lists}
            activeListId={activeListId}
            onSelectList={(id) => {
              setActiveListId(id);
              setViewMode('list');
              closeMobilePanel();
            }}
            onOpenNewList={() => { closeMobilePanel(); setIsNewListOpen(true); }}
            onReorderCustomLists={handleReorderCustomLists}
            onDeleteList={handleDeleteList}
            onToggleFavourite={handleToggleFavourite}
            onEditList={(list, focus) => { closeMobilePanel(); setListEdit({ list, focus }); }}
            totalAllMoviesCount={totalAllCount}
            statusCounts={statusCounts}
          />

          {detailPage || (viewMode === 'trash' ? (
            <TrashPage
              onChanged={() => { fetchLists(); fetchAllMovies(); }}
              onToggleLeftPanel={toggleLeftPanel}
              isLeftPanelOpen={isLeftPanelOpen}
            />
          ) : (
            <MovieList
              currentList={currentListObj}
              items={displayedMovies}
              selectedItemId={selectedItem?.id}
              onSelectItem={openItemDetail}
              onOpenSearch={() => setIsSearchOpen(true)}
              isLoading={isLoadingMovies}
              cardSize={prefs.cardSize}
              shortcuts={shortcuts}
              onRemoveItem={handleRemoveItem}
              onToggleLeftPanel={toggleLeftPanel}
              isLeftPanelOpen={isLeftPanelOpen}
              searchInputRef={librarySearchRef}
            />
          ))}
        </>
      )}

      {/* Discover section: stays mounted while hidden so the bag, rounds and filters survive a trip to Library */}
      <Discover
        key={authUser?.email || 'guest'}
        userKey={authUser?.email || 'guest'}
        visible={activeSection === 'discover'}
        items={allMovies}
        lists={lists}
        isLoading={isLoadingMovies}
        libraryIds={allLibraryMovieIds}
        prefs={prefs}
        onPrefsChange={handlePrefsChange}
        isSidebarOpen={isLeftPanelOpen}
        onToggleLeftPanel={toggleLeftPanel}
        onCloseMobilePanel={closeMobilePanel}
        isFiltersOpen={isMobile ? mobilePanel === 'right' : prefs.filtersOpen}
        onSetFiltersOpen={(open) => (isMobile
          ? setMobilePanel(open ? 'right' : null)
          : handlePrefsChange({ filtersOpen: open }))}
        onOpenItem={openItemDetail}
        onAddMovie={handleAddMovie}
        onPreviewWeb={openWebPreview}
        clearHistorySignal={clearDiscoverSignal}
        detailNode={activeSection === 'discover' ? detailPage : null}
      />

      {/* Schedule section: mounted only while active, since its calendar and modal have no
          cross-section state worth keeping warm (unlike Discover's rounds/shortlist bag). */}
      {activeSection === 'schedule' && (
        <Schedule
          visible
          items={allMovies}
          lists={lists}
          isSidebarOpen={isLeftPanelOpen}
          onToggleLeftPanel={toggleLeftPanel}
          isMobile={isMobile}
          mobilePanel={mobilePanel}
          onSetMobilePanel={setMobilePanel}
          shortcuts={shortcuts}
          isOtherDialogOpen={isSettingsOpen || isSearchOpen || isNewListOpen || !!listEdit || isAuthOpen}
          prefs={prefs}
          onLibraryChanged={fetchAllMovies}
        />
      )}

      {/* More: phone-only tab for settings, trash and account */}
      {activeSection === 'more' && (
        <MobileMore
          user={authUser}
          totalMoviesCount={totalAllCount}
          googleClientId={googleClientId}
          onGoogleCredential={handleGoogleCredential}
          onOpenAuth={() => setIsAuthOpen(true)}
          onSignOut={handleSignOut}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenTrash={openTrash}
          calendar={calendar}
          isCalendarBusy={isCalendarBusy}
          onConnectCalendar={handleConnectCalendar}
          onDisconnectCalendar={handleDisconnectCalendar}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        shortcuts={shortcuts}
        onSaveShortcuts={handleSaveShortcuts}
        onResetShortcuts={handleResetShortcuts}
        prefs={prefs}
        onPrefsChange={handlePrefsChange}
        onClearDiscoverHistory={() => setClearDiscoverSignal((n) => n + 1)}
        resolvedTheme={resolvedTheme}
      />

      {/* TMDB Search Modal */}
      <MovieSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentList={currentListObj}
        lists={lists}
        onAddMovie={handleAddMovie}
        existingMovieIds={existingMovieIds}
        includeTv={prefs.includeTv}
      />

      {/* New List Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        googleClientId={googleClientId}
        onGoogleCredential={handleGoogleCredential}
        onSuccess={() => window.location.reload()}
      />

      <NewListModal
        isOpen={isNewListOpen}
        onClose={() => setIsNewListOpen(false)}
        onCreate={handleCreateList}
      />

      {/* Same dialog in edit mode: Rename / Change icon */}
      <NewListModal
        isOpen={!!listEdit}
        editingList={listEdit?.list}
        focus={listEdit?.focus}
        onClose={() => setListEdit(null)}
        onSave={handleUpdateList}
      />

      {/* Toast */}
      {toastMessage && (
        <div className="toast animate-fade-in" role="status">
          {toastMessage.type === 'success'
            ? <CheckCircle2 size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            : toastMessage.type === 'trash'
              ? <Trash2 size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              : <AlertCircle size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />}
          <span>{toastMessage.message}</span>
          {toastMessage.action && (
            <button type="button" className="toast__action" onClick={toastMessage.action.onClick}>
              {toastMessage.action.label}
            </button>
          )}
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
