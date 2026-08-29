import { FONT_STACKS } from './fonts';
import { fitFontSize } from './fitText';
import { parseAddressLines } from './backAddress';
import { splitBoundary, toAddressArea } from './photoLayout';
import { stickerById, stickerDataUrl } from './stickers';
import { wrapText } from './wordwrap';
import { averageColor, bestContrastColor, hexToRgb } from './autoTextColor';
import { drawFill, parseFillStyle } from './fillTreatments';

/**
 * The one-time "flatten to final image" step -- see CLAUDE.md for why
 * this, and only this, is where text, stickers and doodle strokes ever
 * touch pixels. `postcard-wasm`'s `process_photo` does the crop/filter/
 * resize (the real algorithm work); everything here is drawing
 * already-decided content onto a plain `<canvas>` with the platform's own
 * text renderer, so CJK shaping is never this app's problem to solve.
 */
export async function renderPostcard({
  wasmModule,
  photoBytes,
  crop,
  adjustments,
  filter,
  message,
  font,
  fontScale = 1,
  textColor,
  textAlign,
  stickers,
  strokes,
  geometry,
  fillStyle = 'auto',
  fillColor,
  address,
  toLabel = 'To',
  messagePosition,
  maxDimension = 2000,
}) {
  const bytes = wasmModule.process_photo(photoBytes, {
    cropX: crop.x,
    cropY: crop.y,
    cropW: crop.w,
    cropH: crop.h,
    brightness: adjustments.brightness,
    contrast: adjustments.contrast,
    saturation: adjustments.saturation,
    filter,
    maxDimension,
    format: 'jpeg',
    quality: 90,
  });

  const baseUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  try {
    const baseImg = await loadImage(baseUrl);
    const photoArea = geometry.photoArea;
    // `process_photo` already cropped/filtered/resized to `crop`'s own
    // ratio -- `crop` was suggested against `photoArea`'s own on-card
    // pixel ratio (see `photoLayout.js`), so `baseImg`'s dimensions are
    // exactly the photo box's own size. The whole card's own pixel size
    // follows from that plus the fraction of the card the photo box
    // occupies -- for `photoArea` = the whole unit square (full-bleed),
    // this reduces to exactly `baseImg`'s own dimensions, same as before
    // this split layout existed.
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(baseImg.naturalWidth / photoArea.w));
    canvas.height = Math.max(1, Math.round(baseImg.naturalHeight / photoArea.h));
    const ctx = canvas.getContext('2d');

    const split = photoArea.w < 1 || photoArea.h < 1;
    const photoRect = {
      x: photoArea.x * canvas.width,
      y: photoArea.y * canvas.height,
      w: photoArea.w * canvas.width,
      h: photoArea.h * canvas.height,
    };

    const { shape, variant } = parseFillStyle(fillStyle);

    if (split && shape === 'blur') {
      // A stretched, blurred copy of the photo across the whole canvas
      // first -- the sharp photo drawn on top only touches its own area,
      // so the blur shows through everywhere else without a second,
      // separate "fill the blank rect" step. The only shape that ignores
      // `fillColor` entirely -- its "color" is the photo itself.
      const blurPx = Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * 0.04));
      ctx.filter = `blur(${blurPx}px)`;
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
    }

    ctx.drawImage(baseImg, photoRect.x, photoRect.y, photoRect.w, photoRect.h);

    if (split && shape !== 'blur') {
      // `photoRect` and `blankArea` never overlap (see
      // `postcard-calc::template::geometry`'s own tests), so filling just
      // the blank rect works regardless of draw order -- unlike `blur`
      // above, nothing here needs to happen before the photo is drawn.
      const baseRgb =
        fillColor === 'auto'
          ? // Sampled from the real pixels just drawn above -- exact, not
            // an approximation, same reasoning `drawMessage`'s own 'auto'
            // text color sampling below already relies on.
            averageColor(
              ctx.getImageData(Math.round(photoRect.x), Math.round(photoRect.y), Math.max(1, Math.round(photoRect.w)), Math.max(1, Math.round(photoRect.h))),
            ).map(Math.round)
          : hexToRgb(fillColor);
      const blank = geometry.blankArea;
      drawFill(
        ctx,
        { x: blank.x * canvas.width, y: blank.y * canvas.height, w: blank.w * canvas.width, h: blank.h * canvas.height },
        shape,
        variant,
        baseRgb,
      );
    }

    // The same classic-postcard elements added to the back side
    // (`renderBackSide` below) carried over to the front's own split
    // side, at the user's request: a real divider at the photo/blank
    // boundary, a dashed stamp placeholder (today's `.postcard-stamp-
    // guide` is preview-only and never bakes into the export), and a
    // "To" + address block in the gap `stampBox`/`messageArea` already
    // leave unused. Gated on `split` so a full-bleed card's export is
    // completely unaffected -- same "default path provably unchanged"
    // guarantee the split layout itself was built with.
    if (split) {
      drawSplitDivider(ctx, canvas, geometry);
      drawStampPlaceholder(ctx, canvas, geometry);
      drawFrontAddressBlock(ctx, canvas, geometry, { toLabel, address, font, textColor });
    }

    drawMessage(ctx, canvas, { message, font, fontScale, textColor, textAlign, geometry, messagePosition });
    await drawStickers(ctx, canvas, stickers);
    drawStrokes(ctx, canvas, strokes);

    return await canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(baseUrl);
  }
}

