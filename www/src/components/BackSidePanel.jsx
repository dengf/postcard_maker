import React from 'react';
import { useI18n } from '../i18n';

export default function BackSidePanel({ enabled, onToggle, location, onLocationChange, address, onAddressChange }) {
  const { t } = useI18n();
  return (
    <div className="panel">
      <label className="field-check-row">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        {t('backSide.enable')}
      </label>
      {enabled && (
        <>
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
          {/* One recipient-address line per line of input (name / street /
              city-state-zip), drawn onto the classic ruled "To" lines --
              see `export.js`'s `renderBackSide`. Free text, not validated
              as a real postal address: this app has no server to check
              one against, same "trust the user's own input" stance as
              the message field. */}
          <div className="text-field">
            <textarea
              className="back-side-address"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder={t('backSide.addressPlaceholder')}
              rows={4}
              maxLength={200}
            />
          </div>
        </>
      )}
    </div>
  );
}
