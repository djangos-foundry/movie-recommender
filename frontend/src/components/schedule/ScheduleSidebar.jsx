import React from 'react';
import { CalendarDays, Clock, CheckCircle2 } from 'lucide-react';
import BrandHeader from '../BrandHeader';
import { getListIcon } from '../NewListModal';
import { formatDuration, formatTime } from '../../lib/scheduleEngine';

const NAV_ITEMS = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'upcoming', label: 'Upcoming', icon: Clock },
  { id: 'watched', label: 'Watched on plan', icon: CheckCircle2 },
];

// Left rail for Calendar: same .sidebar shell as Library/Discover, but holds
// navigation (Calendar / Upcoming / Watched on plan) plus a Lists filter for
// the library panel on the right, instead of the tray itself.
export default function ScheduleSidebar({
  isOpen,
  navMode = 'calendar',
  onSelectNav,
  counts = {},
  lists = [],
  selectedListId = null,
  onSelectList,
  glance = null,
}) {
  return (
    <aside
      className={`sidebar ${isOpen ? 'sidebar--open' : 'sidebar--closed'}`}
      aria-label="Calendar"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <BrandHeader />

      <nav className="sidebar__nav">
        <div className="sidebar__section-label">Calendar</div>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = navMode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectNav?.(id)}
              className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
            >
              <Icon size={14} className="sidebar__nav-icon" />
              <span className="sidebar__nav-label">{label}</span>
              <span className={`sidebar__nav-badge ${isActive ? 'sidebar__nav-badge--active' : ''}`}>
                {counts[id] ?? 0}
              </span>
            </button>
          );
        })}

        {lists.length > 0 && (
          <>
            <div className="sidebar__divider" />
            <div className="sidebar__section-header">
              <span className="sidebar__section-label">Lists</span>
            </div>
            {lists.map((list) => {
              const isActive = selectedListId === list.id;
              const ListIcon = getListIcon(list.icon || 'Film');
              return (
                <button
                  key={list.id}
                  type="button"
                  className={`sidebar__list-item ${isActive ? 'sidebar__list-item--active' : ''}`}
                  onClick={() => onSelectList?.(isActive ? null : list.id)}
                  title={`Show only "${list.name}" movies in the library panel`}
                >
                  <ListIcon size={14} className="sidebar__list-icon" />
                  <span className="sidebar__list-name">{list.name}</span>
                  <span className="sidebar__nav-badge">{list.items_count || 0}</span>
                </button>
              );
            })}
          </>
        )}
      </nav>

      {glance && (
        <div className="sc-glance">
          <div className="sc-glance__row sc-glance__row--strong">
            <b>{glance.count}</b> movie{glance.count === 1 ? '' : 's'} planned
          </div>
          <div className="sc-glance__row">{formatDuration(glance.totalMinutes)} of watch time</div>
          {glance.next && (
            <div className="sc-glance__row">
              Next: {glance.next.movie?.title} · {glance.next.start.toLocaleDateString(undefined, { weekday: 'short' })}{' '}
              {formatTime(glance.next.start)}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
