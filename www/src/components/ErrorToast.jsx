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

  // `error.text` is the wasm boundary's English fallback; `error.message`
  // is what a plain JS `Error` carries, and it was missing from this chain
  // -- so any `setError(new Error(...))` rendered a toast with a dismiss
  // button and no words in it at all. An unreadable photo was the live
  // case: the toast appeared, said nothing, and left the user on the intro
  // with no idea what had happened. A coded error is still preferred over
  // any of these; the raw message is the last resort before the generic
  // line, since it's the only rung of this ladder that isn't translated.
  const message = error.code
    ? t(`errors.${suffixOf(error.code)}`, error.params)
    : error.text || error.message;

  return (
    <div className="toast-region" aria-live="assertive">
      <div className="toast" role="alert">
        <span className="toast-message">{message || t('errors.unknown')}</span>
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
