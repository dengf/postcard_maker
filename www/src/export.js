import { FONT_STACKS } from './fonts';
import { stickerById, stickerDataUrl } from './stickers';
import { wrapText } from './wordwrap';

/**
 * The one-time "flatten to final image" step -- see CLAUDE.md for why
 * this, and only this, is where text and stickers ever touch pixels.
 * `postcard-wasm`'s `process_photo` does the crop/filter/resize (the real
 * algorithm work); everything here is drawing already-decided content
 * onto a plain `<canvas>` with the platform's own text renderer, so CJK
 * shaping is never this app's problem to solve.
 */
export async function renderPostcard({
  wasmModule,
  photoBytes,
  crop,
  adjustments,
  filter,
  message,
  font,
  textColor,
  textAlign,
  stickers,
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

    drawMessage(ctx, canvas, { message, font, textColor, textAlign, geometry });
    await drawStickers(ctx, canvas, stickers);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        0.92,
      );
    });
  } finally {
    URL.revokeObjectURL(baseUrl);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function drawMessage(ctx, canvas, { message, font, textColor, textAlign, geometry }) {
  if (!message?.trim()) return;
  const area = geometry.messageArea;
  const x = area.x * canvas.width;
  const y = area.y * canvas.height;
  const w = area.w * canvas.width;
  const h = area.h * canvas.height;

  const fontSize = Math.max(14, h * 0.22);
  ctx.font = `${fontSize}px ${FONT_STACKS[font] ?? FONT_STACKS.system}`;
  ctx.fillStyle = textColor;
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
