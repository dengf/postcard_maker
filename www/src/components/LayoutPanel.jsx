import React from 'react';
import { useI18n } from '../i18n';
import CollapsiblePanel from './CollapsiblePanel';

const COVERAGES = ['full', 'half', 'bigSmall'];
const FILLS = ['auto', 'solid', 'blur'];
const FILL_COLORS = ['#f4ede0', '#ffffff', '#241a1e', '#B01243', '#d9b46a'];

// Landscape splits left/right; Square and Portrait split top/bottom --
// same per-aspect axis convention `postcard-calc::template`'s collage
// layouts already use (see App.jsx/photoLayout.js). Side labels follow
// that axis rather than always saying "left/right", since a "left" photo
// on a Portrait card would actually sit on top.
function sideLabelKey(aspectId, side) {
  const horizontal = aspectId === 'landscape';
  if (horizontal) return side === 'first' ? 'layout.side.left' : 'layout.side.right';
  return side === 'first' ? 'layout.side.top' : 'layout.side.bottom';
}

/**
 * Lets the photo cover less than the whole card (see CLAUDE.md's
 * `photo_area`/`blank_area` split in `postcard-calc::template::geometry`)
 * so the greeting message can sit on a blank part of the card instead of
 * overlaying the photo. Side and fill controls only show once a split
 * coverage is picked -- there's nothing to choose when the photo still
 * covers everything.
 */
export default function LayoutPanel({
  aspectId,
  coverage,
  side,
  onChangeLayout,
  fillStyle,
  onFillStyleChange,
  fillColor,
  onFillColorChange,
}) {
  const { t } = useI18n();
  const split = coverage !== 'full';

  return (
    <CollapsiblePanel title={t('layout.heading')}>
      <div className="text-option-buttons">
        {COVERAGES.map((c) => (
          <button
            key={c}
            type="button"
            className={c === coverage ? 'active' : ''}
            onClick={() => onChangeLayout(c, side)}
          >
            {t(`layout.coverage.${c}`)}
          </button>
        ))}
      </div>

      {split && (
        <>
          <div className="text-option-buttons">
            {['first', 'second'].map((s) => (
              <button
                key={s}
                type="button"
                className={s === side ? 'active' : ''}
                onClick={() => onChangeLayout(coverage, s)}
              >
                {t(sideLabelKey(aspectId, s))}
              </button>
            ))}
          </div>

          <span className="text-option-label">{t('layout.fill')}</span>
          <div className="text-option-buttons">
            {FILLS.map((f) => (
              <button
                key={f}
                type="button"
                className={f === fillStyle ? 'active' : ''}
                onClick={() => onFillStyleChange(f)}
              >
                {t(`layout.fill.${f}`)}
              </button>
            ))}
          </div>

          {fillStyle === 'solid' && (
            <div className="text-option-buttons">
              {FILL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === fillColor ? 'text-color-swatch active' : 'text-color-swatch'}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => onFillColorChange(c)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </CollapsiblePanel>
  );
}
