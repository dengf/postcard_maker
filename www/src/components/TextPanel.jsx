import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { containsCjk } from '../fonts';
import { useIsNarrow } from '../useIsNarrow';
import { FontGlyphIcon, SizeIcon, AlignGlyphIcon, ColorSwatchGlyphIcon, ChevronIcon } from './icons';

const COLORS = ['#ffffff', '#241a1e', '#B01243', '#d9b46a'];
const ALIGNS = ['left', 'center', 'right'];
const FONTS = ['system', 'serif', 'decorative'];
// Relative to the auto-fit size -- see `fitText.js`. 1 is "Auto" itself,
// not a fixed pixel value, so this stays meaningful at any template size
// or message length.
const SIZES = [0.75, 1, 1.3, 1.6];

/**
 * A Word-toolbar-style compact toggle: just the icon plus the current
 * value (the icon alone already says which category this is -- Word's
 * own font/size/align/color controls don't spell that out either), that
 * expands to the real option buttons on tap. Starts collapsed on phones
 * and open by default on desktop. Each instance is independent. `label`
 * is not shown -- it's the button's accessible name only.
 */
function OptionGroup({ icon, label, preview, children }) {
  const narrow = useIsNarrow();
  const [open, setOpen] = useState(!narrow);

  return (
    <div className="text-option-group">
      <button
        type="button"
        className="text-option-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
      >
        {icon}
        <span className="text-option-toggle-value">{preview}</span>
        <ChevronIcon className={open ? 'chevron-icon open' : 'chevron-icon'} />
      </button>
      {open && <div className="text-option-buttons">{children}</div>}
    </div>
  );
}

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

  const sizeLabel =
    fontScale === 1
      ? t('text.size.auto')
      : t(`text.size.${fontScale === 0.75 ? 'smaller' : fontScale === 1.3 ? 'larger' : 'largest'}`);

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
        <OptionGroup icon={<FontGlyphIcon />} label={t('text.font')} preview={t(`text.font.${font}`)}>
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
        </OptionGroup>

        <OptionGroup icon={<SizeIcon />} label={t('text.size')} preview={sizeLabel}>
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
        </OptionGroup>

        <OptionGroup icon={<AlignGlyphIcon />} label={t('text.align')} preview={t(`text.align.${textAlign}`)}>
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
        </OptionGroup>

        <OptionGroup
          icon={textColor === 'auto' ? <ColorSwatchGlyphIcon /> : null}
          label={t('text.color')}
          preview={
            textColor === 'auto' ? (
              t('text.color.auto')
            ) : (
              <span className="text-color-dot" style={{ background: textColor }} />
            )
          }
        >
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
        </OptionGroup>
      </div>

      {cjk && <p className="text-option-note">{t('text.font.decorativeUnavailable')}</p>}
    </div>
  );
}
