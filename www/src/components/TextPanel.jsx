import React from 'react';
import { useI18n } from '../i18n';
import { containsCjk } from '../fonts';

const COLORS = ['#ffffff', '#241a1e', '#B01243', '#d9b46a'];
const ALIGNS = ['left', 'center', 'right'];

export default function TextPanel({
  message,
  onMessageChange,
  font,
  onFontChange,
  textColor,
  onTextColorChange,
  textAlign,
  onTextAlignChange,
}) {
  const { t } = useI18n();
  const decorativeDisabled = containsCjk(message);

  return (
    <div className="panel text-field">
      <h2>{t('text.heading')}</h2>
      <textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder={t('text.placeholder')}
        maxLength={280}
      />

      <div className="text-row">
        <div className="text-option-group">
          <span className="text-option-label">{t('text.font')}</span>
          <div className="text-option-buttons">
            <button
              type="button"
              className={font === 'system' ? 'active' : ''}
              onClick={() => onFontChange('system')}
            >
              {t('text.font.system')}
            </button>
            <button
              type="button"
              className={font === 'decorative' ? 'active' : ''}
              disabled={decorativeDisabled}
              onClick={() => onFontChange('decorative')}
            >
              {t('text.font.decorative')}
            </button>
          </div>
        </div>

        <div className="text-option-group">
          <span className="text-option-label">{t('text.align')}</span>
          <div className="text-option-buttons">
            {ALIGNS.map((a) => (
              <button
                key={a}
                type="button"
                className={a === textAlign ? 'active' : ''}
                onClick={() => onTextAlignChange(a)}
              >
                {t(`text.align.${a}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="text-option-group">
          <span className="text-option-label">{t('text.color')}</span>
          <div className="text-option-buttons">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={c === textColor ? 'text-color-swatch active' : 'text-color-swatch'}
                style={{ background: c }}
                aria-label={c}
                onClick={() => onTextColorChange(c)}
              />
            ))}
          </div>
        </div>
      </div>

      {decorativeDisabled && <p className="text-option-note">{t('text.font.decorativeUnavailable')}</p>}
    </div>
  );
}
