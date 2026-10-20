// Keyboard shortcut helpers. Shortcuts are stored as strings like "Ctrl+Shift+1".

export const DEFAULT_SHORTCUTS = {
  // General: work everywhere
  settings: 'Ctrl+,',
  toggleTrash: 'Ctrl+Shift+Backspace',
  goLibrary: 'Ctrl+Shift+1',
  goDiscover: 'Ctrl+Shift+2',
  goSchedule: 'Ctrl+Shift+3',
  toggleSidebar: 'Alt+B',
  // Library
  addMovie: 'N',
  focusSearch: '/',
  cardSmall: 'Ctrl+Shift+S',
  cardMedium: 'Ctrl+Shift+M',
  cardLarge: 'Ctrl+Shift+L',
  cardExtraLarge: 'Ctrl+Shift+X',
  // Discover
  toggleFilters: 'Ctrl+Alt+B',
  // Calendar
  calWeek: 'W',
  calMonth: 'M',
  calAgenda: 'A',
  calPrev: 'P',
  calNext: 'N',
  toggleLibraryPanel: 'Ctrl+Alt+B',
};

// How Settings groups the shortcuts. A section's shortcuts only fire while that section is
// open, so two sections may share a key (Library and Calendar both use N); General and
// Navigation shortcuts work everywhere and so must not collide with anything.
const GLOBAL_GROUPS = ['general', 'navigation'];
export const SHORTCUT_GROUPS = [
  {
    id: 'general',
    label: 'General',
    rows: [
      { key: 'toggleSidebar', label: 'Toggle left sidebar' },
      { key: 'settings', label: 'Open settings' },
      { key: 'toggleTrash', label: 'Open Trash' },
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    rows: [
      { key: 'goLibrary', label: 'Go to Library' },
      { key: 'goDiscover', label: 'Go to Discover' },
      { key: 'goSchedule', label: 'Go to Calendar' },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    rows: [
      { key: 'addMovie', label: 'Add a movie' },
      { key: 'focusSearch', label: 'Search this list' },
      { key: 'cardSmall', label: 'Small posters' },
      { key: 'cardMedium', label: 'Medium posters' },
      { key: 'cardLarge', label: 'Large posters' },
      { key: 'cardExtraLarge', label: 'Extra large posters' },
    ],
  },
  {
    id: 'discover',
    label: 'Discover',
    rows: [
      { key: 'toggleFilters', label: 'Toggle filters panel' },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    rows: [
      { key: 'calWeek', label: 'Week view' },
      { key: 'calMonth', label: 'Month view' },
      { key: 'calAgenda', label: 'Agenda view' },
      { key: 'calPrev', label: 'Previous week or month' },
      { key: 'calNext', label: 'Next week or month' },
      { key: 'toggleLibraryPanel', label: 'Toggle library panel' },
    ],
  },
];

/** The shortcut that `combo` would clash with if assigned to `actionKey`, or null. */
export function findShortcutConflict(shortcuts, actionKey, combo) {
  const groupOf = (key) => SHORTCUT_GROUPS.find((g) => g.rows.some((r) => r.key === key))?.id;
  const ownGroup = groupOf(actionKey);
  for (const group of SHORTCUT_GROUPS) {
    const overlaps = GLOBAL_GROUPS.includes(ownGroup) || GLOBAL_GROUPS.includes(group.id) || group.id === ownGroup;
    if (!overlaps) continue;
    for (const row of group.rows) {
      if (row.key === actionKey) continue;
      if ((shortcuts[row.key] || DEFAULT_SHORTCUTS[row.key]) === combo) return { ...row, group: group.label };
    }
  }
  return null;
}

/** Saved shortcuts merged over the defaults. Anyone still on the old Alt+N for Add movie moves to the new N default. */
export function loadShortcuts(saved) {
  const merged = { ...DEFAULT_SHORTCUTS, ...(saved || {}) };
  if (saved?.addMovie === 'Alt+N') merged.addMovie = DEFAULT_SHORTCUTS.addMovie;
  return merged;
}

/** True for single-key shortcuts (no Ctrl/Alt/Cmd), which must not fire while typing in a field. */
export function isBareKey(shortcut) {
  const parts = (shortcut || '').split('+');
  return !parts.some((p) => p === 'Ctrl' || p === 'Alt' || p === 'Cmd' || p === 'Meta');
}

export function isTypingTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

// With Shift held, e.key for the number row is "!" or "@" and Alt can change
// letters on some layouts, so single letters and digits are matched by
// physical key (e.code) as well.
function codeFor(target) {
  if (/^[0-9]$/.test(target)) return `Digit${target}`;
  if (/^[a-z]$/.test(target)) return `Key${target.toUpperCase()}`;
  return null;
}

export function matchesShortcut(e, shortcut) {
  if (!shortcut) return false;
  const parts = shortcut.split('+');
  const target = parts[parts.length - 1].toLowerCase();

  const wantCtrl = parts.includes('Ctrl');
  const wantAlt = parts.includes('Alt');
  const wantShift = parts.includes('Shift');
  const wantMeta = parts.includes('Cmd') || parts.includes('Meta');

  // Punctuation like "/" needs Shift on some keyboard layouts, so an unshifted
  // punctuation shortcut also matches when Shift happens to be held
  const shiftAgnostic = !wantShift && target.length === 1 && !/[a-z0-9]/.test(target);

  if (wantCtrl !== e.ctrlKey) return false;
  if (wantAlt !== e.altKey) return false;
  if (wantShift !== e.shiftKey && !shiftAgnostic) return false;
  if (wantMeta !== e.metaKey) return false;

  const key = e.key.toLowerCase();
  if (target === 'space') return key === ' ';
  if (key === target) return true;
  const code = codeFor(target);
  return code !== null && e.code === code;
}

/** Turn a keydown event into a shortcut string, or null for a lone modifier. */
export function shortcutFromEvent(e) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;

  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Cmd');

  let key;
  if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (e.key === ' ') key = 'Space';
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;

  parts.push(key);
  return parts.join('+');
}

export function formatShortcut(shortcut) {
  return (shortcut || '').split('+').join(' + ');
}
