import React from 'react';
import { Film, Compass, CalendarDays, Ellipsis } from 'lucide-react';

// Phone-width replacement for ActivityRail: the same sections, plus More for settings and account.
const TABS = [
  { id: 'library', label: 'Library', icon: Film },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'schedule', label: 'Calendar', icon: CalendarDays },
  { id: 'more', label: 'More', icon: Ellipsis },
];

export default function MobileTabBar({ activeSection, onSelectSection }) {
  return (
    <nav className="m-tabbar" aria-label="Sections">
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeSection === id;
        return (
          <button
            key={id}
            type="button"
            className={`m-tabbar__tab ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelectSection(id)}
          >
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
