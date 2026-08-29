import { hexToRgb } from './autoTextColor';

/**
 * The blank-area "fill" (see `LayoutPanel.jsx`) is built from three small,
 * independently-picked dimensions crossed together, the same trick
 * `vibeSuggestions.js` already uses to turn a couple of short curated
 * lists into a large tasteful pool instead of hand-authoring every
 * combination: a **shape** (`FILL_SHAPES`), a **color** (`'auto'`,
 * sampled from the photo, or one of `FILL_COLORS`), and, for shapes that
 * have one, a **variant** (`FILL_VARIANTS[shape]`). 8 shapes x 15 colors
 * x (mostly 3) variants is close to 300 distinct-looking fills from three
 * short button rows, not 300 hand-written CSS/canvas snippets.
 *
 * A fill is stored as one string, `fillStyle`: just the shape
 * (`'solid'`, `'blur'`) when it has no variant, or `${shape}:${variant}`
 * (`'gradient:diagonal'`, `'dots:small'`) when it does -- no separate
 * reducer field needed for the variant. `fillColor` stays the existing
 * field, now also accepting the sentinel `'auto'` (sample the photo)
 * alongside a concrete hex swatch; `blur` ignores it entirely (its
 * "color" is the photo itself), and `airmail`'s `classic` variant ignores
 * it too (its whole point is the fixed, recognizable red/white/blue).
 *
 * `PostcardCanvas.jsx`'s live CSS preview and `export.js`'s canvas bake
 * both call the exact same functions here, so a gradient's stops or a
 * dot pattern's colors never drift between preview and export -- this is
 * cheap arithmetic on an already-known color, not per-pixel sampling, so
 * unlike the CSS-filter/Rust-filter split elsewhere in this app there's
 * no need for the preview to only *approximate* it.
 */

export const FILL_SHAPES = ['solid', 'gradient', 'radial', 'dots', 'stripes', 'lines', 'airmail', 'blur'];

export const FILL_VARIANTS = {
  gradient: ['diagonal', 'vertical', 'horizontal'],
  radial: ['center', 'topLeft', 'bottomRight'],
  dots: ['small', 'medium', 'large'],
  stripes: ['diagonal', 'horizontal', 'vertical'],
  lines: ['narrow', 'medium', 'wide'],
  airmail: ['classic', 'tonal', 'mono'],
};

export const FILL_COLORS = [
  '#f4ede0', // cream
  '#ffffff', // white
  '#241a1e', // charcoal
  '#B01243', // maroon
  '#d9b46a', // gold
  '#8a9a7b', // sage
  '#6f8ea8', // dusty blue
  '#e3b5b0', // blush
  '#c1673b', // terracotta
  '#2f6f6a', // teal
  '#c99a2e', // mustard
  '#a08cae', // lavender
  '#a9814f', // kraft
  '#2c3e50', // navy
];

const GRADIENT_ANGLE_DEG = { diagonal: 135, vertical: 180, horizontal: 90 };
const STRIPE_ANGLE_DEG = { diagonal: 45, horizontal: 0, vertical: 90 };
const RADIAL_POSITION = { center: '50% 50%', topLeft: '25% 25%', bottomRight: '75% 75%' };
const DOT_SPACING = { small: 10, medium: 16, large: 24 };
const LINE_SPACING = { narrow: 14, medium: 22, wide: 32 };
// A postcard-specific motif, not a generic geometric one: the classic
// red/white/blue diagonal trim of a vintage airmail envelope, per the
// user's own reference. `classic` is deliberately fixed rather than
// derived from the picked swatch -- the whole point of "classic" is the
// one recognizable palette; `tonal`/`mono` exist for whoever wants the
// motif's shape without its specific colors.
const AIRMAIL_CLASSIC = ['#c0392b', '#ffffff', '#1f4e8c'];

/** Splits a stored `fillStyle` into its shape and (if the shape has one) variant, each defaulted. */
export function parseFillStyle(fillStyle) {
  const [shape, variant] = String(fillStyle ?? 'solid').split(':');
  const variants = FILL_VARIANTS[shape];
  return { shape, variant: variant ?? variants?.[0] ?? null };
}

export function buildFillStyle(shape, variant) {
  return variant ? `${shape}:${variant}` : shape;
}

