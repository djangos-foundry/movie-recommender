import React, { useEffect, useState } from 'react';
import { X, Trash2, RotateCcw, Film } from 'lucide-react';
import { getListIcon } from './NewListModal';
import { getTrash, restoreTrashEntry, permanentlyDeleteTrashEntry } from '../api/client';

const entryKey = (e) => `${e.type}-${e.id}`;

// Removed movies and whole deleted lists both land here for 30 days before
// the backend's lazy sweep purges them for good (see TrashView in the
// backend). Restoring a list brings the whole list back as one unit —
// list-level restore only, no per-movie restore inside a deleted list.
export default function TrashModal({ isOpen, onClose, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [confirmEntry, setConfirmEntry] = useState(null);

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

  useEffect(() => { if (isOpen) refresh(); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (confirmEntry) {
        setConfirmEntry(null);
      } else {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, confirmEntry, onClose]);

  if (!isOpen) return null;

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

  const handlePermanentDelete = async () => {
    if (!confirmEntry) return;
    const entry = confirmEntry;
    try {
      setBusyKey(entryKey(entry));
      await permanentlyDeleteTrashEntry(entry.type, entry.id);
      setEntries((prev) => prev.filter((e) => entryKey(e) !== entryKey(entry)));
    } catch (err) {
      setError(err.message || 'Could not delete that.');
    } finally {
      setBusyKey(null);
      setConfirmEntry(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="trash-modal">
        <div className="trash-modal__header">
          <div>
            <h3 className="trash-modal__title">Trash</h3>
            <p className="trash-modal__subtitle">Removed movies and lists stay here for 30 days before being deleted for good.</p>
          </div>
          <button type="button" onClick={onClose} className="trash-modal__close" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <div className="nlm__error trash-modal__error">{error}</div>}

        <div className="trash-modal__list custom-scrollbar">
          {isLoading ? (
            <p className="trash-modal__empty-text">Loading…</p>
          ) : entries.length === 0 ? (
            <div className="trash-modal__empty">
              <Trash2 size={28} opacity={0.35} />
              <p>Trash is empty.</p>
            </div>
          ) : (
            entries.map((entry) => {
              const busy = busyKey === entryKey(entry);
              const ListIconComp = entry.type === 'list' ? getListIcon(entry.icon || 'Film') : null;
              return (
                <div key={entryKey(entry)} className="trash-row">
                  <div className="trash-row__thumb">
                    {entry.type === 'list' ? (
                      <ListIconComp size={18} style={{ color: entry.color }} />
                    ) : entry.movie?.poster_path ? (
                      <img src={entry.movie.poster_path} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <Film size={16} opacity={0.4} />
                    )}
                  </div>
                  <div className="trash-row__info">
                    <strong>{entry.type === 'list' ? entry.name : entry.movie?.title}</strong>
                    <span>
                      {entry.type === 'list'
                        ? `List · ${entry.items_count} movie${entry.items_count === 1 ? '' : 's'}`
                        : `Removed from "${entry.list_name}"`}
                    </span>
                  </div>
                  <span className="trash-row__days">{entry.days_remaining}d left</span>
                  <div className="trash-row__actions">
                    <button
                      type="button"
                      className="trash-row__btn"
                      title="Restore"
                      disabled={busy}
                      onClick={() => handleRestore(entry)}
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      type="button"
                      className="trash-row__btn trash-row__btn--danger"
                      title="Delete forever"
                      disabled={busy}
                      onClick={() => setConfirmEntry(entry)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirmEntry && (
        <div className="modal-overlay" style={{ zIndex: 60 }}>
          <div className="modal">
            <h3 className="modal__title">Delete forever?</h3>
            <p className="modal__body">
              <strong>"{confirmEntry.type === 'list' ? confirmEntry.name : confirmEntry.movie?.title}"</strong> will
              be permanently deleted — this can't be undone.
            </p>
            <div className="modal__actions">
              <button type="button" onClick={() => setConfirmEntry(null)} className="modal__btn modal__btn--cancel">
                Cancel
              </button>
              <button type="button" onClick={handlePermanentDelete} className="modal__btn modal__btn--danger">
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
