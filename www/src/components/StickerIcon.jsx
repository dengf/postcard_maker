import React from 'react';

/**
 * Renders one `stickers.js` registry entry's raw markup inside an
 * `<svg>`. `dangerouslySetInnerHTML` is safe here: `markup` is a fixed
 * string this codebase wrote, never user input.
 */
export default function StickerIcon({ sticker, className }) {
  return (
    <svg viewBox={sticker.viewBox} className={className} aria-hidden="true">
      <g dangerouslySetInnerHTML={{ __html: sticker.markup }} />
    </svg>
  );
}
