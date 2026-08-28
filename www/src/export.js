import { FONT_STACKS } from './fonts';
import { fitFontSize } from './fitText';
import { stickerById, stickerDataUrl } from './stickers';
import { wrapText } from './wordwrap';
import { averageColor, bestContrastColor } from './autoTextColor';

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
    const canvas = document.createElement('canvas');
    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(baseImg, 0, 0);

    drawMessage(ctx, canvas, { message, font, fontScale, textColor, textAlign, geometry });
    await drawStickers(ctx, canvas, stickers);
    drawStrokes(ctx, canvas, strokes);

    return await canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(baseUrl);
  }
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

  drawMessage(ctx, canvas, { message, font, fontScale, textColor, textAlign, geometry });
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
  date,
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

  ctx.strokeStyle = 'rgba(36, 26, 30, 0.15)';
  ctx.lineWidth = Math.max(1, canvasW * 0.0015);
  for (let y = marginY + lineGap; y < canvasH - marginY; y += lineGap) {
    ctx.beginPath();
    ctx.moveTo(marginX, y);
    ctx.lineTo(canvasW - marginX, y);
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
    // No photo on this side to sample -- the background is always the
    // same flat `backgroundColor` above, so 'auto' has one fixed answer
    // (in practice always the dark ink swatch) rather than needing a
    // pixel sample like the front's `drawMessage` does.
    ctx.fillStyle = textColor === 'auto' ? bestContrastColor([244, 237, 224]) : textColor;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const lines = wrapText(ctx, message, canvasW - marginX * 2);
    let y = marginY + lineGap - lineGap * 0.25;
    for (const line of lines) {
      if (y > canvasH - marginY) break;
      ctx.fillText(line, marginX, y);
      y += lineGap;
    }
  }

  const stampDef = stickerById('stamp');
  const stampSize = Math.min(canvasW, canvasH) * 0.18;
  const stampTop = marginY * 0.6;
  if (stampDef) {
    const stampImg = await loadImage(stickerDataUrl(stampDef));
    ctx.drawImage(stampImg, canvasW - marginX - stampSize, stampTop, stampSize, stampSize);
  }

  const postmark = [date, location].filter(Boolean).join(' • ');
  if (postmark) {
    ctx.font = `${canvasH * 0.025}px ${FONT_STACKS.system}`;
    ctx.fillStyle = 'rgba(36, 26, 30, 0.55)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(postmark, canvasW - marginX, stampTop + stampSize + 8);
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

function drawMessage(ctx, canvas, { message, font, fontScale = 1, textColor, textAlign, geometry }) {
  if (!message?.trim()) return;
  const area = geometry.messageArea;
  const x = area.x * canvas.width;
  const y = area.y * canvas.height;
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
