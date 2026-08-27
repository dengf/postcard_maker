/**
 * Hand-authored inline SVG stickers -- flat shapes built from primitives,
 * same spirit as `icons.jsx` and the meifio mark itself: zero external
 * assets, so nothing to license. `markup` is raw SVG child content (never
 * a full `<svg>` tag) so the exact same string can be dropped into a DOM
 * `<svg>` for the editing overlay and into a `data:image/svg+xml` URL for
 * the canvas bake at export -- one source of truth, see `export.js`.
 *
 * The five-petal blossom mirrors `MeifioMark.jsx`'s own petal path and
 * `meifio-brand/build.py`'s five-fold geometry -- see CLAUDE.md: this
 * brand's blossom is never drawn with six petals.
 */
export const STICKERS = [
  {
    id: 'heart',
    labelKey: 'stickers.heart',
    viewBox: '0 0 100 100',
    markup:
      '<path d="M50 88 C20 66 6 46 6 28 A22 22 0 0 1 50 18 A22 22 0 0 1 94 28 C94 46 80 66 50 88 Z" fill="#e0355b"/>',
  },
  {
    id: 'star',
    labelKey: 'stickers.star',
    viewBox: '0 0 100 100',
    markup:
      '<path d="M50 6 L61 38 L96 38 L68 58 L79 92 L50 71 L21 92 L32 58 L4 38 L39 38 Z" fill="#f2b705"/>',
  },
  {
    id: 'sun',
    labelKey: 'stickers.sun',
    viewBox: '0 0 100 100',
    markup:
      '<g stroke="#f2a705" stroke-width="6" stroke-linecap="round"><path d="M50 6 V20 M50 80 V94 M94 50 H80 M20 50 H6 M79 21 L69 31 M31 69 L21 79 M79 79 L69 69 M31 31 L21 21"/></g><circle cx="50" cy="50" r="22" fill="#ffce3d"/>',
  },
  {
    id: 'cloud',
    labelKey: 'stickers.cloud',
    viewBox: '0 0 100 100',
    markup:
      '<path d="M27 68 A18 18 0 0 1 30 32.5 A24 24 0 0 1 76 30 A18 18 0 0 1 74 68 Z" fill="#eef3f8"/>',
  },
  {
    id: 'wave',
    labelKey: 'stickers.wave',
    viewBox: '0 0 100 60',
    markup:
      '<path d="M2 40 C 18 20, 32 20, 50 40 C 68 60, 82 60, 98 40" fill="none" stroke="#3a8bc4" stroke-width="8" stroke-linecap="round"/>',
  },
  {
    id: 'airplane',
    labelKey: 'stickers.airplane',
    viewBox: '0 0 100 100',
    markup:
      '<path d="M4 56 L92 12 L60 46 L70 88 L54 72 L40 82 L38 62 Z" fill="#e6edf3" stroke="#7d8794" stroke-width="2" stroke-linejoin="round"/>',
  },
  {
    id: 'stamp',
    labelKey: 'stickers.stamp',
    viewBox: '0 0 100 100',
    markup:
      '<circle cx="50" cy="50" r="40" fill="none" stroke="#c23b3b" stroke-width="4" stroke-dasharray="6 5"/><path d="M14 40 H86 M14 60 H86" stroke="#c23b3b" stroke-width="3"/>',
  },
  {
    id: 'palm',
    labelKey: 'stickers.palm',
    viewBox: '0 0 100 100',
    markup:
      '<path d="M48 94 L54 46" stroke="#8a5a34" stroke-width="6" stroke-linecap="round" fill="none"/><g fill="#2f9e52"><path d="M54 46 C40 40 24 42 14 34 C28 30 44 32 54 42 Z"/><path d="M54 46 C46 32 34 22 22 16 C38 16 52 24 58 40 Z"/><path d="M54 46 C64 30 80 24 92 26 C82 34 70 40 58 42 Z"/><path d="M54 46 C62 34 76 28 90 32 C80 42 68 46 56 44 Z"/></g>',
  },
  {
    id: 'confetti',
    labelKey: 'stickers.confetti',
    viewBox: '0 0 100 100',
    markup:
      '<g><rect x="10" y="14" width="10" height="10" fill="#e0355b" transform="rotate(20 15 19)"/><circle cx="70" cy="20" r="6" fill="#f2b705"/><rect x="60" y="60" width="10" height="10" fill="#3a8bc4" transform="rotate(-15 65 65)"/><circle cx="24" cy="72" r="6" fill="#2f9e52"/><rect x="82" y="70" width="8" height="8" fill="#B01243" transform="rotate(30 86 74)"/></g>',
  },
  {
    id: 'arrow',
    labelKey: 'stickers.arrow',
    viewBox: '0 0 100 100',
    markup:
      '<path d="M10 70 C 30 20, 70 20, 88 46" fill="none" stroke="#B01243" stroke-width="6" stroke-linecap="round"/><path d="M88 46 L74 40 M88 46 L80 60" fill="none" stroke="#B01243" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: 'washi',
    labelKey: 'stickers.washi',
    viewBox: '0 0 140 50',
    markup:
      '<path d="M4 8 L136 4 L134 44 L6 46 Z" fill="#f7d9c4" opacity="0.85"/><g stroke="#e0355b" stroke-width="2" opacity="0.5"><path d="M14 4 V46 M34 4 V46 M54 4 V46 M74 4 V46 M94 4 V46 M114 4 V46"/></g>',
  },
  {
    id: 'blossom',
    labelKey: 'stickers.blossom',
    viewBox: '0 0 100 100',
    markup:
      '<g transform="translate(50 50) scale(0.5) translate(-50 -50)" fill="#B01243"><path id="pc-petal" d="M50 50 C41 46 34 38 34 27 A16 16 0 1 1 66 27 C66 38 59 46 50 50 Z"/><use href="#pc-petal" transform="rotate(72 50 50)"/><use href="#pc-petal" transform="rotate(144 50 50)"/><use href="#pc-petal" transform="rotate(216 50 50)"/><use href="#pc-petal" transform="rotate(288 50 50)"/></g>',
  },
];

export function stickerById(id) {
  return STICKERS.find((s) => s.id === id);
}

/** A self-contained `data:` URL for `<img>`/canvas use -- see `export.js`. */
export function stickerDataUrl(sticker) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sticker.viewBox}">${sticker.markup}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