/**
 * Migrates a `fillStyle`/`fillColor` pair from before this module existed
 * (when `fillStyle` was one of the three flat strings `'auto'`/`'solid'`/
 * `'blur'` and `fillColor` was always a concrete hex) into the current
 * shape/variant/color model. Only `OPEN_PHOTO`'s restore path needs this
 * -- a real user's saved `draftStore.js` blob is the only place a value
 * from before this refactor can still show up.
 */
export function normalizeLegacyFill(fillStyle, fillColor) {
  if (fillStyle === 'auto') return { fillStyle: 'solid', fillColor: 'auto' };
  return { fillStyle: fillStyle ?? 'solid', fillColor: fillColor ?? 'auto' };
}

/** Nudges `[r,g,b]` toward white (`amt` > 0) or black (`amt` < 0); `amt` in [-1, 1]. */
export function shadeRgb([r, g, b], amt) {
  const target = amt >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amt));
  const mix = (c) => Math.round(c + (target - c) * t);
  return [mix(r), mix(g), mix(b)];
}

export function rgbCss([r, g, b], alpha = 1) {
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightDark(baseRgb) {
  return [rgbCss(shadeRgb(baseRgb, 0.35)), rgbCss(shadeRgb(baseRgb, -0.25))];
}

function airmailColors(variant, baseRgb) {
  if (variant === 'classic') return AIRMAIL_CLASSIC;
  if (variant === 'mono') return [rgbCss(baseRgb), '#ffffff'];
  return [rgbCss(shadeRgb(baseRgb, -0.35)), '#ffffff', rgbCss(shadeRgb(baseRgb, 0.35))]; // tonal
}

function stripeGradientCss(colors, bandPx, angleDeg) {
  const stops = colors.map((c, i) => `${c} ${i * bandPx}px ${(i + 1) * bandPx}px`);
  return `repeating-linear-gradient(${angleDeg}deg, ${stops.join(', ')})`;
}

/**
 * CSS `background*`/`border*` properties for one shape+variant+base color
 * -- used by the live preview. `blur` isn't here: it needs the photo's
 * own `background-image`, which only `PostcardCanvas.jsx` has in scope.
 */
export function fillCss(shape, variant, baseRgb) {
  const [light, dark] = lightDark(baseRgb);
  switch (shape) {
    case 'gradient':
      return { background: `linear-gradient(${GRADIENT_ANGLE_DEG[variant]}deg, ${light}, ${dark})` };
    case 'radial':
      return { background: `radial-gradient(circle at ${RADIAL_POSITION[variant]}, ${light}, ${dark})` };
    case 'dots': {
      const spacing = DOT_SPACING[variant];
      return {
        backgroundColor: rgbCss(shadeRgb(baseRgb, 0.85)),
        backgroundImage: `radial-gradient(${rgbCss(baseRgb, 0.45)} ${spacing * 0.14}px, transparent ${spacing * 0.14}px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
      };
    }
    case 'stripes': {
      const [a, b] = [rgbCss(shadeRgb(baseRgb, 0.55)), rgbCss(shadeRgb(baseRgb, -0.05))];
      return { backgroundImage: stripeGradientCss([a, b], 18, STRIPE_ANGLE_DEG[variant]) };
    }
    case 'lines': {
      const spacing = LINE_SPACING[variant];
      const rule = rgbCss(shadeRgb(baseRgb, -0.05), 0.5);
      return {
        backgroundColor: rgbCss(shadeRgb(baseRgb, 0.9)),
        // Two independent layers: a fixed-width vertical "margin" rule
        // (the red line down the side of a school notebook page) plus a
        // repeating horizontal rule pattern -- the vintage-letter-writing-
        // paper look the shape is named for.
        backgroundImage: `linear-gradient(rgba(192, 57, 43, 0.45), rgba(192, 57, 43, 0.45)), repeating-linear-gradient(0deg, transparent 0, transparent ${spacing - 1}px, ${rule} ${spacing - 1}px, ${rule} ${spacing}px)`,
        backgroundSize: '1.5px 100%, 100% 100%',
        backgroundPosition: '10% 0, 0 0',
        backgroundRepeat: 'no-repeat, repeat',
      };
    }
    case 'airmail': {
      const colors = airmailColors(variant, baseRgb);
      const interior = rgbCss(shadeRgb(baseRgb, 0.8));
      return {
        // The classic "gradient border" CSS trick: a transparent border
        // whose width reserves the frame, filled by a second background
        // layer clipped to the border box while the interior layer is
        // clipped to the padding box -- one div, no nested elements.
        border: '11px solid transparent',
        boxSizing: 'border-box',
        backgroundImage: `linear-gradient(${interior}, ${interior}), ${stripeGradientCss(colors, 10, 45)}`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      };
    }
    case 'solid':
    default:
      return { background: rgbCss(baseRgb) };
  }
}

function drawDiagonalBands(ctx, rect, colors, bandPx, angleDeg) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  const diag = Math.hypot(w, h);
  let i = 0;
  for (let p = -diag; p < diag; p += bandPx) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(p, -diag, bandPx, diag * 2);
    i += 1;
  }
  ctx.restore();
}

/**
 * Same shape+variant+base color math as `fillCss`, drawn into a canvas
 * `rect` (device pixels) -- used only at export; `blur` is drawn directly
 * in `export.js` since it needs the already-loaded photo image, not this
 * color math.
 */
export function drawFill(ctx, rect, shape, variant, baseRgb) {
  const { x, y, w, h } = rect;
  const [light, dark] = lightDark(baseRgb);
  switch (shape) {
    case 'gradient': {
      const rad = (GRADIENT_ANGLE_DEG[variant] * Math.PI) / 180;
      const dx = (Math.sin(rad) * w) / 2;
      const dy = (-Math.cos(rad) * h) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      return;
    }
    case 'radial': {
      const [px, py] = RADIAL_POSITION[variant].split(' ').map((p) => parseFloat(p) / 100);
      const cx = x + w * px;
      const cy = y + h * py;
      const r = Math.max(w, h);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      return;
    }
    case 'dots': {
      ctx.fillStyle = rgbCss(shadeRgb(baseRgb, 0.85));
      ctx.fillRect(x, y, w, h);
      const spacing = Math.max(8, Math.round(Math.min(w, h) * (DOT_SPACING[variant] / 200)));
      const radius = spacing * 0.14;
      ctx.fillStyle = rgbCss(baseRgb, 0.45);
      for (let py = y + spacing / 2; py < y + h; py += spacing) {
        for (let px = x + spacing / 2; px < x + w; px += spacing) {
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    case 'stripes': {
      const bandPx = Math.max(6, Math.round(Math.min(w, h) * 0.05));
      const [a, b] = [rgbCss(shadeRgb(baseRgb, 0.55)), rgbCss(shadeRgb(baseRgb, -0.05))];
      drawDiagonalBands(ctx, rect, [a, b], bandPx, STRIPE_ANGLE_DEG[variant]);
      return;
    }
    case 'lines': {
      ctx.fillStyle = rgbCss(shadeRgb(baseRgb, 0.9));
      ctx.fillRect(x, y, w, h);
      const spacing = Math.max(8, Math.round(Math.min(w, h) * (LINE_SPACING[variant] / 200)));
      ctx.strokeStyle = rgbCss(shadeRgb(baseRgb, -0.05), 0.5);
      ctx.lineWidth = Math.max(1, spacing * 0.04);
      for (let ly = y + spacing; ly < y + h; ly += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + w * 0.06, ly);
        ctx.lineTo(x + w * 0.96, ly);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(192, 57, 43, 0.45)';
      ctx.lineWidth = Math.max(1, spacing * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.1, y);
      ctx.lineTo(x + w * 0.1, y + h);
      ctx.stroke();
      return;
    }
    case 'airmail': {
      const colors = airmailColors(variant, baseRgb);
      const bandPx = Math.max(4, Math.round(Math.min(w, h) * 0.035));
      const borderWidth = Math.max(6, Math.round(Math.min(w, h) * 0.055));
      drawDiagonalBands(ctx, rect, colors, bandPx, 45);
      ctx.fillStyle = rgbCss(shadeRgb(baseRgb, 0.8));
      ctx.fillRect(x + borderWidth, y + borderWidth, Math.max(0, w - borderWidth * 2), Math.max(0, h - borderWidth * 2));
      return;
    }
    case 'solid':
    default:
      ctx.fillStyle = rgbCss(baseRgb);
      ctx.fillRect(x, y, w, h);
  }
}
