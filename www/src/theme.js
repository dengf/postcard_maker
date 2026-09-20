// The color theme is a stored preference (localStorage), the same
// host-layer carve-out draftStore.js already draws: it's a display choice
// the person makes for themselves, with no image math in it for
// postcard-calc to own. 'system' (the default) means "no opinion, follow
// the OS" -- this app already did exactly that via a plain
// `prefers-color-scheme` media query before this file existed, and stays
// that way unless someone picks 'light' or 'dark' explicitly.
//
// Ported from budget_planner's own `theme.js`, down to the three-value
// enum and the `data-theme` stamping, so the two tools behave the same
// way. The storage key is this app's own (`pc:`, matching i18n's
// `pc:locale`) -- they're separate origins in production but share one
// during local development.

const STORAGE_KEY = 'pc:theme';
export const THEMES = ['system', 'light', 'dark'];
export const DEFAULT_THEME = 'system';

// Kept in step with main.css's `--bg` in each theme, and with the
// matching literals in index.html's inline script (which can't import
// this module -- see its own comment).
const DARK_BG = '#0f1720';
const LIGHT_BG = '#f8f6f5';

export function loadTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in private mode; the preference just
    // won't survive the tab, and the session still switches.
  }
}

/**
 * Stamps (or clears) `data-theme` on the root element, which is what
 * main.css's `:root[data-theme='light']` rule keys off to override the
 * `prefers-color-scheme` default, and what its media query's own
 * `:not([data-theme='dark'])` guard keys off to get out of the way.
 * Clearing the attribute for 'system' is what lets the media query take
 * over again.
 *
 * `index.html` runs this same logic inline and synchronously before first
 * paint -- see its own comment for why that copy has to exist separately
 * rather than importing this one.
 */
export function applyTheme(theme) {
  const root = document?.documentElement;
  if (!root) return;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }

  // Mobile browser chrome (the address bar strip) re-reads this on every
  // change, not only at page load. index.html's inline script sets it for
  // first paint; this keeps it in sync afterwards, whenever the picker in
  // Header changes theme.
  const isLight =
    theme === 'light' ||
    (theme !== 'dark' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document
    .getElementById('theme-color-meta')
    ?.setAttribute('content', isLight ? LIGHT_BG : DARK_BG);
}
