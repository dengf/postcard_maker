import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, applyTheme, loadTheme, saveTheme } from './theme';

// jsdom has no `matchMedia`, which is exactly the shape `applyTheme` has to
// survive: it reaches for it only through `?.`, so a missing implementation
// resolves to "not light" rather than throwing. That makes 'system' here
// behave like a dark-preferring device, which is what the assertions below
// assume.

// This repo's jsdom has no `localStorage` -- on `window` or as a bare
// global -- so without a stand-in every read and write below would land in
// theme.js's catch block and the round-trip test would silently pass by
// always returning the default.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => {
  store.clear();
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = '<meta name="theme-color" id="theme-color-meta" content="#0f1720">';
});

const meta = () => document.getElementById('theme-color-meta').getAttribute('content');

describe('theme preference', () => {
  it('defaults to following the OS', () => {
    expect(loadTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe('system');
  });

  it('round-trips a stored choice', () => {
    saveTheme('dark');
    expect(loadTheme()).toBe('dark');
  });

  it('falls back to the default rather than trusting a stray value', () => {
    localStorage.setItem('pc:theme', 'sepia');
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });

  it('offers exactly system, light and dark', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark']);
  });
});

describe('applyTheme', () => {
  it('stamps an explicit choice on the root element', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  // The media query in main.css only takes over when the attribute is gone
  // entirely -- `data-theme="system"` would match neither guard and leave
  // whichever theme was last stamped in place.
  it('clears the attribute for system, rather than stamping "system"', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('keeps the browser-chrome colour in step with the choice', () => {
    applyTheme('light');
    expect(meta()).toBe('#f8f6f5');
    applyTheme('dark');
    expect(meta()).toBe('#0f1720');
  });

  it('does not throw when the meta tag is missing', () => {
    document.head.innerHTML = '';
    expect(() => applyTheme('light')).not.toThrow();
  });
});
