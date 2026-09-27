import React, { useState, useEffect, useRef } from 'react';
import { X, Palette, Keyboard, Compass, Minus, Plus, CalendarDays } from 'lucide-react';
import '../settings.css';
import { ACCENTS } from '../lib/prefs';
import { DEFAULT_SHORTCUTS, formatShortcut, shortcutFromEvent } from '../lib/shortcuts';
import { clampCount } from '../lib/discoverEngine';

// Re-exported so existing imports of DEFAULT_SHORTCUTS from this module keep working
export { DEFAULT_SHORTCUTS };

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette, subtitle: 'Make the app look the way you like.' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, subtitle: 'Click Edit, then press the new keys.' },
  { id: 'discover', label: 'Discover', icon: Compass, subtitle: 'Control how recommendations are drawn and shown.' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, subtitle: 'Choose what shows on scheduled-watch cards.' },
];

const SHORTCUT_ROWS = [
  { key: 'toggleSidebar', label: 'Toggle left sidebar' },
  { key: 'toggleFilters', label: 'Toggle filters panel' },
  { key: 'goLibrary', label: 'Go to Library' },
  { key: 'goDiscover', label: 'Go to Discover' },
  { key: 'goSchedule', label: 'Go to Calendar' },
  { key: 'search', label: 'Search and add a movie' },
  { key: 'addMovie', label: 'Add movie to list' },
  { key: 'settings', label: 'Open settings' },
  { key: 'toggleTrash', label: 'Open Trash' },
];

const POSTER_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'extra-large', label: 'Extra large' },
];

function Row({ title, description, children }) {
  return (
    <div className="st-row">
      <div className="st-row__text">
        <h3 className="st-row__title">{title}</h3>
        {description && <p className="st-row__desc">{description}</p>}
      </div>
      <div className="st-row__control">{children}</div>
    </div>
  );
}

