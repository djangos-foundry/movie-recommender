import React, { useState } from 'react';
import GoogleSignInButton from './GoogleSignInButton';
import { CircleUser, Settings, LogOut, Undo2, Film, Compass, CalendarDays, Trash2 } from 'lucide-react';

const SECTIONS = [
  { id: 'library', label: 'Library', icon: Film, shortcutKey: 'goLibrary', fallback: 'Ctrl+Shift+1' },
  { id: 'discover', label: 'Discover', icon: Compass, shortcutKey: 'goDiscover', fallback: 'Ctrl+Shift+2' },
  { id: 'schedule', label: 'Calendar', icon: CalendarDays, shortcutKey: 'goSchedule', fallback: 'Ctrl+Shift+3' },
];

export default function ActivityRail({
  activeSection = 'library',
  onSelectSection,
  isSidebarOpen = true,
  onToggleSidebar,
  onOpenSettings,
  onOpenTrash,
  shortcuts = {},
  totalMoviesCount = 0,
  user = null, // null = guest; { name, email } when signed in with Google
  googleClientId = '',
  onGoogleCredential,
  onSignOut,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const initials = user?.name
    ? user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'CT';

  const closeMenu = () => setIsUserMenuOpen(false);

  return (
    <aside className="activity-rail">
      {/* Top: User Avatar + sections */}
      <div className="activity-rail__top">
        <div className="activity-rail__avatar-wrap">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className={`activity-rail__avatar-btn ${isUserMenuOpen ? 'is-active' : ''}`}
            title={user ? 'Account' : 'Sign in'}
            aria-label="Account"
          >
            {user
              ? <span className="activity-rail__avatar-initials">{initials}</span>
              : <CircleUser size={20} strokeWidth={1.5} />}
          </button>

          {/* Popover */}
          {isUserMenuOpen && (
            <>
              <div
                className="activity-rail__backdrop"
                onClick={closeMenu}
              />
              <div className="activity-rail__popover">
                {user ? (
                  <div className="activity-rail__popover-header">
                    <div className="activity-rail__popover-avatar">{initials}</div>
                    <div>
                      <p className="activity-rail__popover-name">{user.name}</p>
                      <p className="activity-rail__popover-email">{user.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="activity-rail__guest">
                    <p className="activity-rail__popover-name">Save your lists</p>
                    <p className="activity-rail__guest-text">
                      You're browsing as a guest. Your lists stay in this browser only.
                    </p>
                    <GoogleSignInButton
                      clientId={googleClientId}
                      onCredential={onGoogleCredential}
                    />
                    <p className="activity-rail__guest-text">
                      Sign in to keep them on any device.
                    </p>
                  </div>
                )}
                <div className="activity-rail__popover-stat">
                  <span>Library</span>
                  <span className="activity-rail__popover-stat-value">{totalMoviesCount}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    if (onOpenSettings) onOpenSettings();
                  }}
                  className="activity-rail__popover-btn"
                >
                  <Settings size={13} />
                  <span>Settings</span>
                </button>
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      if (onSignOut) onSignOut();
                    }}
                    className="activity-rail__popover-btn"
                  >
                    <Undo2 size={13} />
                    <span>Sign out</span>
                  </button>
                )}
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

      {/* Bottom: Trash + Settings + Toggle */}
      <div className="activity-rail__bottom">
        <div className="activity-rail__icon-wrap" data-tooltip={`Trash (${shortcuts.toggleTrash || 'Ctrl+Shift+Backspace'})`}>
          <button
            type="button"
            onClick={onOpenTrash}
            className="activity-rail__icon-btn"
            aria-label="Trash"
          >
            <Trash2 size={18} />
          </button>
        </div>

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
