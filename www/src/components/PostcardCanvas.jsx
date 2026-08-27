import React, { useCallback, useRef } from 'react';
import { useI18n } from '../i18n';
import { panCrop } from '../cropGesture';
import { previewFilterCss } from '../previewFilter';
import { FONT_STACKS } from '../fonts';
import StickerIcon from './StickerIcon';
import { stickerById } from '../stickers';

/**
 * The live editor preview: a fixed-aspect frame showing the current crop
 * of the photo (via CSS `background-position`/`background-size`, not a
 * `<canvas>` redraw -- panning and zooming are just background-image math,
 * so every drag frame is a style write, nothing more) with the filter
 * preview, message and stickers layered as plain DOM on top. The one real
 * `<canvas>` this app uses is `export.js`'s one-shot bake; see CLAUDE.md.
 */
export default function PostcardCanvas({
  photoUrl,
  naturalW,
  naturalH,
  crop,
  onCropChange,
  aspectRatio,
  adjustments,
  filter,
  geometry,
  message,
  font,
  textColor,
  textAlign,
  stickers,
  onStickerMove,
  onStickerRemove,
}) {
  const frameRef = useRef(null);
  const drag = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, crop };
    },
    [crop],
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!drag.current || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      // The frame's on-screen width represents `crop.w` source pixels, so
      // that ratio converts a screen-space drag into source pixels.
      const scale = drag.current.crop.w / rect.width;
      const dxScreen = e.clientX - drag.current.x;
      const dyScreen = e.clientY - drag.current.y;
      const next = panCrop(
        drag.current.crop,
        dxScreen * scale,
        dyScreen * scale,
        naturalW,
        naturalH,
      );
      onCropChange(next);
    },
    [naturalW, naturalH, onCropChange],
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  const bgSizeX = (naturalW / crop.w) * 100;
  const bgSizeY = (naturalH / crop.h) * 100;
  const bgPosX = naturalW > crop.w ? (crop.x / (naturalW - crop.w)) * 100 : 0;
  const bgPosY = naturalH > crop.h ? (crop.y / (naturalH - crop.h)) * 100 : 0;

  const frameStyle = {
    aspectRatio,
    backgroundImage: `url(${photoUrl})`,
    backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
    backgroundPosition: `${bgPosX}% ${bgPosY}%`,
    filter: previewFilterCss(adjustments, filter),
  };

  return (
    <div
      ref={frameRef}
      className="postcard-frame"
      style={frameStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {filter === 'vintage' && <div className="postcard-vignette" />}

      {geometry && (
        <div
          className="postcard-stamp-guide"
          style={{
            left: `${geometry.stampBox.x * 100}%`,
            top: `${geometry.stampBox.y * 100}%`,
            width: `${geometry.stampBox.w * 100}%`,
            height: `${geometry.stampBox.h * 100}%`,
          }}
        />
      )}

      {geometry && message?.trim() && (
        <div
          className="postcard-message"
          style={{
            left: `${geometry.messageArea.x * 100}%`,
            top: `${geometry.messageArea.y * 100}%`,
            width: `${geometry.messageArea.w * 100}%`,
            height: `${geometry.messageArea.h * 100}%`,
            color: textColor,
            textAlign,
            fontFamily: FONT_STACKS[font] ?? FONT_STACKS.system,
            fontSize: 'clamp(12px, 3.4cqw, 28px)',
          }}
        >
          {message}
        </div>
      )}

      {stickers.map((sticker, index) => (
        <StickerOverlay
          key={sticker.key}
          sticker={sticker}
          frameRef={frameRef}
          onMove={(x, y) => onStickerMove(index, x, y)}
          onRemove={() => onStickerRemove(index)}
        />
      ))}
    </div>
  );
}

function StickerOverlay({ sticker, frameRef, onMove, onRemove }) {
  const { t } = useI18n();
  const def = stickerById(sticker.id);
  const drag = useRef(null);

  const onPointerDown = useCallback((e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, sticker: { ...sticker } };
  }, [sticker]);

  const onPointerMove = useCallback(
    (e) => {
      if (!drag.current || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      const dx = (e.clientX - drag.current.x) / rect.width;
      const dy = (e.clientY - drag.current.y) / rect.height;
      onMove(
        Math.min(1, Math.max(0, drag.current.sticker.x + dx)),
        Math.min(1, Math.max(0, drag.current.sticker.y + dy)),
      );
    },
    [frameRef, onMove],
  );

  const onPointerUp = useCallback((e) => {
    e.stopPropagation();
    drag.current = null;
  }, []);

  if (!def) return null;

  const size = `${22 * (sticker.scale ?? 1)}cqmin`;

  return (
    <div
      className="postcard-sticker"
      style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: size, height: size }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <StickerIcon sticker={def} />
      <button
        type="button"
        className="postcard-sticker-remove"
        aria-label={t('stickers.remove')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
      >
        &times;
      </button>
    </div>
  );
}
