// Small localStorage helpers and the user preferences shared by Settings and Discover.

// Each accent has a deeper `light` variant so text and fills keep their contrast on a white page
export const ACCENTS = {
  violet: { label: 'Violet', accent: '#a394f5', on: '#17151f', light: { accent: '#6e5ce6', on: '#ffffff' } },
  gold: { label: 'Gold', accent: '#f5c518', on: '#0a0a0a', light: { accent: '#a57a00', on: '#ffffff' } },
  teal: { label: 'Teal', accent: '#4fb8ac', on: '#0f1f1d', light: { accent: '#1b857a', on: '#ffffff' } },
  rose: { label: 'Rose', accent: '#e5788d', on: '#25111a', light: { accent: '#c8466a', on: '#ffffff' } },
  clay: { label: 'Clay', accent: '#d97757', on: '#1b1b1a', light: { accent: '#bf5530', on: '#ffffff' } },
};

export const THEMES = ['dark', 'light', 'system'];

export const DEFAULT_PREFS = {
  theme: 'dark',
  accent: 'violet',
  discoverCount: 5,
  discoverSource: 'library',
  keepHistory: true,
  showFilterChips: true,
  cardSize: 'medium',
  includeTv: false, // Add dialog also searches TV shows
  filtersOpen: false,
  showEventList: true,
  showEventStatus: false,
};

const PREFS_KEY = 'cinetrack_prefs';

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or quota: the app still works, it just won't remember
  }
}

export function loadPrefs() {
  return { ...DEFAULT_PREFS, ...loadJson(PREFS_KEY, {}) };
}

export function savePrefs(prefs) {
  saveJson(PREFS_KEY, prefs);
}

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/** 'dark' or 'light': what a theme preference shows right now ('system' follows the OS). */
export function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  if (theme === 'system') return window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light';
  return DEFAULT_PREFS.theme;
}

/** Call `onChange` whenever the OS switches between light and dark; returns an unsubscribe. */
export function watchSystemTheme(onChange) {
  const mql = window.matchMedia(SYSTEM_DARK_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Switch the app's colour tokens (index.css :root[data-theme]) to the resolved theme. */
export function applyTheme(resolved) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  // Phone browsers tint their toolbar with this
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f5f5f7' : '#121212');
}

/** Point the app-wide accent variables at the chosen colour, in its variant for the theme. */
export function applyAccent(id, resolvedTheme = 'dark') {
  const a = ACCENTS[id] || ACCENTS[DEFAULT_PREFS.accent];
  const v = resolvedTheme === 'light' ? a.light : a;
  const root = document.documentElement.style;
  root.setProperty('--accent', v.accent);
  root.setProperty('--on-accent', v.on);
}
