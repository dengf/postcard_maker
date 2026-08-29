import React from 'react';
import { useI18n } from '../i18n';
import CollapsiblePanel from './CollapsiblePanel';

const FILTERS = ['none', 'grayscale', 'sepia', 'vintage'];

export default function FilterPanel({ zoom, onZoomChange, filter, onFilterChange, adjustments, onAdjustmentsChange, onReset }) {
  const { t } = useI18n();

  const setAdjustment = (key) => (e) =>
    onAdjustmentsChange({ ...adjustments, [key]: Number(e.target.value) });

  return (
    <CollapsiblePanel title={t('editor.filter')}>
      <p className="text-option-note">{t('editor.cropHint')}</p>

      <SliderField label={t('editor.zoom')} value={zoom} min={1} max={3} step={0.01} onChange={(e) => onZoomChange(Number(e.target.value))} display={`${zoom.toFixed(1)}x`} />

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
