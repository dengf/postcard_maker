import React from 'react';
import { useI18n } from '../i18n';

// Named, not bare values: a swatch button's only content is its own
// background color and a brush button's is a bare number, so `2` and
// `#3a8bc4` were all a screen reader or a voice-control user had to go
// on. Same shape `TextPanel`'s own color row already uses.
const COLORS = [
  { value: '#e0355b', key: 'rose' },
  { value: '#241a1e', key: 'ink' },
  { value: '#ffffff', key: 'white' },
  { value: '#3a8bc4', key: 'blue' },
  { value: '#f2b705', key: 'amber' },
];
const WIDTHS = [
  { value: 2, key: 'thin' },
  { value: 4, key: 'medium' },
  { value: 8, key: 'thick' },
];

export default function DoodleToolbar({
  drawMode,
  onToggleDrawMode,
  strokeColor,
  onStrokeColorChange,
  strokeWidth,
  onStrokeWidthChange,
  hasStrokes,
  onUndo,
  onClear,
}) {
  const { t } = useI18n();
  return (
    <div className="panel">
      <h2>{t('doodle.heading')}</h2>
      <button
        type="button"
        className={drawMode ? 'btn' : 'btn secondary'}
        onClick={onToggleDrawMode}
      >
        {drawMode ? t('doodle.drawingOn') : t('doodle.draw')}
      </button>

      {drawMode && (
        <>
          <div className="text-row">
            <div className="text-option-group">
              <span className="text-option-label">{t('text.color')}</span>
              <div className="text-option-buttons">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={
                      c.value === strokeColor ? 'text-color-swatch active' : 'text-color-swatch'
                    }
                    style={{ background: c.value }}
                    aria-label={t(`doodle.color.${c.key}`)}
                    aria-pressed={c.value === strokeColor}
                    onClick={() => onStrokeColorChange(c.value)}
                  />
                ))}
              </div>
            </div>
            <div className="text-option-group">
              <span className="text-option-label">{t('doodle.brushSize')}</span>
              <div className="text-option-buttons">
                {WIDTHS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    className={w.value === strokeWidth ? 'active' : ''}
                    // The number stays in the name as well as on screen:
                    // an accessible name that drops the visible label is
                    // what makes "click 4" fail for a voice-control user
                    // (WCAG 2.5.3), and the word is the half that
                    // actually means something.
                    aria-label={`${t(`doodle.brushSize.${w.key}`)} (${w.value})`}
                    aria-pressed={w.value === strokeWidth}
                    onClick={() => onStrokeWidthChange(w.value)}
                  >
                    {w.value}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="share-actions">
            <button type="button" className="btn ghost" onClick={onUndo} disabled={!hasStrokes}>
              {t('doodle.undo')}
            </button>
            <button type="button" className="btn ghost" onClick={onClear} disabled={!hasStrokes}>
              {t('doodle.clear')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
