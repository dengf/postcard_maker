/**
 * A cheap CSS `filter` approximation of `postcard-calc`'s Rust filters,
 * for the live editor preview only. Interactive, so it has to redraw on
 * every slider tick without touching wasm -- see CLAUDE.md. The *actual*
 * pixels only ever come from `postcard-calc::filters`, at export; this is
 * deliberately just a close-enough look while dragging, not a second
 * implementation of the filter math with a claim to being correct.
 */
const NAMED_FILTER_CSS = {
  none: '',
  grayscale: 'grayscale(1)',
  sepia: 'sepia(0.8)',
  vintage: 'sepia(0.35) contrast(0.92) brightness(0.97) saturate(0.75)',
};

export function previewFilterCss(adjustments, filter) {
  const base = `brightness(${1 + adjustments.brightness}) contrast(${adjustments.contrast}) saturate(${adjustments.saturation})`;
  const named = NAMED_FILTER_CSS[filter] ?? '';
  return named ? `${base} ${named}` : base;
}

/**
 * The same filter string, evaluated in JS against a single color.
 *
 * `autoTextColor.js` used to get this by setting `ctx.filter` and
 * reading back the drawn pixels, which **WebKit accepts and then
 * ignores** (see `blurBed.js`) -- so in Safari the greeting's ink was
 * picked against the *unfiltered* photo, and brightening a photo far
 * enough to need dark ink left the preview on white while the saved
 * file, which samples real composited pixels, correctly went dark.
 * Reproduced before and after in WebKit, not inferred. There the answer
 * was to do the blur by hand;
 * here nothing needs drawing at all, because every function above is
 * *affine* on the RGB triple, and an affine map commutes with the
 * average: filtering a thousand pixels and averaging them gives the same
 * answer as averaging them and filtering once.
 *
 * So this is not a fallback and not a second approximation -- it is the
 * same arithmetic the browser would have done, on one pixel instead of
 * four thousand, and it gives every browser the same answer.
 *
 * **Each function clamps its own output before the next one sees it**,
 * which is the one thing that keeps this from being a single composed
 * matrix. Composing first and clamping once at the end is the obvious
 * simplification and it is wrong: on `brightness(1.2) ... sepia(0.8)`
 * over a bright photo it came out 19 levels off what Chromium and
 * Firefox both draw, because the browsers clip the blown-out highlight
 * on the way through and a composed matrix carries it. Measured against
 * both engines (`scratchpad/review/s25`), not reasoned about -- with the
 * clamp in place they agree to within one level.
 *
 * Clipping is also the only place the commutes-with-the-average argument
 * stops holding exactly, so a photo with blown highlights lands slightly
 * off. That can only shift a light-vs-dark decision that was already
 * near a tie, and the export samples the real composited pixels
 * regardless.
 */
const IDENTITY = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
];

/** Luminance weights, and the sepia matrix, exactly as the Filter
 * Effects spec writes them -- these are the numbers a browser uses. */
const LUMA = [0.213, 0.715, 0.072];
const SEPIA = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

function saturateMatrix(s) {
  return [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => LUMA[j] + (i === j ? s * (1 - LUMA[j]) : -s * LUMA[j])).concat(0),
  );
}

function mixMatrix(target, amount) {
  return target.map((row, i) =>
    row.map((v, j) => (i === j ? 1 : 0) * (1 - amount) + v * amount).concat(0),
  );
}

/** A CSS `<number-percentage>` argument: `0.8` and `80%` are the same. */
function amount(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return fallback;
  return raw.trim().endsWith('%') ? n / 100 : n;
}

function matrixForFunction(name, arg) {
  switch (name) {
    case 'brightness': {
      const k = amount(arg, 1);
      return [
        [k, 0, 0, 0],
        [0, k, 0, 0],
        [0, 0, k, 0],
      ];
    }
    case 'contrast': {
      const k = amount(arg, 1);
      const b = 0.5 - 0.5 * k;
      return [
        [k, 0, 0, b],
        [0, k, 0, b],
        [0, 0, k, b],
      ];
    }
    case 'saturate':
      return saturateMatrix(amount(arg, 1));
    // Greyscale is saturation removed, which is how the spec defines it.
    case 'grayscale':
      return saturateMatrix(1 - Math.min(1, Math.max(0, amount(arg, 1))));
    case 'sepia':
      return mixMatrix(SEPIA, Math.min(1, Math.max(0, amount(arg, 1))));
    default:
      // Anything this app does not emit (blur, hue-rotate, ...) is not
      // affine or not a color change; leaving it out is honest, and
      // `previewFilterCss` above is the only producer.
      return IDENTITY;
  }
}

/** One matrix against a 0-1 RGB triple, clamped the way a filter
 * primitive's own output is before the next one reads it. */
function applyMatrix(m, rgb) {
  return m.map((row) =>
    Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2] + row[3])),
  );
}

/** `rgb` in 0-255 through `css`, back in 0-255. */
export function applyFilterToColor(rgb, css) {
  let out = rgb.map((v) => v / 255);
  for (const [, name, arg] of String(css || '').matchAll(/([a-z-]+)\(([^)]*)\)/gi)) {
    out = applyMatrix(matrixForFunction(name.toLowerCase(), arg), out);
  }
  return out.map((v) => v * 255);
}
