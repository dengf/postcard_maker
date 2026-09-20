import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { containsCjk } from '../fonts';
import { useIsNarrow } from '../useIsNarrow';
import {
  FontGlyphIcon,
  SizeIcon,
  AlignGlyphIcon,
  ColorSwatchGlyphIcon,
  ChevronIcon,
} from './icons';

// Named, not bare hex: the toggle shows the current value as a word the
// same way Style/Size/Align do, and the swatch buttons need an accessible
// name a screen reader can actually read out ("Plum", not "#B01243").
const COLORS = [
  { value: '#ffffff', key: 'white' },
  { value: '#241a1e', key: 'ink' },
  { value: '#B01243', key: 'plum' },
  { value: '#d9b46a', key: 'gold' },
];
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
  suggestion,
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

  // A literal colour reads as its own name, so the Colour toggle says what
  // it's set to like the other three do instead of showing a bare swatch.
  // An unrecognised value (an old draft, a future palette) falls back to
  // the category word rather than rendering an empty toggle.
  const colorKey = COLORS.find((c) => c.value === textColor)?.key;
  const colorLabel =
    textColor === 'auto'
      ? t('text.color.auto')
      : colorKey
        ? t(`text.color.${colorKey}`)
        : t('text.color');

  return (
    <div className="panel text-field">
      <h2>{t('text.heading')}</h2>
      <textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder={t('text.placeholder')}
        maxLength={280}
      />

      {/* A line suggested from the photo's own date -- no model, no
          download, no worker (see `useMomentCaption`). Shown only while
          the message is empty: once someone has written something, a
          standing suggestion under the box is nagging rather than
          helpful, and there is no way to tap it that could overwrite
          their own words. Clearing the box brings it back. */}
      {suggestion && !message.trim() && (
        <div className="text-suggestion">
          <p className="text-option-note">{t(suggestion)}</p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => onMessageChange(t(suggestion))}
          >
            {t('text.useSuggestion')}
          </button>
        </div>
      )}

      <div className="text-row">
        <OptionGroup
          icon={<FontGlyphIcon />}
          label={t('text.font')}
          preview={t(`text.font.${font}`)}
        >
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
              {s === 1
                ? t('text.size.auto')
                : t(`text.size.${s === 0.75 ? 'smaller' : s === 1.3 ? 'larger' : 'largest'}`)}
            </button>
          ))}
        </OptionGroup>

        <OptionGroup
          icon={<AlignGlyphIcon />}
          label={t('text.align')}
          preview={t(`text.align.${textAlign}`)}
        >
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
          icon={
            textColor === 'auto' ? (
              <ColorSwatchGlyphIcon />
            ) : (
              <span className="text-color-dot" style={{ background: textColor }} />
            )
          }
          label={t('text.color')}
          preview={colorLabel}
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
              key={c.value}
              type="button"
              className={c.value === textColor ? 'text-color-swatch active' : 'text-color-swatch'}
              style={{ background: c.value }}
              aria-label={t(`text.color.${c.key}`)}
              aria-pressed={c.value === textColor}
              onClick={() => onTextColorChange(c.value)}
            />
          ))}
        </OptionGroup>
      </div>

      {cjk && <p className="text-option-note">{t('text.font.decorativeUnavailable')}</p>}
    </div>
  );
}
