import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Film, Plus, X } from 'lucide-react';
import { Draggable } from '@fullcalendar/interaction';
import { formatDuration, runtimeOf } from '../../lib/scheduleEngine';

// Right panel for Calendar: a searchable, draggable tray of library movies
// (optionally narrowed to one "Show list" from the left sidebar). Dragging a
// movie onto the calendar (month or week view) opens the "Schedule a watch"
// dialog prefilled with that movie and the dropped date.
export default function ScheduleLibraryPanel({ isOpen = true, movieOptions = [], activeListName = null, onClearList, onQuickSchedule }) {
  const [query, setQuery] = useState('');
  const trayRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movieOptions;
    return movieOptions.filter((m) => (m.title || '').toLowerCase().includes(q));
  }, [movieOptions, query]);

  // One Draggable instance for the whole tray; FullCalendar reads the movie
  // back off the dragged element's dataset in eventReceive.
  useEffect(() => {
    if (!trayRef.current) return undefined;
    const draggable = new Draggable(trayRef.current, {
      itemSelector: '.sc-tray-item',
      eventData: (el) => ({
        title: el.dataset.title,
        duration: el.dataset.duration,
        extendedProps: { movieId: Number(el.dataset.movieId) },
      }),
    });
    return () => draggable.destroy();
  }, []);

  return (
    <aside
      className={`sc-library ${isOpen ? 'sc-library--open' : 'sc-library--closed'}`}
      aria-label="Your library"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div className="sc-library__head">
        <span className="sc-library__title">Your library</span>
        {activeListName ? (
          <button type="button" className="sc-btn sc-btn--sm" onClick={onClearList}>
            {activeListName} <X size={12} />
          </button>
        ) : (
          <span className="sc-library__count">{movieOptions.length}</span>
        )}
      </div>

      <div className="sc-library__search-wrap">
        <div className="sc-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Find a movie…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div ref={trayRef} className="sc-tray custom-scrollbar">
        {filtered.length === 0 ? (
          <p className="sidebar__empty-hint">
            {movieOptions.length === 0 ? 'Add movies in Library first.' : 'No movies match.'}
          </p>
        ) : (
          filtered.map((m) => (
            <div
              key={m.tmdb_id || m.id}
              className="sc-tray-item"
              draggable="true"
              data-movie-id={m.id}
              data-title={m.title}
              data-duration={String(runtimeOf(m))}
              title="Drag onto the calendar, or click to schedule"
            >
              <div className="sc-tray-item__poster">
                {m.poster_path
                  ? <img src={m.poster_path} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  : <Film size={14} opacity={0.4} />}
              </div>
              <div className="sc-tray-item__info">
                <strong>{m.title}</strong>
                <span>{(m.release_date || '').slice(0, 4)} · {formatDuration(runtimeOf(m))}</span>
              </div>
              <button
                type="button"
                className="sc-tray-item__add"
                aria-label={`Schedule ${m.title}`}
                onClick={() => onQuickSchedule?.(m)}
              >
                <Plus size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sc-library__footer">
        <p className="sc-hint">Drag a movie onto a day to schedule it — the end time fills in from its runtime.</p>
      </div>
    </aside>
  );
}