/** Draws a real rule line at the photo/blank boundary of a split layout
 * -- an outlined white line (dark outline, light fill) so it stays
 * visible regardless of what color the photo or the fill happen to be,
 * the same reasoning `.postcard-stamp-guide`'s own dashed border already
 * uses for the same reason. */
function drawSplitDivider(ctx, canvas, geometry) {
  const { axis, pos } = splitBoundary(geometry.photoArea, geometry.blankArea);
  const outlineW = Math.max(3, Math.min(canvas.width, canvas.height) * 0.006);
  const lineW = outlineW * 0.4;
  if (axis === 'x') {
    const x = pos * canvas.width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x - outlineW / 2, 0, outlineW, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(x - lineW / 2, 0, lineW, canvas.height);
  } else {
    const y = pos * canvas.height;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, y - outlineW / 2, canvas.width, outlineW);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(0, y - lineW / 2, canvas.width, lineW);
  }
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bakes the live-preview-only `.postcard-stamp-guide` (see
 * `PostcardOverlay.jsx`) into the export -- a plain dashed square, no
 * label -- but only for a split layout: a full-bleed card's guide stays
 * exactly what it's always been, a hint for where to drag an actual
 * stamp sticker, not something that appears in the exported image. */
function drawStampPlaceholder(ctx, canvas, geometry) {
  const box = geometry.stampBox;
  const x = box.x * canvas.width;
  const y = box.y * canvas.height;
  const w = box.w * canvas.width;
  const h = box.h * canvas.height;
  const radius = Math.min(w, h) * 0.08;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.02);
  ctx.setLineDash([ctx.lineWidth * 2, ctx.lineWidth * 1.5]);
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 'auto' resolves against whatever's actually drawn under `rectPx` --
 * exact, not an approximation, same reasoning `drawMessage`'s own 'auto'
 * sampling below relies on. Any other value passes straight through. */
function resolveInkColor(ctx, textColor, rectPx) {
  if (textColor !== 'auto') return textColor;
  return bestContrastColor(
    averageColor(ctx.getImageData(Math.round(rectPx.x), Math.round(rectPx.y), Math.max(1, Math.round(rectPx.w)), Math.max(1, Math.round(rectPx.h)))),
  );
}

/** The front's own "To" + address block, in the gap `stampBox`/
 * `messageArea` leave unused within `blankArea` -- see `photoLayout.js`'s
 * `toAddressArea`. Reuses the same `address` text as the back side
 * (`BackSidePanel.jsx` has only one address field, not a separate one
 * per side) and the same one-shared-size-for-every-line reasoning
 * `renderBackSide` already applies. */
