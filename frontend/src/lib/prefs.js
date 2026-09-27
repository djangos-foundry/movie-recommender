// Small localStorage helpers and the user preferences shared by Settings and Discover.

export const ACCENTS = {
  violet: { label: 'Violet', accent: '#a394f5', on: '#17151f', soft: 'rgba(163, 148, 245, 0.16)' },
  gold: { label: 'Gold', accent: '#f5c518', on: '#0a0a0a', soft: 'rgba(245, 197, 24, 0.15)' },
  teal: { label: 'Teal', accent: '#4fb8ac', on: '#0f1f1d', soft: 'rgba(79, 184, 172, 0.16)' },
  rose: { label: 'Rose', accent: '#e5788d', on: '#25111a', soft: 'rgba(229, 120, 141, 0.16)' },
  clay: { label: 'Clay', accent: '#d97757', on: '#1b1b1a', soft: 'rgba(217, 119, 87, 0.16)' },
};

export const DEFAULT_PREFS = {
  accent: 'violet',
  discoverCount: 5,
  discoverSource: 'library',
  keepHistory: true,
  showFilterChips: true,
  cardSize: 'medium',
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

/** Point the app-wide accent variables at the chosen colour. */
export function applyAccent(id) {
  const a = ACCENTS[id] || ACCENTS[DEFAULT_PREFS.accent];
  const root = document.documentElement.style;
  root.setProperty('--accent', a.accent);
  root.setProperty('--on-accent', a.on);
}
