import React, { useState, useEffect } from 'react';
import { Film, Bookmark, CheckCircle2, Clock, Plus, Trash2, MoreVertical, Star } from 'lucide-react';
import { getListIcon } from './NewListModal';

const CORE_STATUSES = [
  { id: 'plan_to_watch', name: 'Plan to Watch', icon: Bookmark, color: '#60a5fa' },
  { id: 'watching',      name: 'Watching',       icon: Clock,       color: '#fbbf24' },
  { id: 'completed',     name: 'Completed',       icon: CheckCircle2, color: '#34d399' },
];

export default function Sidebar({
  isOpen = true,
  lists = [],
  activeListId,
  onSelectList,
  onOpenNewList,
  onDeleteList,
  onReorderCustomLists,
  onToggleFavourite,
  totalAllMoviesCount = 0,
  statusCounts = {},
}) {
  const [listToDelete, setListToDelete] = useState(null);
  const [openMenuId, setOpenMenuId]     = useState(null);
  const [draggedListId, setDraggedListId]   = useState(null);
  const [dragOverListId, setDragOverListId] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null);

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    if (openMenuId !== null) {
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }
  }, [openMenuId]);

  const isCoreList = (name) =>
    ['plan to watch', 'watching', 'completed'].includes((name || '').toLowerCase().trim());

  const customLists    = lists.filter((l) => !isCoreList(l.name));
  const favouriteLists = customLists.filter((l) => l.is_favourite);
  const regularLists   = customLists.filter((l) => !l.is_favourite);

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const handleDragStart = (e, list) => {
    setDraggedListId(list.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(list.id));
  };
  const handleDragOver = (e, list) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedListId === list.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos  = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    if (dragOverListId !== list.id || dragOverPosition !== pos) {
      setDragOverListId(list.id);
      setDragOverPosition(pos);
    }
  };
  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverListId(null);
    setDragOverPosition(null);
  };
  const handleDrop = (e, targetList) => {
    e.preventDefault();
    if (!draggedListId || draggedListId === targetList.id) {
      setDraggedListId(null); setDragOverListId(null); setDragOverPosition(null);
      return;
    }
    const arr    = [...regularLists];
    const srcIdx = arr.findIndex((l) => l.id === draggedListId);
    let tgtIdx   = arr.findIndex((l) => l.id === targetList.id);
    if (srcIdx !== -1 && tgtIdx !== -1) {
      const [moved] = arr.splice(srcIdx, 1);
      if (srcIdx < tgtIdx && dragOverPosition === 'top')    tgtIdx--;
      if (srcIdx > tgtIdx && dragOverPosition === 'bottom') tgtIdx++;
      arr.splice(tgtIdx, 0, moved);
      if (onReorderCustomLists) onReorderCustomLists([...favouriteLists, ...arr]);
    }
    setDraggedListId(null); setDragOverListId(null); setDragOverPosition(null);
  };
  const handleDragEnd = () => {
    setDraggedListId(null); setDragOverListId(null); setDragOverPosition(null);
  };

  // ── List row renderer ────────────────────────────────────────────────────
  const renderListItem = (list, draggable = true) => {
    const isActive     = activeListId === list.id;
    const isDragging   = draggedListId === list.id;
    const isOverTop    = dragOverListId === list.id && dragOverPosition === 'top';
    const isOverBottom = dragOverListId === list.id && dragOverPosition === 'bottom';
    const isMenuOpen   = openMenuId === list.id;
    const ListIcon     = getListIcon(list.icon || 'Film');

    return (
      <div
        key={list.id}
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, list) : undefined}
        onDragOver={draggable  ? (e) => handleDragOver(e, list)  : undefined}
        onDragLeave={draggable ? handleDragLeave : undefined}
        onDrop={draggable      ? (e) => handleDrop(e, list)      : undefined}
        onDragEnd={draggable   ? handleDragEnd : undefined}
        onClick={() => onSelectList(list.id)}
        className={`sidebar__list-item ${isActive ? 'sidebar__list-item--active' : ''} ${isDragging ? 'sidebar__list-item--dragging' : ''} ${isOverTop ? 'sidebar__list-item--over-top' : ''} ${isOverBottom ? 'sidebar__list-item--over-bottom' : ''} ${isMenuOpen ? 'has-menu-open' : ''} ${draggable ? 'sidebar__list-item--draggable' : ''}`}
        title={draggable ? 'Drag to reorder' : undefined}
      >
        <ListIcon size={14} className="sidebar__list-icon" />
        <span className="sidebar__list-name">{list.name}</span>

        <div className="sidebar__list-actions" onClick={(e) => e.stopPropagation()}>
          <span className={`sidebar__nav-badge sidebar__list-badge ${isActive ? 'sidebar__nav-badge--active' : ''}`}>
            {list.items_count || 0}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(openMenuId === list.id ? null : list.id);
            }}
            className="sidebar__list-menu-btn"
            title="Options"
          >
            <MoreVertical size={13} />
          </button>

          {openMenuId === list.id && (
            <div className="sidebar__dropdown">
              {/* Favourite toggle */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  if (onToggleFavourite) onToggleFavourite(list.id, !list.is_favourite);
                }}
                className="sidebar__dropdown-item sidebar__dropdown-item--fav"
              >
                <Star size={12} className={list.is_favourite ? 'sidebar__fav-icon--filled' : ''} />
                <span>{list.is_favourite ? 'Remove from Favourites' : 'Add to Favourites'}</span>
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  setListToDelete(list);
                }}
                className="sidebar__dropdown-item sidebar__dropdown-item--danger"
              >
                <Trash2 size={12} />
                <span>Delete List</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };


  return (
    <>
      <aside className={`sidebar ${isOpen ? 'sidebar--open' : 'sidebar--closed'}`}>
        {/* Branding */}
        <div className="sidebar__brand">
          <div className="sidebar__logo">
            <Film size={15} strokeWidth={2.5} />
          </div>
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-name">CINETRACK</span>
            <span className="sidebar__brand-sub">Movie Hub &amp; Tracker</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {/* ── LIBRARY ── */}
          <div className="sidebar__section-label">Library</div>

          <button
            type="button"
            onClick={() => onSelectList('all')}
            className={`sidebar__nav-item ${activeListId === 'all' ? 'sidebar__nav-item--active' : ''}`}
          >
            <Film size={14} className="sidebar__nav-icon" />
            <span className="sidebar__nav-label">All Movies</span>
            <span className={`sidebar__nav-badge ${activeListId === 'all' ? 'sidebar__nav-badge--active' : ''}`}>
              {totalAllMoviesCount}
            </span>
          </button>

          {CORE_STATUSES.map((s) => {
            const isActive = activeListId === s.id;
            const count    = statusCounts[s.id] ?? 0;
            const Icon     = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectList(s.id)}
                className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
              >
                <Icon size={14} className="sidebar__nav-icon" style={{ color: isActive ? s.color : undefined }} />
                <span className="sidebar__nav-label">{s.name}</span>
                <span className={`sidebar__nav-badge ${isActive ? 'sidebar__nav-badge--active' : ''}`}>{count}</span>
              </button>
            );
          })}

          {/* ── FAVOURITES (only shown when lists are favourited) ── */}
          {favouriteLists.length > 0 && (
            <>
              <div className="sidebar__divider" />
              <div className="sidebar__section-label sidebar__section-label--fav">
                <Star size={10} className="sidebar__fav-section-icon" />
                Favourites
              </div>
              <div className="sidebar__list-group">
                {favouriteLists.map((list) => renderListItem(list, false))}
              </div>
            </>
          )}

          {/* ── LISTS ── */}
          <div className="sidebar__divider" />
          <div className="sidebar__section-header">
            <span className="sidebar__section-label">Lists</span>
            <button
              type="button"
              onClick={onOpenNewList}
              title="New list"
              className="sidebar__add-btn"
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
          </div>

          <div className="sidebar__list-group">
            {regularLists.length === 0 ? (
              <p className="sidebar__empty-hint">No lists yet — click + to create one</p>
            ) : (
              regularLists.map((list) => renderListItem(list, true))
            )}
          </div>

          {/* Divider at the end of the Lists section */}
          <div className="sidebar__divider" />
        </nav>
      </aside>


      {/* Delete Confirmation */}
      {listToDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal__title">Delete list?</h3>
            <p className="modal__body">
              Are you sure you want to delete <strong>"{listToDelete.name}"</strong>?
              Movies will remain in your library.
            </p>
            <div className="modal__actions">
              <button type="button" onClick={() => setListToDelete(null)} className="modal__btn modal__btn--cancel">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteList) onDeleteList(listToDelete.id);
                  setListToDelete(null);
                }}
                className="modal__btn modal__btn--danger"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
