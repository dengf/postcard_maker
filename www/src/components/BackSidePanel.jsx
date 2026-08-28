import React from 'react';
import { useI18n } from '../i18n';

export default function BackSidePanel({ enabled, onToggle, location, onLocationChange }) {
  const { t } = useI18n();
  return (
    <div className="panel">
      <label className="field-check-row">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        {t('backSide.enable')}
      </label>
      {enabled && (
        <div className="text-field">
          <input
            type="text"
            className="back-side-location"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder={t('backSide.locationPlaceholder')}
            maxLength={60}
          />
        </div>
      )}
    </div>
  );
}
