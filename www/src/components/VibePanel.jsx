import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { suggestVibe } from '../vibe';
import { suggestionFor } from '../vibeSuggestions';

/**
 * "Suggest a look" -- see CLAUDE.md for the full architecture. Never
 * downloads the model until this button is tapped; never blocks editing
 * if the analysis is slow, fails, or has nothing to suggest.
 */
export default function VibePanel({ photoBytes, onApply, onError }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState('idle'); // idle | loading | result | empty
  const [suggestion, setSuggestion] = useState(null);

  const runSuggest = async () => {
    setPhase('loading');
    try {
      const result = await suggestVibe(photoBytes);
      if (result?.error) {
        onError(result.error_message ?? { text: result.error });
        setPhase('idle');
        return;
      }
      if (!result?.vibe) {
        setPhase('empty');
        return;
      }
      setSuggestion(suggestionFor(result.vibe));
      setPhase('result');
    } catch (err) {
      onError({ text: err?.message ?? String(err) });
      setPhase('idle');
    }
  };

  const apply = () => {
    if (suggestion) onApply(suggestion.filter, suggestion.sticker);
    setPhase('idle');
  };

  const dismiss = () => setPhase('idle');

  return (
    <div className="panel vibe-panel">
      <button type="button" className="btn secondary" onClick={runSuggest} disabled={phase === 'loading'}>
        {phase === 'loading' ? t('vibe.analyzing') : t('vibe.suggest')}
      </button>

      {phase === 'result' && suggestion && (
        <div className="vibe-chip">
          <span>{t(suggestion.labelKey)}</span>
          <div className="vibe-chip-actions">
            <button type="button" className="btn" onClick={apply}>
              {t('vibe.apply')}
            </button>
            <button type="button" className="btn ghost" onClick={dismiss}>
              {t('vibe.dismiss')}
            </button>
          </div>
        </div>
      )}

      {phase === 'empty' && <p className="text-option-note">{t('vibe.noSuggestion')}</p>}
    </div>
  );
}
