import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

/**
 * A failure thrown by the image engine, or by App-level logic.
 *
 * Renders as a toast fixed to the bottom of the viewport with
 * `role="alert"` rather than inline in document flow -- ported from
 * budget_planner's `CalcError.jsx`, adapted for `postcard-wasm`'s
 * `process_photo` throwing a `Message`-shaped value instead of returning
 * an `{ error, error_message }` envelope (see `photo.rs`'s doc comment
 * for why that binding is shaped differently).
 */
export default function ErrorToast({ error }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [error]);

  if (!error || dismissed) return null;

  const message = error.code ? t(`errors.${suffixOf(error.code)}`, error.params) : error.text;

  return (
    <div className="toast-region" aria-live="assertive">
      <div className="toast" role="alert">
        <span className="toast-message">{message || error.text}</span>
        <button
          className="toast-dismiss"
          onClick={() => setDismissed(true)}
          aria-label={t('errors.dismiss')}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// `err.unreadableImage` -> `unreadableImage`, matching this catalog's own
// `errors.*` key naming (no `err.` prefix on the JS side).
function suffixOf(code) {
  return code.startsWith('err.') ? code.slice(4) : code;
}
