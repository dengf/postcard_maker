import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

/**
 * A promise-based replacement for `window.confirm()` -- ported from
 * budget_planner's identical component. `window.confirm` isn't available
 * in every context this app renders in, and a native browser dialog can't
 * be styled or translated.
 */
export function useConfirm() {
  const [state, setState] = useState(null); // { message, confirmLabel, resolve }
  const resolverRef = useRef(null);

  const confirm = useCallback((message, confirmLabel) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ message, confirmLabel });
    });
  }, []);

  const answer = useCallback((value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(null);
  }, []);

  const dialog = state ? (
    <ConfirmDialogView
      message={state.message}
      confirmLabel={state.confirmLabel}
      onAnswer={answer}
    />
  ) : null;

  return [confirm, dialog];
}

function ConfirmDialogView({ message, confirmLabel, onAnswer }) {
  const { t } = useI18n();

  // Escape answers "no", the same as the backdrop and Cancel already do.
  // A modal that can only be dismissed by aiming at one of three targets
  // is the kind of dead end that makes people reach for the browser's
  // Back button -- and every question this dialog asks ("throw the card
  // away?") has a destructive Yes sitting under `autoFocus`.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onAnswer(false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onAnswer]);

  return (
    <div className="confirm-backdrop" role="presentation" onClick={() => onAnswer(false)}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-message" id="confirm-message">
          {message}
        </p>
        <div className="confirm-actions">
          <button className="btn secondary" onClick={() => onAnswer(false)}>
            {t('confirm.cancel')}
          </button>
          <button className="btn danger" onClick={() => onAnswer(true)} autoFocus>
            {confirmLabel ?? t('confirm.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
