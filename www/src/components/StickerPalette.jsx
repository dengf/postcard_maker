import React from 'react';
import { useI18n } from '../i18n';
import { STICKERS } from '../stickers';
import StickerIcon from './StickerIcon';

export default function StickerPalette({ onAdd }) {
  const { t } = useI18n();
  return (
    <div className="sticker-palette">
      {STICKERS.map((sticker) => (
        <button
          key={sticker.id}
          type="button"
          className="sticker-button"
          title={t(sticker.labelKey)}
          onClick={() => onAdd(sticker.id)}
        >
          <StickerIcon sticker={sticker} />
        </button>
      ))}
    </div>
  );
}
