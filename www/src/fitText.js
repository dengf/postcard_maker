import { wrapText } from './wordwrap';

/**
 * The largest font size (in px) at which `text` wraps to fit within
 * `boxWidth` x `boxHeight` on `ctx` -- a binary search over
 * `wrapText`'s own line-count, not a fixed formula based on the box size
 * alone. Answers "what size should this be by default", not just "how
 * do I let someone change it": a one-word greeting and a three-sentence
 * one should not render at the same size just because they share a
 * message area. Pure given a 2D context, so it's testable with a fake
 * one the same way `wordwrap.test.js` fakes `measureText` -- no DOM or
 * wasm required.
 */
export function fitFontSize(
  ctx,
  text,
  boxWidth,
  boxHeight,
  { min = 10, max = 160, lineHeightRatio = 1.3, fontFamily } = {},
) {
  if (!text?.trim() || boxWidth <= 0 || boxHeight <= 0) return min;

  const fits = (size) => {
    ctx.font = `${size}px ${fontFamily}`;
    const lines = wrapText(ctx, text, boxWidth);
    if (lines.length * size * lineHeightRatio > boxHeight) return false;
    // Width has to be asked separately, because `wrapText` deliberately
    // never breaks a word: a single word wider than the box comes back
    // as one over-wide line, and a height-only search then grew it until
    // the *height* ran out. The preview clipped the result
    // (`overflow: hidden`), while the export drew it straight off the
    // card -- "Congratulations" on a split layout saved as
    // "Congratulatior". Shrinking until the longest line fits is what
    // makes the two agree and keeps the whole word on the postcard.
    return lines.every((line) => ctx.measureText(line).width <= boxWidth);
  };

  let lo = min;
  let hi = max;
  let best = min;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

let sharedCtx = null;
/** A detached canvas 2D context, reused across calls -- text measurement
 * needs no visible canvas, just something to call `measureText` on. */
export function getMeasureContext() {
  if (!sharedCtx) sharedCtx = document.createElement('canvas').getContext('2d');
  return sharedCtx;
}
