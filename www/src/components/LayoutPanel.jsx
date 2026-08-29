import React from 'react';
import { useI18n } from '../i18n';
import CollapsiblePanel from './CollapsiblePanel';
import { FILL_COLORS, FILL_SHAPES, FILL_VARIANTS, buildFillStyle, parseFillStyle } from '../fillTreatments';

const COVERAGES = ['full', 'half', 'bigSmall'];

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
 *
 * The fill itself is three independent picks -- shape, variant (when the
 * shape has one), color -- crossed together rather than one flat list of
 * named looks; see `fillTreatments.js`'s own doc comment for why that
 * gets close to 300 distinct results from three short button rows.
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
  const { shape, variant } = parseFillStyle(fillStyle);
  const variants = FILL_VARIANTS[shape];

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
            {FILL_SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                className={s === shape ? 'active' : ''}
                onClick={() => onFillStyleChange(buildFillStyle(s, FILL_VARIANTS[s]?.[0]))}
              >
                {t(`layout.fill.shape.${s}`)}
              </button>
            ))}
          </div>

          {variants && (
            <div className="text-option-buttons">
              {variants.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={v === variant ? 'active' : ''}
                  onClick={() => onFillStyleChange(buildFillStyle(shape, v))}
                >
                  {t(`layout.fill.variant.${v}`)}
                </button>
              ))}
            </div>
          )}

          {shape !== 'blur' && (
            <>
              <span className="text-option-label">{t('layout.fill.colorLabel')}</span>
              <div className="text-option-buttons">
                <button
                  type="button"
                  className={fillColor === 'auto' ? 'active' : ''}
                  onClick={() => onFillColorChange('auto')}
                >
                  {t('layout.fill.auto')}
                </button>
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
            </>
          )}
        </>
      )}
    </CollapsiblePanel>
  );
}
