import React from 'react';
import { useI18n } from '../i18n';
import { FILL_ZOOM, MAX_ZOOM, QUARTER_TURN, normalizeRotation } from '../cropGesture';
import CollapsiblePanel from './CollapsiblePanel';
import { RotateIcon } from './icons';

const FILTERS = ['none', 'grayscale', 'sepia', 'vintage'];

export default function FilterPanel({ zoom, minZoom = FILL_ZOOM, onZoomChange, rotation, onRotationChange, filter, onFilterChange, adjustments, onAdjustmentsChange, onReset }) {
  const { t } = useI18n();

  const setAdjustment = (key) => (e) =>
    onAdjustmentsChange({ ...adjustments, [key]: Number(e.target.value) });

  return (
    <CollapsiblePanel title={t('editor.filter')}>
      <p className="text-option-note">{t('editor.cropHint')}</p>

      <RotationField rotation={rotation} onChange={onRotationChange} />

      {/* Bounds come from `cropGesture` so the slider and a pinch can't
          drift apart -- a pinch past the slider's end would leave the
          two controls disagreeing about the same number. The bottom end
          is the photo's own, not a constant: below 1x the card shows the
          whole photo on a blurred bed, and how far below that is worth
          going depends on how much this photo's shape differs from the
          card's (`letterbox.js`'s `fitZoom`). */}
      <SliderField label={t('editor.zoom')} value={zoom} min={minZoom} max={MAX_ZOOM} step={0.01} onChange={(e) => onZoomChange(Number(e.target.value))} display={`${zoom.toFixed(2).replace(/0$/, '')}x`} />

      <div className="filter-options">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={f === filter ? 'filter-option active' : 'filter-option'}
            onClick={() => onFilterChange(f)}
          >
            {t(`editor.filter.${f}`)}
          </button>
        ))}
      </div>

      <SliderField
        label={t('editor.brightness')}
        value={adjustments.brightness}
        min={-0.5}
        max={0.5}
        step={0.01}
        onChange={setAdjustment('brightness')}
      />
      <SliderField
        label={t('editor.contrast')}
        value={adjustments.contrast}
        min={0.5}
        max={1.6}
        step={0.01}
        onChange={setAdjustment('contrast')}
      />
      <SliderField
        label={t('editor.saturation')}
        value={adjustments.saturation}
        min={0}
        max={2}
        step={0.01}
        onChange={setAdjustment('saturation')}
      />

      <button type="button" className="btn ghost" onClick={onReset}>
        {t('editor.reset')}
      </button>
    </CollapsiblePanel>
  );
}

/**
 * Turning the photo, for anyone not holding it: two quarter-turn buttons
 * either side of a fine slider.
 *
 * The two-finger twist on the preview is the primary way to do this on a
 * phone and does not need a control at all -- but a gesture nothing on
 * screen mentions is a gesture most people never find, and a mouse cannot
 * perform it. So this is both the discoverable label for the gesture and
 * the only way in on a desktop.
 *
 * The slider runs -180..180 rather than the stored 0..360 because a
 * straightening nudge is the common case and "-3 degrees" is what that
 * feels like; `normalizeRotation` converts back on the way in, so the
 * stored value stays in one range no matter which control wrote it.
 */
function RotationField({ rotation, onChange }) {
  const { t } = useI18n();
  const signed = rotation > 180 ? Math.round(rotation) - 360 : Math.round(rotation);

  return (
    <div className="slider-field">
      <div className="slider-field-row">
        <span>{t('editor.rotate')}</span>
        <span>{`${signed}°`}</span>
      </div>
      <div className="rotate-row">
        <button
          type="button"
          className="btn ghost rotate-step"
          onClick={() => onChange(normalizeRotation(rotation - QUARTER_TURN))}
        >
          <RotateIcon clockwise={false} />
          <span className="visually-hidden">{t('editor.rotateLeft')}</span>
        </button>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={signed}
          aria-label={t('editor.rotate')}
          onChange={(e) => onChange(normalizeRotation(Number(e.target.value)))}
        />
        <button
          type="button"
          className="btn ghost rotate-step"
          onClick={() => onChange(normalizeRotation(rotation + QUARTER_TURN))}
        >
          <RotateIcon />
          <span className="visually-hidden">{t('editor.rotateRight')}</span>
        </button>
      </div>
    </div>
  );
}

function SliderField({ label, value, min, max, step, onChange, display }) {
  return (
    <div className="slider-field">
      <div className="slider-field-row">
        <span>{label}</span>
        <span>{display ?? value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
  );
}
