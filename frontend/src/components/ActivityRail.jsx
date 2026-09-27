import React, { useState } from 'react';
import { User, Settings, LogOut, Film, Compass } from 'lucide-react';

const SECTIONS = [
  { id: 'library', label: 'Library', icon: Film, shortcutKey: 'goLibrary', fallback: 'Ctrl+Shift+1' },
  { id: 'discover', label: 'Discover', icon: Compass, shortcutKey: 'goDiscover', fallback: 'Ctrl+Shift+2' },
];

export default function ActivityRail({
  activeSection = 'library',
  onSelectSection,
  isSidebarOpen = true,
  onToggleSidebar,
  onOpenSettings,
  shortcuts = {},
  totalMoviesCount = 0,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return (
    <aside className="activity-rail">
      {/* Top: User Avatar + sections */}
      <div className="activity-rail__top">
        <div className="activity-rail__avatar-wrap">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className={`activity-rail__avatar-btn ${isUserMenuOpen ? 'is-active' : ''}`}
            title="Account"
          >
            <span className="activity-rail__avatar-initials">CT</span>
          </button>

          {/* Popover */}
          {isUserMenuOpen && (
            <>
              <div
                className="activity-rail__backdrop"
                onClick={() => setIsUserMenuOpen(false)}
              />
              <div className="activity-rail__popover">
                <div className="activity-rail__popover-header">
                  <div className="activity-rail__popover-avatar">CT</div>
                  <div>
                    <p className="activity-rail__popover-name">Movie Enthusiast</p>
                    <p className="activity-rail__popover-email">nexus@cinetrack.local</p>
                  </div>
                </div>
                <div className="activity-rail__popover-stat">
                  <span>Library</span>
                  <span className="activity-rail__popover-stat-value">{totalMoviesCount}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (onOpenSettings) onOpenSettings();
                  }}
                  className="activity-rail__popover-btn"
                >
                  <Settings size={13} />
                  <span>Settings</span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="activity-rail__divider" aria-hidden="true" />

        <nav className="activity-rail__sections" aria-label="Sections">
          {SECTIONS.map(({ id, label, icon: Icon, shortcutKey, fallback }) => {
            const isActive = activeSection === id;
            return (
              <div
                key={id}
                className="activity-rail__icon-wrap"
                data-tooltip={`${label} (${shortcuts[shortcutKey] || fallback})`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSection?.(id)}
                  className={`activity-rail__section ${isActive ? 'is-active' : ''}`}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={18} />
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Bottom: Settings + Toggle */}
      <div className="activity-rail__bottom">
        <div className="activity-rail__icon-wrap" data-tooltip={`Settings (${shortcuts.settings || 'Ctrl+,'})`}>
          <button
            type="button"
            onClick={onOpenSettings}
            className="activity-rail__icon-btn"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
        </div>

        <div
          className="activity-rail__icon-wrap"
          data-tooltip={isSidebarOpen
            ? `Collapse Sidebar (${shortcuts.toggleSidebar || 'Alt+B'})`
            : `Expand Sidebar (${shortcuts.toggleSidebar || 'Alt+B'})`}
        >
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`activity-rail__icon-btn ${!isSidebarOpen ? 'is-active' : ''}`}
            aria-label="Toggle Sidebar"
          >
            <LogOut
              size={18}
              style={{
                transform: isSidebarOpen ? 'none' : 'rotate(180deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}
