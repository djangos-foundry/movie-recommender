import React from 'react';
import { Settings, Trash2, CalendarCheck, CalendarPlus, Unplug, Undo2, UserPlus, ChevronRight, CircleUser } from 'lucide-react';
import GoogleSignInButton from './GoogleSignInButton';

// The More tab on phones: what the activity rail's avatar popover and bottom buttons hold on desktop.
export default function MobileMore({
  user = null,
  totalMoviesCount = 0,
  googleClientId = '',
  onGoogleCredential,
  onOpenAuth,
  onSignOut,
  onOpenSettings,
  onOpenTrash,
  calendar = null,
  isCalendarBusy = false,
  onConnectCalendar,
  onDisconnectCalendar,
}) {
  const initials = user?.name
    ? user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : null;

  return (
    <main className="m-more">
      <header className="m-more__head">
        <h1 className="m-more__title">More</h1>
      </header>

      <div className="m-more__body custom-scrollbar">
        <section className="m-more__card">
          {user ? (
            <div className="m-more__account">
              <div className="m-more__avatar">{initials}</div>
              <div className="m-more__who">
                <p className="m-more__name">{user.name}</p>
                <p className="m-more__email">{user.email}</p>
              </div>
            </div>
          ) : (
            <div className="m-more__guest">
              <div className="m-more__account">
                <div className="m-more__avatar m-more__avatar--guest"><CircleUser size={20} /></div>
                <div className="m-more__who">
                  <p className="m-more__name">Save your lists</p>
                  <p className="m-more__email">You're browsing as a guest. Your lists stay in this browser only.</p>
                </div>
              </div>
              <button type="button" className="m-more__row" onClick={onOpenAuth}>
                <UserPlus size={17} />
                <span>Sign in or create account</span>
                <ChevronRight size={16} className="m-more__chevron" />
              </button>
              {googleClientId && (
                <div className="m-more__google">
                  <GoogleSignInButton clientId={googleClientId} onCredential={onGoogleCredential} width={280} />
                </div>
              )}
            </div>
          )}
          <div className="m-more__stat">
            <span>Library</span>
            <span className="m-more__stat-value">{totalMoviesCount}</span>
          </div>
        </section>

        <section className="m-more__card">
          <button type="button" className="m-more__row" onClick={onOpenSettings}>
            <Settings size={17} />
            <span>Settings</span>
            <ChevronRight size={16} className="m-more__chevron" />
          </button>
          <button type="button" className="m-more__row" onClick={onOpenTrash}>
            <Trash2 size={17} />
            <span>Trash</span>
            <ChevronRight size={16} className="m-more__chevron" />
          </button>
        </section>

        {user?.kind === 'google' && (
          <section className="m-more__card">
            <button
              type="button"
              className="m-more__row"
              onClick={onConnectCalendar}
              disabled={isCalendarBusy || calendar?.connected}
            >
              {calendar?.connected ? <CalendarCheck size={17} /> : <CalendarPlus size={17} />}
              <span>
                {isCalendarBusy ? 'Connecting…'
                  : calendar?.connected ? 'Google Calendar connected'
                  : calendar?.needs_reconnect ? 'Reconnect Google Calendar'
                  : 'Connect Google Calendar'}
              </span>
            </button>
            {calendar?.connected && (
              <button type="button" className="m-more__row m-more__row--quiet" onClick={onDisconnectCalendar}>
                <Unplug size={17} />
                <span>Disconnect calendar</span>
              </button>
            )}
          </section>
        )}

        {user && (
          <section className="m-more__card">
            <button type="button" className="m-more__row" onClick={onSignOut}>
              <Undo2 size={17} />
              <span>Sign out</span>
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
