import React, { useEffect, useState } from 'react';
import { LOCALES, useI18n } from '../i18n';
import { applyTheme, loadTheme, saveTheme } from '../theme';
import MeifioMark from './MeifioMark';
import { meifioHome } from '../meifioHome';

export default function Header() {
  const { t, locale, setLocale } = useI18n();

  // Theme state lives here rather than in App, as it does in
  // budget_planner: App renders <Header /> in two separate branches (the
  // engine-unavailable screen and the editor), and nothing else in the
  // tree reads the theme. Keeping it local means the picker also works on
  // the screen someone lands on when the wasm module fails to load --
  // which is exactly the screen they may sit on longest.
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // `applyTheme` also keeps the theme-color meta in step, and in 'system'
  // that value depends on the OS preference, which can change while the
  // tab is open. The CSS follows on its own (it's a media query); this is
  // only here so the browser chrome doesn't keep the stale color.
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const changeTheme = (next) => {
    setTheme(next);
    saveTheme(next);
  };

  return (
    <header className="app-header">
      <div className="app-brand">
        <h1 className="app-title">{t('app.title')}</h1>
        <a className="app-byline" href={meifioHome(locale)}>
          {t('app.byline')
            .split('{logo}')
            .flatMap((part, i) => (i === 0 ? [part] : [<MeifioMark key="mark" />, part]))}
        </a>
      </div>

      <div className="app-switches">
        <select
          id="app-language"
          className="app-select"
          aria-label={t('app.language')}
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        >
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <select
          id="app-theme"
          className="app-select"
          aria-label={t('app.theme')}
          value={theme}
          onChange={(e) => changeTheme(e.target.value)}
        >
          <option value="system">{t('app.themeSystem')}</option>
          <option value="light">{t('app.themeLight')}</option>
          <option value="dark">{t('app.themeDark')}</option>
        </select>
      </div>
    </header>
  );
}
