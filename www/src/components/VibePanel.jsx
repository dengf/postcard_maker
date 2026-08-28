import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { suggestVibe } from '../vibe';
import { buildCandidates } from '../vibeSuggestions';
import { captionFor } from '../vibeCaptions';

const VISIBLE_COUNT = 3;

/**
 * "Suggest a look" -- see CLAUDE.md for the full architecture. Never
 * downloads the model until this button is tapped; never blocks editing
 * if the analysis is slow, fails, or has nothing to suggest.
 *
 * Shows up to `VISIBLE_COUNT` look candidates at once (built from the
 * model's own top matched vibes plus each vibe's alternate look), with a
 * "Try other ideas" button that rotates the window over the rest of the
 * candidate pool rather than re-running the model -- classification only
 * ever runs once per tap.
 */
export default function VibePanel({ photoBytes, onApply, onSetMessage, onError }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState('idle'); // idle | loading | result | empty
  const [candidates, setCandidates] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [topVibe, setTopVibe] = useState(null);

  const runSuggest = async () => {
    setPhase('loading');
    try {
      const result = await suggestVibe(photoBytes);
      if (result?.error) {
        onError(result.error_message ?? { text: result.error });
        setPhase('idle');
        return;
      }
      const matches = result?.matches ?? [];
      if (matches.length === 0) {
        setPhase('empty');
        return;
      }
      setCandidates(buildCandidates(matches));
      setCursor(0);
      setTopVibe(matches[0].vibe);
      setPhase('result');
    } catch (err) {
      onError({ text: err?.message ?? String(err) });
      setPhase('idle');
    }
  };

  const visible = useMemo(() => {
    if (candidates.length === 0) return [];
    const out = [];
    for (let i = 0; i < Math.min(VISIBLE_COUNT, candidates.length); i += 1) {
      out.push(candidates[(cursor + i) % candidates.length]);
    }
    return out;
  }, [candidates, cursor]);

  const apply = (candidate) => {
    onApply(candidate.filter, candidate.sticker);
    setPhase('idle');
  };

  const shuffle = () => setCursor((c) => (c + VISIBLE_COUNT) % candidates.length);

  const dismiss = () => setPhase('idle');

  const caption = topVibe ? captionFor(topVibe) : null;
  const useCaption = () => {
    if (caption) onSetMessage(t(caption));
  };

  return (
    <div className="panel vibe-panel">
      <button type="button" className="btn secondary" onClick={runSuggest} disabled={phase === 'loading'}>
        {phase === 'loading' ? t('vibe.analyzing') : t('vibe.suggest')}
      </button>

      {phase === 'result' && visible.length > 0 && (
        <div className="vibe-results">
          {visible.map((c, i) => (
            <div className="vibe-chip" key={`${c.vibe}-${c.labelKey}-${i}`}>
              <span>{t(c.labelKey)}</span>
              <div className="vibe-chip-actions">
                <button type="button" className="btn" onClick={() => apply(c)}>
                  {t('vibe.apply')}
                </button>
              </div>
            </div>
          ))}

          <div className="vibe-panel-actions">
            {candidates.length > VISIBLE_COUNT && (
              <button type="button" className="btn ghost" onClick={shuffle}>
                {t('vibe.shuffle')}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={dismiss}>
              {t('vibe.dismiss')}
            </button>
          </div>

          {caption && (
            <div className="vibe-caption">
              <p className="text-option-note">{t(caption)}</p>
              <button type="button" className="btn ghost" onClick={useCaption}>
                {t('vibe.useCaption')}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'empty' && <p className="text-option-note">{t('vibe.noSuggestion')}</p>}
    </div>
  );
}
