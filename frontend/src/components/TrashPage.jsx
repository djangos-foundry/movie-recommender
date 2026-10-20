import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, RotateCcw, Film, Search, X, Info, PanelLeft, Clock } from 'lucide-react';
import { getListIcon } from './NewListModal';
import { getTrash, restoreTrashEntry, permanentlyDeleteTrashEntry, emptyTrash } from '../api/client';

const entryKey = (e) => `${e.type}-${e.id}`;
const entryName = (e) => (e.type === 'list' ? e.name : e.movie?.title) || '';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'item', label: 'Movies' },
  { id: 'list', label: 'Lists' },
];

// A delete-forever button that asks on the first click and acts on the second;
// it settles back after a few seconds if you don't confirm.
function useTwoStep() {
  const [armed, setArmed] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const arm = (key) => {
    clearTimeout(timer.current);
    setArmed(key);
    timer.current = setTimeout(() => setArmed(null), 4000);
  };
  const reset = () => { clearTimeout(timer.current); setArmed(null); };
  return { armed, arm, reset };
}

function formatDeleted(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Deleted ${date}, ${time}`;
}

// Trash as a page inside Library. Removed movies and whole deleted lists stay for 30 days
// before the backend's sweep deletes them for good. A list comes back as one unit; a movie
// that is also in another list never left the library, so only movies that were in that
// list alone are lost when it is deleted forever.
export default function TrashPage({ onChanged, onToggleLeftPanel, isLeftPanelOpen }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const rowConfirm = useTwoStep();
  const emptyConfirm = useTwoStep();

  const refresh = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getTrash();
      setEntries(data?.results || []);
    } catch (err) {
      setError(err.message || 'Could not load Trash.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const counts = useMemo(() => ({
    all: entries.length,
    item: entries.filter((e) => e.type === 'item').length,
    list: entries.filter((e) => e.type === 'list').length,
  }), [entries]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => (tab === 'all' || e.type === tab) && (!q || entryName(e).toLowerCase().includes(q)));
  }, [entries, tab, search]);

  const handleRestore = async (entry) => {
    try {
      setBusyKey(entryKey(entry));
      await restoreTrashEntry(entry.type, entry.id);
      setEntries((prev) => prev.filter((e) => entryKey(e) !== entryKey(entry)));
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not restore that.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (entry) => {
    const key = entryKey(entry);
    if (rowConfirm.armed !== key) { rowConfirm.arm(key); return; }
    rowConfirm.reset();
    try {
      setBusyKey(key);
      await permanentlyDeleteTrashEntry(entry.type, entry.id);
      setEntries((prev) => prev.filter((e) => entryKey(e) !== key));
    } catch (err) {
      setError(err.message || 'Could not delete that.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleEmpty = async () => {
    if (emptyConfirm.armed !== 'all') { emptyConfirm.arm('all'); return; }
    emptyConfirm.reset();
    try {
      setBusyKey('all');
      await emptyTrash();
      setEntries([]);
    } catch (err) {
      setError(err.message || 'Could not empty Trash.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <main className="main-content">
      <header className="topbar">
        <div className="topbar__left">
          <button
            type="button"
            className={`m-panel-btn mobile-only ${isLeftPanelOpen ? 'is-on' : ''}`}
            aria-label="Lists"
            aria-expanded={isLeftPanelOpen}
            onClick={onToggleLeftPanel}
          >
            <PanelLeft size={18} />
          </button>
          <Trash2 size={17} className="tp__title-icon" />
          <h1 className="topbar__title">Trash</h1>
          <span className="topbar__count">{entries.length}</span>
        </div>

        <div className="topbar__search-wrap">
          <div className="topbar__search">
            <Search size={14} className="topbar__search-icon" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
              placeholder="Search Trash…"
              className="topbar__search-input"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="topbar__search-clear" aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="topbar__right">
          <button
            type="button"
            className={`tp__empty-btn ${emptyConfirm.armed ? 'is-armed' : ''}`}
            onClick={handleEmpty}
            disabled={entries.length === 0 || busyKey === 'all'}
          >
            <Trash2 size={14} />
            <span>{emptyConfirm.armed ? `Delete ${entries.length} forever?` : 'Empty Trash'}</span>
          </button>
        </div>
      </header>

      <div className="content-area custom-scrollbar">
        <div className="tp">
          <p className="tp__notice">
            <Info size={15} />
            <span>
              Items in Trash are <strong>deleted for good after 30 days</strong>. Restore them any time before
              that. A movie that is also in another list stays in your library when its list is deleted.
            </span>
          </p>

          <div className="tp__tabs" role="tablist" aria-label="Show">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tp__tab ${tab === t.id ? 'is-on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label} <span>{counts[t.id]}</span>
              </button>
            ))}
          </div>

          {error && <div className="nlm__error">{error}</div>}

          {isLoading ? (
            <div className="state-centered">
              <div className="spinner" />
              <span className="state-centered__label">Loading Trash…</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="state-empty">
              <div className="state-empty__icon"><Trash2 size={28} /></div>
              <h3 className="state-empty__title">{entries.length === 0 ? 'Trash is empty' : 'Nothing matches'}</h3>
              <p className="state-empty__body">
                {entries.length === 0 ? 'Movies and lists you remove land here for 30 days.' : 'Try another search or tab.'}
              </p>
            </div>
          ) : (
            <div className="tp__rows">
              {shown.map((entry) => {
                const key = entryKey(entry);
                const busy = busyKey === key || busyKey === 'all';
                const isList = entry.type === 'list';
                const ListIconComp = isList ? getListIcon(entry.icon || 'Film') : null;
                const soon = entry.days_remaining != null && entry.days_remaining <= 7;
                let detail = `Removed from "${entry.list_name}"`;
                if (isList) {
                  detail = `List · ${entry.items_count} movie${entry.items_count === 1 ? '' : 's'}`;
                  if (entry.items_count > 0) detail += ` · ${entry.only_here_count ?? entry.items_count} only in this list`;
                }
                const armed = rowConfirm.armed === key;
                return (
                  <div key={key} className="tp__row">
                    <div className={`tp__thumb ${isList ? 'tp__thumb--list' : ''}`}>
                      {isList ? (
                        <ListIconComp size={18} style={{ color: entry.color }} />
                      ) : entry.movie?.poster_path ? (
                        <img src={entry.movie.poster_path} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <Film size={16} opacity={0.4} />
                      )}
                    </div>
                    <div className="tp__info">
                      <strong>{entryName(entry)}</strong>
                      <span>{detail}</span>
                      <span className="tp__when">
                        <Clock size={11} />
                        {formatDeleted(entry.deleted_at)}
                        <i>·</i>
                        <em className={soon ? 'is-soon' : ''}>
                          {entry.days_remaining === 0 ? 'Expires today' : `Expires in ${entry.days_remaining} day${entry.days_remaining === 1 ? '' : 's'}`}
                        </em>
                      </span>
                    </div>
                    <div className="tp__actions">
                      <button type="button" className="tp__restore" disabled={busy} onClick={() => handleRestore(entry)}>
                        <RotateCcw size={13} />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        className={`tp__delete ${armed ? 'is-armed' : ''}`}
                        title="Delete forever"
                        aria-label={armed ? 'Confirm delete forever' : 'Delete forever'}
                        disabled={busy}
                        onClick={() => handleDelete(entry)}
                      >
                        <Trash2 size={14} />
                        {armed && <span>Delete forever?</span>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