function Segments({ label, value, options, onChange }) {
  return (
    <div className="st-segs" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`st-seg ${value === o.id ? 'is-on' : ''}`}
          aria-pressed={value === o.id}
          disabled={o.disabled}
          onClick={() => onChange?.(o.id)}
        >
          {o.label}
          {o.badge && <small>{o.badge}</small>}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="st-switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export default function SettingsModal({
  isOpen,
  onClose,
  shortcuts = DEFAULT_SHORTCUTS,
  onSaveShortcuts,
  onResetShortcuts,
  prefs,
  onPrefsChange,
  onClearDiscoverHistory,
}) {
  const [section, setSection] = useState('appearance');
  const [recording, setRecording] = useState(null);
  const [conflict, setConflict] = useState('');
  const [historyCleared, setHistoryCleared] = useState(false);
  const closeRef = useRef(null);

  // Capture the next key combination for the shortcut being edited
  useEffect(() => {
    if (!recording) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        setConflict('');
        return;
      }
      const combo = shortcutFromEvent(e);
      if (!combo) return;

      const clash = SHORTCUT_ROWS.find(
        (r) => r.key !== recording && (shortcuts[r.key] || DEFAULT_SHORTCUTS[r.key]) === combo,
      );
      if (clash) {
        setConflict(`${formatShortcut(combo)} is already used for "${clash.label}".`);
        return;
      }
      onSaveShortcuts?.({ ...shortcuts, [recording]: combo });
      setRecording(null);
      setConflict('');
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording, shortcuts, onSaveShortcuts]);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
    else {
      setRecording(null);
      setConflict('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const current = SECTIONS.find((s) => s.id === section) || SECTIONS[0];

  return (
    <div
      className="st-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="st" role="dialog" aria-modal="true" aria-label="Settings">
        <aside className="st__nav">
          <div className="st__nav-head">
            <h1 className="st__title">Settings</h1>
            <button ref={closeRef} type="button" className="st__close" aria-label="Close settings" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <nav aria-label="Settings sections" className="st__nav-list">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`st-nav ${section === id ? 'is-on' : ''}`}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
              >
                <Icon size={18} />{label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="st__content">
          <div className="st__content-inner">
            <h2 className="st__page-title">{current.label}</h2>
            <p className="st__page-sub">{current.subtitle}</p>

            {section === 'appearance' && (
              <div className="st-rows">
                <Row title="Theme" description="Dark is the only theme for now. Light and System are on the way.">
                  <Segments
                    label="Theme"
                    value="dark"
                    options={[
                      { id: 'dark', label: 'Dark' },
                      { id: 'light', label: 'Light', badge: 'Soon', disabled: true },
                    ]}
                  />
                </Row>
                <Row
                  title="Accent colour"
                  description="Used for buttons, active markers, chips and highlights across the app. Star ratings stay yellow."
                >
                  <div className="st-swatches" role="group" aria-label="Accent colour">
                    {Object.entries(ACCENTS).map(([id, a]) => (
                      <button
                        key={id}
                        type="button"
                        className={`st-swatch ${prefs.accent === id ? 'is-on' : ''}`}
                        style={{ '--swatch': a.accent }}
                        aria-label={a.label}
                        aria-pressed={prefs.accent === id}
                        title={a.label}
                        onClick={() => onPrefsChange({ accent: id })}
                      />
                    ))}
                  </div>
                </Row>
                <Row title="Poster size" description="How large movie cards are in Library.">
                  <Segments
                    label="Poster size"
                    value={prefs.cardSize}
                    options={POSTER_SIZES}
                    onChange={(id) => onPrefsChange({ cardSize: id })}
                  />
                </Row>
              </div>
            )}

            {section === 'shortcuts' && (
              <div className="st-rows">
                {SHORTCUT_ROWS.map((row) => {
                  const isRecording = recording === row.key;
                  return (
                    <Row key={row.key} title={row.label}>
                      {isRecording ? (
                        <span className="st-key st-key--recording">Press keys…</span>
                      ) : (
                        <span className="st-key">{formatShortcut(shortcuts[row.key] || DEFAULT_SHORTCUTS[row.key])}</span>
                      )}
                      <button
                        type="button"
                        className="st-btn"
                        onClick={() => { setConflict(''); setRecording(isRecording ? null : row.key); }}
                      >
                        {isRecording ? 'Cancel' : 'Edit'}
                      </button>
                    </Row>
                  );
                })}
                {conflict && <p className="st-warn" role="alert">{conflict}</p>}
                <div className="st-actions">
                  <button type="button" className="st-btn" onClick={onResetShortcuts}>Reset to defaults</button>
                </div>
              </div>
            )}

            {section === 'discover' && (
              <div className="st-rows">
                <Row title="Default number of movies" description="How many movies each Recommend press draws. You can still change it on the page.">
                  <div className="st-step" role="group" aria-label="Default number of movies">
                    <button
                      type="button"
                      className="st-step__btn"
                      aria-label="Fewer"
                      disabled={prefs.discoverCount <= 1}
                      onClick={() => onPrefsChange({ discoverCount: clampCount(prefs.discoverCount - 1) })}
                    >
                      <Minus size={16} />
                    </button>
                    <span className="st-step__num" aria-live="polite">{prefs.discoverCount}</span>
                    <button
                      type="button"
                      className="st-step__btn"
                      aria-label="More"
                      disabled={prefs.discoverCount >= 20}
                      onClick={() => onPrefsChange({ discoverCount: clampCount(prefs.discoverCount + 1) })}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </Row>
                <Row title="Default source" description="Where recommendations come from when you open the app.">
                  <Segments
                    label="Default source"
                    value={prefs.discoverSource}
                    options={[{ id: 'library', label: 'Library' }, { id: 'web', label: 'Web' }]}
                    onChange={(id) => onPrefsChange({ discoverSource: id })}
                  />
                </Row>
                <Row title="Keep round history" description="Shows past rounds in the sidebar and a faded row under the cards. Turn off for a cleaner page.">
                  <Switch label="Keep round history" checked={prefs.keepHistory} onChange={(v) => onPrefsChange({ keepHistory: v })} />
                </Row>
                <Row title="Show active filters under the input" description="Displays your applied filters as chips above the Recommend button.">
                  <Switch label="Show active filters under the input" checked={prefs.showFilterChips} onChange={(v) => onPrefsChange({ showFilterChips: v })} />
                </Row>
                <Row title="Clear round history" description="Removes past rounds and the seen list, and starts a fresh bag. Your shortlist is kept.">
                  <button
                    type="button"
                    className="st-btn"
                    onClick={() => { onClearDiscoverHistory?.(); setHistoryCleared(true); setTimeout(() => setHistoryCleared(false), 2000); }}
                  >
                    {historyCleared ? 'Cleared' : 'Clear history'}
                  </button>
                </Row>
              </div>
            )}

            {section === 'calendar' && (
              <div className="st-rows">
                <Row title="Show list on events" description="Display which list a scheduled movie belongs to on its Agenda card.">
                  <Switch label="Show list on events" checked={prefs.showEventList} onChange={(v) => onPrefsChange({ showEventList: v })} />
                </Row>
                <Row title="Show watch status on events" description="Display Plan to Watch / Watching / Completed / Dropped on its Agenda card.">
                  <Switch label="Show watch status on events" checked={prefs.showEventStatus} onChange={(v) => onPrefsChange({ showEventStatus: v })} />
                </Row>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
