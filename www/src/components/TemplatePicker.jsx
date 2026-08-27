import React from 'react';
import { useI18n } from '../i18n';
import { ASPECTS } from '../aspect';

export default function TemplatePicker({ aspectId, onChange }) {
  const { t } = useI18n();
  return (
    <div className="panel">
      <h2>{t('template.heading')}</h2>
      <div className="template-options">
        {ASPECTS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={a.id === aspectId ? 'template-option active' : 'template-option'}
            onClick={() => onChange(a.id)}
          >
            <span
              className="template-swatch"
              style={{ width: a.ratio >= 1 ? 32 : 32 * a.ratio, height: a.ratio >= 1 ? 32 / a.ratio : 32 }}
            />
            {t(a.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