function drawFrontAddressBlock(ctx, canvas, geometry, { toLabel, address, font, textColor }) {
  const area = toAddressArea(geometry);
  if (!area) return;
  const x = area.x * canvas.width;
  const y = area.y * canvas.height;
  const w = area.w * canvas.width;
  const h = area.h * canvas.height;
  const fontFamily = FONT_STACKS[font] ?? FONT_STACKS.system;
  const ink = resolveInkColor(ctx, textColor, { x, y, w, h });

  const toLabelFontSize = Math.min(h * 0.22, canvas.height * 0.045);
  ctx.font = `700 ${toLabelFontSize}px ${fontFamily}`;
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const toLabelY = y + toLabelFontSize;
  ctx.fillText(toLabel, x, toLabelY);

  const addressLineCount = 4;
  const addressTop = toLabelY + h * 0.08;
  const addressLineGap = (y + h - addressTop) / addressLineCount;
  if (addressLineGap <= 0) return;

  ctx.strokeStyle = hexToRgba(ink, 0.35);
  ctx.lineWidth = Math.max(1, w * 0.006);
  for (let i = 1; i <= addressLineCount; i += 1) {
    const ly = addressTop + addressLineGap * i;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ctx.stroke();
  }

  const addressLines = parseAddressLines(address);
  if (addressLines.length === 0) return;
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const fontSize = Math.min(
    ...addressLines.map((line) => fitFontSize(ctx, line, w, addressLineGap * 0.95, { min: 8, max: addressLineGap * 0.6, fontFamily })),
  );
  ctx.font = `${fontSize}px ${fontFamily}`;
  addressLines.forEach((line, i) => {
    const ly = addressTop + addressLineGap * (i + 1) - addressLineGap * 0.25;
    ctx.fillText(line, x, ly);
  });
}

/**
 * Same idea as `renderPostcard`, for a multi-photo collage: each slot's
 * photo is processed independently through the exact same
 * `process_photo` call (no new Rust needed -- a collage is N independent
 * photos, not a new algorithm), then drawn into its own area on one
 * shared canvas before the shared message/stickers/doodle layer (never
 * per-slot -- see `CLAUDE.md`) goes on top.
 */
