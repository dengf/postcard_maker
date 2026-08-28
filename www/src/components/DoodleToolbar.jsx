import React from 'react';
import { useI18n } from '../i18n';

const COLORS = ['#e0355b', '#241a1e', '#ffffff', '#3a8bc4', '#f2b705'];
const WIDTHS = [2, 4, 8];

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
      <button type="button" className={drawMode ? 'btn' : 'btn secondary'} onClick={onToggleDrawMode}>
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
                    key={c}
                    type="button"
                    className={c === strokeColor ? 'text-color-swatch active' : 'text-color-swatch'}
                    style={{ background: c }}
                    aria-label={c}
                    onClick={() => onStrokeColorChange(c)}
                  />
                ))}
              </div>
            </div>
            <div className="text-option-group">
              <span className="text-option-label">{t('doodle.brushSize')}</span>
              <div className="text-option-buttons">
                {WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={w === strokeWidth ? 'active' : ''}
                    onClick={() => onStrokeWidthChange(w)}
                  >
                    {w}
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
