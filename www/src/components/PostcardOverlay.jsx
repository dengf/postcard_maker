import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { FONT_STACKS } from '../fonts';
import { fitFontSize, getMeasureContext } from '../fitText';
import StickerIcon from './StickerIcon';
import { stickerById } from '../stickers';

/**
 * The stamp guide, greeting message and stickers layered over a card --
 * extracted out of `PostcardCanvas` so the exact same overlay (positioned
 * against `frameRef`, whatever that element is) works both for the
 * single-photo card and for the shared layer over an entire collage
 * (`CollageEditor.jsx`), where it sits over every slot at once rather
 * than any one photo. Pure extraction, no behavior change for the
 * single-photo path.
 */
export default function PostcardOverlay({
  frameRef,
  geometry,
  message,
  font,
  fontScale,
  textColor,
  textAlign,
  stickers,
  onStickerMove,
  onStickerRemove,
}) {
  const fittedSize = useFittedFontSize(frameRef, geometry, message, font, fontScale);

  return (
    <>
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
            fontSize: `${fittedSize}px`,
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
    </>
  );
}

/**
 * The largest size that fits `message` inside the message area, scaled
 * by the user's manual override -- see `fitText.js`'s own doc comment
 * for why a fixed formula isn't good enough. Recomputed on resize via
 * the same deferred-to-`requestAnimationFrame` `ResizeObserver` pattern
 * `DoodleLayer.jsx` uses, for the same reason: resizing something inside
 * its own observer callback can trigger a synchronous loop Chrome
 * reports as an (spec-legal but dev-overlay-blocking) error.
 */
function useFittedFontSize(frameRef, geometry, message, font, fontScale) {
  const [size, setSize] = useState(16);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !geometry || !message?.trim()) return undefined;

    let raf = null;
    const recompute = () => {
      raf = null;
      const rect = frame.getBoundingClientRect();
      const boxW = rect.width * geometry.messageArea.w;
      const boxH = rect.height * geometry.messageArea.h;
      const fitted = fitFontSize(getMeasureContext(), message, boxW, boxH, {
        fontFamily: FONT_STACKS[font] ?? FONT_STACKS.system,
      });
      setSize(fitted * fontScale);
    };
    const schedule = () => {
      if (raf === null) raf = requestAnimationFrame(recompute);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [frameRef, geometry, message, font, fontScale]);

  return size;
}

function StickerOverlay({ sticker, frameRef, onMove, onRemove }) {
  const { t } = useI18n();
  const def = stickerById(sticker.id);
  const drag = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, sticker: { ...sticker } };
    },
    [sticker],
  );

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