export async function renderCollage({
  wasmModule,
  aspectRatio,
  slots,
  message,
  font,
  fontScale = 1,
  textColor,
  textAlign,
  stickers,
  strokes,
  geometry,
  messagePosition,
  longSide = 1600,
}) {
  const canvasW = aspectRatio >= 1 ? longSide : Math.round(longSide * aspectRatio);
  const canvasH = aspectRatio >= 1 ? Math.round(longSide / aspectRatio) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  for (const s of slots) {
    const slotX = s.area.x * canvasW;
    const slotY = s.area.y * canvasH;
    const slotW = Math.round(s.area.w * canvasW);
    const slotH = Math.round(s.area.h * canvasH);

    const bytes = wasmModule.process_photo(s.photoBytes, {
      cropX: s.crop.x,
      cropY: s.crop.y,
      cropW: s.crop.w,
      cropH: s.crop.h,
      brightness: s.adjustments.brightness,
      contrast: s.adjustments.contrast,
      saturation: s.adjustments.saturation,
      filter: s.filter,
      maxDimension: Math.max(slotW, slotH),
      format: 'jpeg',
      quality: 90,
    });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    try {
      // eslint-disable-next-line no-await-in-loop -- slots draw in order
      // so a later one can legitimately overlap an earlier one's edge
      // (anti-aliasing seams), same reasoning as stickers below.
      const img = await loadImage(url);
      ctx.drawImage(img, slotX, slotY, slotW, slotH);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  drawMessage(ctx, canvas, { message, font, fontScale, textColor, textAlign, geometry, messagePosition });
  await drawStickers(ctx, canvas, stickers);
  drawStrokes(ctx, canvas, strokes);

  return canvasToJpeg(canvas);
}

/**
 * The optional second image: a plain postcard back -- lined paper, the
 * greeting written larger across the lines, a stamp graphic, and a
 * postmark-style date/location line. No Rust involved at all: there's no
 * photo here, so this is pure host-layer canvas drawing, the same
 * category as `drawMessage` below.
 */
export async function renderBackSide({
  aspectRatio,
  longSide = 1600,
  message,
  font,
  fontScale = 1,
  textColor = '#241a1e',
  location,
  address,
  date,
  toLabel = 'To',
}) {
  const canvasW = aspectRatio >= 1 ? longSide : Math.round(longSide * aspectRatio);
  const canvasH = aspectRatio >= 1 ? Math.round(longSide / aspectRatio) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  const backgroundColor = '#f4ede0';
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const marginX = canvasW * 0.06;
  const marginY = canvasH * 0.08;
  const lineGap = canvasH * 0.09;
  const inkColor = textColor === 'auto' ? bestContrastColor([244, 237, 224]) : textColor;

  // The classic divided postcard back: a message column on the left, a
  // vertical rule, then a "To" address column with the stamp corner --
  // every real postcard template shares this layout (see the reference
  // photo this was built from). 60/40 rather than an even half: a
  // greeting is usually the longer of the two, an address rarely needs
  // more than 4 short lines.
  const dividerX = marginX + (canvasW - marginX * 2) * 0.6;
  const dividerGap = canvasW * 0.02;
  const rightX = dividerX + dividerGap;

  ctx.strokeStyle = 'rgba(36, 26, 30, 0.15)';
  ctx.lineWidth = Math.max(1, canvasW * 0.0015);
  for (let y = marginY + lineGap; y < canvasH - marginY; y += lineGap) {
    ctx.beginPath();
    ctx.moveTo(marginX, y);
    ctx.lineTo(dividerX - dividerGap, y);
    ctx.stroke();
  }

  if (message?.trim()) {
    // Scaled, not auto-fit, on purpose: the back side's lines are drawn
    // at a fixed `lineGap`, so the default size is the one already tuned
    // to sit on them -- full auto-fit would decouple the text baseline
    // from the ruled lines it's meant to sit on. `fontScale` still lets
    // someone go bigger/smaller deliberately.
    const fontSize = lineGap * 0.55 * fontScale;
    ctx.font = `${fontSize}px ${FONT_STACKS[font] ?? FONT_STACKS.system}`;
    ctx.fillStyle = inkColor;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const lines = wrapText(ctx, message, dividerX - dividerGap - marginX);
    let y = marginY + lineGap - lineGap * 0.25;
    for (const line of lines) {
      if (y > canvasH - marginY) break;
      ctx.fillText(line, marginX, y);
      y += lineGap;
    }
  }

  ctx.strokeStyle = 'rgba(36, 26, 30, 0.35)';
  ctx.lineWidth = Math.max(1.5, canvasW * 0.002);
  ctx.beginPath();
  ctx.moveTo(dividerX, marginY);
  ctx.lineTo(dividerX, canvasH - marginY);
  ctx.stroke();

  const stampDef = stickerById('stamp');
  const stampSize = Math.min(canvasW, canvasH) * 0.18;
  const stampTop = marginY * 0.6;
  if (stampDef) {
    const stampImg = await loadImage(stickerDataUrl(stampDef));
    ctx.drawImage(stampImg, canvasW - marginX - stampSize, stampTop, stampSize, stampSize);
  }

  // A real vertical cursor, not a fixed offset guessed to clear whatever
  // the postmark happens to need -- a wider translated "To" label (e.g.
  // "收件人") at a fixed offset from the stamp collided with the postmark
  // line above it, since that offset was sized for the English word "To"
  // and never actually accounted for the postmark's own height.
  let rightCursorY = stampTop + stampSize;

  const postmark = [date, location].filter(Boolean).join(' • ');
  if (postmark) {
    const postmarkFontSize = canvasH * 0.025;
    ctx.font = `${postmarkFontSize}px ${FONT_STACKS.system}`;
    ctx.fillStyle = 'rgba(36, 26, 30, 0.55)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(postmark, canvasW - marginX, rightCursorY + 8);
    rightCursorY += 8 + postmarkFontSize * 1.3;
  }

  // "To:" + 4 ruled lines for the recipient's address, the other half of
  // the classic divided layout -- see the module doc comment above.
  const toLabelFontSize = canvasH * 0.045;
  ctx.font = `700 ${toLabelFontSize}px ${FONT_STACKS.system}`;
  ctx.fillStyle = inkColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const toLabelY = rightCursorY + toLabelFontSize;
  ctx.fillText(toLabel, rightX, toLabelY);

  const addressLineCount = 4;
  const addressTop = toLabelY + canvasH * 0.035;
  const addressLineGap = (canvasH - marginY - addressTop) / addressLineCount;
  const addressRight = canvasW - marginX;

  ctx.strokeStyle = 'rgba(36, 26, 30, 0.3)';
  ctx.lineWidth = Math.max(1, canvasW * 0.0015);
  for (let i = 1; i <= addressLineCount; i += 1) {
    const y = addressTop + addressLineGap * i;
    ctx.beginPath();
    ctx.moveTo(rightX, y);
    ctx.lineTo(addressRight, y);
    ctx.stroke();
  }

  const addressLines = parseAddressLines(address);
  if (addressLines.length > 0) {
    const fontFamily = FONT_STACKS[font] ?? FONT_STACKS.system;
    ctx.fillStyle = inkColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // One shared size for every line, not each line fit independently --
    // an address is a name and two short lines side by side, and fitting
    // each to its own width would size "Jane Doe" far larger than the
    // street/city lines next to it, reading like a ransom note instead
    // of one address block. Sized to whichever line is tightest.
    const fontSize = Math.min(
      ...addressLines.map((line) =>
        fitFontSize(ctx, line, addressRight - rightX, addressLineGap * 0.95, {
          min: 10,
          max: addressLineGap * 0.6,
          fontFamily,
        }),
      ),
    );
    ctx.font = `${fontSize}px ${fontFamily}`;
    addressLines.forEach((line, i) => {
      const y = addressTop + addressLineGap * (i + 1) - addressLineGap * 0.25;
      ctx.fillText(line, rightX, y);
    });
  }

  return canvasToJpeg(canvas);
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      'image/jpeg',
      0.92,
    );
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function drawMessage(ctx, canvas, { message, font, fontScale = 1, textColor, textAlign, geometry, messagePosition }) {
  if (!message?.trim()) return;
  const area = geometry.messageArea;
  // `messagePosition` overrides where the box sits (see
  // `postcardReducer.js`), not its size -- same convention
  // `PostcardOverlay.jsx`'s live preview uses when the message has been
  // dragged.
  const x = (messagePosition?.x ?? area.x) * canvas.width;
  const y = (messagePosition?.y ?? area.y) * canvas.height;
  const w = area.w * canvas.width;
  const h = area.h * canvas.height;
  const fontFamily = FONT_STACKS[font] ?? FONT_STACKS.system;

  // The same fit-to-content search `PostcardOverlay.jsx`'s live preview
  // uses, run against this real canvas context instead of a shared
  // detached one -- see `fitText.js`. Keeps the exported size matching
  // what was shown while editing, not a separate fixed formula.
  const fontSize = fitFontSize(ctx, message, w, h, { fontFamily }) * fontScale;
  ctx.font = `${fontSize}px ${fontFamily}`;
  // 'auto' is resolved here, not earlier -- this is the one point in the
  // whole export pipeline with the real, final composited pixels already
  // on the canvas (the base photo, drawn before this function runs), so
  // sampling `getImageData` here is exact, not the CSS-filter
  // approximation the live preview has to use instead. See
  // `autoTextColor.js`.
  ctx.fillStyle =
    textColor === 'auto'
      ? bestContrastColor(averageColor(ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))))
      : textColor;
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;

  const lines = wrapText(ctx, message, w);
  const lineHeight = fontSize * 1.3;
  const maxLines = Math.max(1, Math.floor(h / lineHeight));

  const startX = textAlign === 'left' ? x : textAlign === 'right' ? x + w : x + w / 2;
  lines.slice(0, maxLines).forEach((line, i) => {
    ctx.fillText(line, startX, y + i * lineHeight);
  });
}

async function drawStickers(ctx, canvas, stickers) {
  for (const sticker of stickers ?? []) {
    const def = stickerById(sticker.id);
    if (!def) continue;
    // eslint-disable-next-line no-await-in-loop -- stickers must draw in
    // placement order, since later ones are meant to sit on top.
    const img = await loadImage(stickerDataUrl(def));
    const size = Math.min(canvas.width, canvas.height) * 0.22 * (sticker.scale ?? 1);
    const cx = sticker.x * canvas.width;
    const cy = sticker.y * canvas.height;
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  }
}

/** Mirrors `DoodleLayer.jsx`'s own stroke rendering exactly (same
 * `width * (canvas.width / 100)` scale convention) so a stroke drawn in
 * the live preview lands the same way in the export. */
function drawStrokes(ctx, canvas, strokes) {
  for (const stroke of strokes ?? []) {
    if (stroke.points.length < 2) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * (canvas.width / 100);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    stroke.points.forEach((p, i) => {
      const x = p.x * canvas.width;
      const y = p.y * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
