import React from 'react';
import { useI18n } from '../i18n';
import { containsCjk } from '../fonts';

const COLORS = ['#ffffff', '#241a1e', '#B01243', '#d9b46a'];
const ALIGNS = ['left', 'center', 'right'];
const FONTS = ['system', 'serif', 'decorative'];
// Relative to the auto-fit size -- see `fitText.js`. 1 is "Auto" itself,
// not a fixed pixel value, so this stays meaningful at any template size
// or message length.
const SIZES = [0.75, 1, 1.3, 1.6];

export default function TextPanel({
  message,
  onMessageChange,
  font,
  onFontChange,
  fontScale,
  onFontScaleChange,
  textColor,
  onTextColorChange,
  textAlign,
  onTextAlignChange,
}) {
  const { t } = useI18n();
  const cjk = containsCjk(message);

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
            {FONTS.map((f) => (
              <button
                key={f}
                type="button"
                className={f === font ? 'active' : ''}
                disabled={f === 'decorative' && cjk}
                onClick={() => onFontChange(f)}
              >
                {t(`text.font.${f}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="text-option-group">
          <span className="text-option-label">{t('text.size')}</span>
          <div className="text-option-buttons">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={s === fontScale ? 'active' : ''}
                onClick={() => onFontScaleChange(s)}
              >
                {s === 1 ? t('text.size.auto') : t(`text.size.${s === 0.75 ? 'smaller' : s === 1.3 ? 'larger' : 'largest'}`)}
              </button>
            ))}
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
            <button
              type="button"
              className={textColor === 'auto' ? 'active' : ''}
              onClick={() => onTextColorChange('auto')}
            >
              {t('text.color.auto')}
            </button>
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

      {cjk && <p className="text-option-note">{t('text.font.decorativeUnavailable')}</p>}
    </div>
  );
}
