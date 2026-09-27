// Keyboard shortcut helpers. Shortcuts are stored as strings like "Ctrl+Shift+1".

export const DEFAULT_SHORTCUTS = {
  toggleSidebar: 'Alt+B',
  toggleFilters: 'Ctrl+Alt+B',
  goLibrary: 'Ctrl+Shift+1',
  goDiscover: 'Ctrl+Shift+2',
  search: 'Ctrl+K',
  addMovie: 'Alt+N',
  settings: 'Ctrl+,',
};

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

  if (wantCtrl !== e.ctrlKey) return false;
  if (wantAlt !== e.altKey) return false;
  if (wantShift !== e.shiftKey) return false;
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
