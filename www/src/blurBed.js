/**
 * Blurring a photo onto the export canvas, without `ctx.filter`.
 *
 * `ctx.filter = 'blur(Npx)'` is the obvious way to do this and it is
 * what both callers used at first. **WebKit accepts the assignment and
 * then ignores it** -- measured across `fillRect` and every `drawImage`
 * source type, accelerated or not (`scratchpad/review/s27`). So in
 * Safari the editor showed a blurred bed and the saved card came back
 * with a second, pin-sharp copy of the photo behind the first, while
 * Chromium and Firefox were fine. A property that silently succeeds on
 * two engines and silently does nothing on the third is not one to
 * build a rendering step on. Do not put `ctx.filter` back, and do not
 * make it conditional either -- one code path, or the file someone
 * saves depends on which browser they saved it from.
 *
 * The blur is done here instead, and deliberately at low resolution: a
 * blur is a low-pass filter, so working on a ~96px-tall miniature
 * throws away only what the blur was going to throw away anyway. The
 * browser's own downscale does the first and cheapest half of the work,
 * three box passes do the rest (three approximates a Gaussian closely
 * enough for something nobody looks at directly), and the upscale back
 * to the card smooths what is left. A few thousand pixels of per-pixel
 * JS instead of a few million.
 *
 * The CSS side of the same effect (`.photo-blur-bed`, and the preview's
 * `blur` fill) keeps using a real CSS `filter`, which Safari has always
 * supported. It is only the canvas property that is missing.
 */

/** The short side of the miniature the blur is computed on. Big enough
 * that the upscale has something to interpolate, small enough that the
 * per-pixel passes are free. */
const WORK_SIZE = 96;

function clampIndex(i, n) {
  if (i < 0) return 0;
  return i >= n ? n - 1 : i;
}

/** One horizontal box pass, `src` -> `dst`, as a running sum: each step
 * adds the pixel entering the window and drops the one leaving, so the
 * cost does not grow with the radius. Edges repeat the edge pixel,
 * which keeps the border from darkening the way a zero-padded window
 * would. */
function blurRows(src, dst, w, h, radius) {
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let k = -radius; k <= radius; k++) {
      const i = row + clampIndex(k, w) * 4;
      r += src[i];
      g += src[i + 1];
      b += src[i + 2];
      a += src[i + 3];
    }
    for (let x = 0; x < w; x++) {
      const o = row + x * 4;
      dst[o] = r / span;
      dst[o + 1] = g / span;
      dst[o + 2] = b / span;
      dst[o + 3] = a / span;
      const add = row + clampIndex(x + radius + 1, w) * 4;
      const drop = row + clampIndex(x - radius, w) * 4;
      r += src[add] - src[drop];
      g += src[add + 1] - src[drop + 1];
      b += src[add + 2] - src[drop + 2];
      a += src[add + 3] - src[drop + 3];
    }
  }
}

/** The same pass down the columns. Kept as its own loop rather than
 * transposing twice: the arrays are tiny and a transpose is two more
 * full copies of them. */
function blurColumns(src, dst, w, h, radius) {
  const span = radius * 2 + 1;
  const stride = w * 4;
  for (let x = 0; x < w; x++) {
    const col = x * 4;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let k = -radius; k <= radius; k++) {
      const i = col + clampIndex(k, h) * stride;
      r += src[i];
      g += src[i + 1];
      b += src[i + 2];
      a += src[i + 3];
    }
    for (let y = 0; y < h; y++) {
      const o = col + y * stride;
      dst[o] = r / span;
      dst[o + 1] = g / span;
      dst[o + 2] = b / span;
      dst[o + 3] = a / span;
      const add = col + clampIndex(y + radius + 1, h) * stride;
      const drop = col + clampIndex(y - radius, h) * stride;
      r += src[add] - src[drop];
      g += src[add + 1] - src[drop + 1];
      b += src[add + 2] - src[drop + 2];
      a += src[add + 3] - src[drop + 3];
    }
  }
}

/**
 * Three separable box passes over RGBA `data`, in place.
 *
 * Three is the usual count: one box is a harsh average with visible
 * square edges, two is a triangle, three is close enough to a Gaussian
 * that nothing about it reads as an artifact. A box radius of `r` gives
 * a standard deviation of very nearly `r` after three passes, which is
 * why the caller can pass the radius it actually wants.
 */
export function boxBlur(data, w, h, radius) {
  if (!(radius >= 1) || w < 1 || h < 1) return data;
  const scratch = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < 3; pass++) {
    blurRows(data, scratch, w, h, radius);
    blurColumns(scratch, data, w, h, radius);
  }
  return data;
}

/**
 * A blurred miniature of `img`, as a canvas the caller draws wherever
 * it wants -- stretched across a split card, or cover-scaled behind a
 * letterboxed photo.
 *
 * It comes back small on purpose. `radius` is a *fraction of the short
 * side*, which the miniature preserves, so the blur is the same
 * strength however large the rectangle it ends up drawn into -- the
 * same reason the CSS side measures in `cqmin`.
 */
export function blurredBitmap(img, radius) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const scale = Math.min(1, WORK_SIZE / Math.max(1, Math.min(sw, sh)));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const pixels = ctx.getImageData(0, 0, w, h);
  boxBlur(pixels.data, w, h, Math.max(1, Math.round(radius * Math.min(w, h))));
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
