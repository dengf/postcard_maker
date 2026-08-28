import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { generateCaption } from '../caption';

/**
 * "Write a caption for me" -- a real, on-device generated caption (see
 * `postcard_calc::caption`'s own doc comment for the model and the real
 * findings behind it), deliberately a separate action from "Suggest a
 * look" rather than folded into it: this downloads ~139MB the first time
 * it's tapped, next to "Suggest a look"'s combined ~11MB, and nobody
 * should get that without asking for it by name. The size is stated up
 * front in the button's own label, not hidden until the download starts.
 */
export default function CaptionPanel({ photoBytes, onSetMessage, onError }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState('idle'); // idle | loading | result
  const [progress, setProgress] = useState(null);
  const [caption, setCaption] = useState(null);

  const run = async () => {
    setPhase('loading');
    setProgress(null);
    try {
      const result = await generateCaption(photoBytes, setProgress);
      if (result?.error || !result?.caption) {
        onError(result?.error_message ?? { text: result?.error ?? 'no caption generated' });
        setPhase('idle');
        return;
      }
      setCaption(result.caption.trim());
      setPhase('result');
    } catch (err) {
      onError({ text: err?.message ?? String(err) });
      setPhase('idle');
    }
  };

  const useCaption = () => {
    if (caption) onSetMessage(caption);
    setPhase('idle');
  };

  const dismiss = () => setPhase('idle');

  return (
    <div className="panel caption-panel">
      <h2>{t('caption.heading')}</h2>
      {phase === 'idle' && <p className="text-option-note">{t('caption.sizeNote')}</p>}

      <button type="button" className="btn secondary" onClick={run} disabled={phase === 'loading'}>
        {phase === 'loading'
          ? progress != null
            ? t('caption.loadingProgress', { percent: Math.round(progress * 100) })
            : t('caption.loading')
          : t('caption.write')}
      </button>

      {phase === 'loading' && (
        <div
          className="vibe-progress-track"
          role="progressbar"
          aria-label={t('caption.loading')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress != null ? Math.round(progress * 100) : undefined}
        >
          <div
            className={progress != null ? 'vibe-progress-fill' : 'vibe-progress-fill indeterminate'}
            style={progress != null ? { width: `${Math.max(6, progress * 100)}%` } : undefined}
          />
        </div>
      )}

      {phase === 'result' && caption && (
        <div className="vibe-caption">
          <p className="text-option-note">{caption}</p>
          <div className="vibe-panel-actions">
            <button type="button" className="btn" onClick={useCaption}>
              {t('vibe.useCaption')}
            </button>
            <button type="button" className="btn ghost" onClick={dismiss}>
              {t('vibe.dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
