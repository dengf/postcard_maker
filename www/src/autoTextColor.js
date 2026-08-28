/**
 * "Auto" text color: instead of a fixed default, pick whichever of this
 * app's own color swatches has the strongest contrast against the photo
 * behind the message box -- WCAG's relative-luminance contrast ratio,
 * not a hand-picked light/dark brightness threshold, so a mid-tone photo
 * (a beach at golden hour, say) gets a real comparison between all four
 * candidates instead of a coin flip between just black and white.
 *
 * Two halves, mirroring the split CLAUDE.md already draws between the
 * live preview and the export bake:
 * - `bestContrastColor`/`averageColor` are exact pixel math, usable
 *   anywhere a canvas `ImageData` exists -- at export, that's the real
 *   composited photo already drawn to the canvas (see `export.js`'s
 *   `drawMessage`), so the exported color is always correct, never an
 *   approximation.
 * - `sampleFrameColor` is the *live-preview* approximation: there's no
 *   real canvas to sample while editing (the preview is CSS, not a
 *   canvas redraw -- see CLAUDE.md), so it draws the panned/cropped
 *   photo into a small offscreen canvas with the same CSS filter string
 *   the preview itself uses, close enough to decide light-vs-dark
 *   without needing to be pixel-accurate.
 */

export const AUTO_COLOR_CANDIDATES = ['#ffffff', '#241a1e', '#B01243', '#d9b46a'];

function srgbToLinear(channel255) {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(lumA, lumB) {
  const [hi, lo] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** The average `[r, g, b]` (0-255 each) of an `ImageData`'s pixels. */
export function averageColor(imageData) {
  const { data } = imageData;
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [r / pixels, g / pixels, b / pixels];
}

/** Whichever candidate swatch contrasts most strongly against `bgRgb`. */
export function bestContrastColor(bgRgb, candidates = AUTO_COLOR_CANDIDATES) {
  const bgLum = relativeLuminance(bgRgb);
  let best = candidates[0];
  let bestRatio = -Infinity;
  for (const hex of candidates) {
    const ratio = contrastRatio(bgLum, relativeLuminance(hexToRgb(hex)));
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = hex;
    }
  }
  return best;
}

/**
 * Draws `img`'s current crop into a small offscreen canvas with
 * `cssFilter` applied (the same string the live CSS preview uses), then
 * returns the average color of `areaRect` (normalized 0..1, e.g.
 * `geometry.messageArea`) within it. 64px is plenty to decide "light or
 * dark" and cheap enough to re-run on every crop/filter/adjustment
 * change.
 */
export function sampleFrameColor(img, crop, cssFilter, areaRect) {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.filter = cssFilter || 'none';
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, SIZE, SIZE);

  const x = Math.min(SIZE - 1, Math.round(areaRect.x * SIZE));
  const y = Math.min(SIZE - 1, Math.round(areaRect.y * SIZE));
  const w = Math.max(1, Math.round(areaRect.w * SIZE));
  const h = Math.max(1, Math.round(areaRect.h * SIZE));
  return averageColor(ctx.getImageData(x, y, w, h));
}
