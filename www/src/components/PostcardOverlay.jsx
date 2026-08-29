import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { FONT_STACKS } from '../fonts';
import { fitFontSize, getMeasureContext } from '../fitText';
import { bestContrastColor, sampleFrameColor, hexToRgb } from '../autoTextColor';
import StickerIcon from './StickerIcon';
import { stickerById } from '../stickers';
import { splitBoundary, toAddressArea } from '../photoLayout';
import { ADDRESS_LINE_COUNT, parseAddressLines } from '../backAddress';

// Used when 'auto' is selected but there's nothing to sample yet (no
// photo loaded, or the shared collage overlay -- see `useAutoTextColor`)
// -- the same dark-ink swatch `renderBackSide` falls back to.
const AUTO_COLOR_FALLBACK = '#241a1e';

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
  address,
  stickers,
  onStickerMove,
  onStickerRemove,
  photoUrl,
  crop,
  cssFilter,
  fillStyle,
  fillColor,
}) {
  const { t } = useI18n();
  const fittedSize = useFittedFontSize(frameRef, geometry, message, font, fontScale);
  const resolvedTextColor = useAutoTextColor(textColor, photoUrl, crop, cssFilter, geometry, fillStyle, fillColor);
  // Split-layout-only elements the user asked to carry over from the
  // back side's own classic-postcard redesign: a real divider at the
  // photo/blank boundary, a labeled stamp placeholder, and a "To" +
  // address block in the space `stampBox`/`messageArea` already leave
  // unused -- see `photoLayout.js`. `undefined` (not `false`) whenever
  // there's nothing to split, so every `split &&` guard below stays a
  // plain falsy check.
  const split = geometry && (geometry.photoArea.w < 1 || geometry.photoArea.h < 1);
  const divider = split && splitBoundary(geometry.photoArea, geometry.blankArea);
  const toBlock = split && toAddressArea(geometry);
  const addressLines = split ? parseAddressLines(address) : [];

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
        >
          {split && <span className="postcard-stamp-label">{t('layout.placeStamp')}</span>}
        </div>
      )}

      {divider && (
        <div
          className={`postcard-divider postcard-divider-${divider.axis}`}
          style={divider.axis === 'x' ? { left: `${divider.pos * 100}%` } : { top: `${divider.pos * 100}%` }}
        />
      )}

      {toBlock && (
        <div
          className="postcard-to-block"
          style={{
            left: `${toBlock.x * 100}%`,
            top: `${toBlock.y * 100}%`,
            width: `${toBlock.w * 100}%`,
            height: `${toBlock.h * 100}%`,
            color: resolvedTextColor,
          }}
        >
          <div className="postcard-to-label">{t('backSide.to')}</div>
          <div className="postcard-to-lines">
            {Array.from({ length: ADDRESS_LINE_COUNT }, (_, i) => (
              <div key={i} className="postcard-to-line">
                {addressLines[i] ?? ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {geometry && message?.trim() && (
        <div
          className="postcard-message"
          style={{
            left: `${geometry.messageArea.x * 100}%`,
            top: `${geometry.messageArea.y * 100}%`,
            width: `${geometry.messageArea.w * 100}%`,
            height: `${geometry.messageArea.h * 100}%`,
            color: resolvedTextColor,
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

/**
 * Resolves 'auto' to a real hex color by sampling the photo behind the
 * message box; passes any other value straight through untouched. Only
 * an *approximation* of what export will pick (see `autoTextColor.js`'s
 * own doc comment for why) -- close enough to preview, not authoritative.
 *
 * `photoUrl`/`crop`/`cssFilter` are optional: `CollageEditor.jsx` shares
 * this same overlay across an entire collage with no single photo to
 * sample, so when they're missing (or nothing's loaded yet) this just
 * falls back to a fixed dark-ink color rather than sampling nothing --
 * `export.js`'s `renderCollage` still resolves 'auto' correctly against
 * the real composited pixels regardless, since it samples the canvas
 * directly rather than going through this hook.
 *
 * When the photo doesn't cover the whole card (`geometry.photoArea` is
 * less than the full unit square), the message sits over the *fill*
 * behind the blank area, not the photo -- sampling `messageArea` out of
 * the cropped photo the way the full-bleed case does would sample the
 * wrong pixels entirely. `fillStyle`/`fillColor` resolve that case
 * instead: any shape paired with a concrete swatch (not the `'auto'`
 * color sentinel) has one fixed, known base color -- every shape in
 * `fillTreatments.js` shades symmetrically lighter/darker around that
 * base, so contrasting against the base itself is a good approximation
 * even for a gradient or a dotted pattern, not just a flat `solid` fill.
 * `blur`, and any shape whose color is `'auto'`, instead approximate to
 * roughly the photo's own overall tone (a blur barely changes an average
 * color, and `'auto'` *is* that average), so sampling the *whole* cropped
 * photo rather than just the sliver behind `messageArea` is the closer
 * approximation there. Either way this stays a preview approximation --
 * `export.js`'s own `renderPostcard` computes the real fill color from
 * the actual composited pixels, same "preview approximates, export is
 * authoritative" split as everywhere else in this file.
 */
function useAutoTextColor(textColor, photoUrl, crop, cssFilter, geometry, fillStyle, fillColor) {
  const [resolved, setResolved] = useState(textColor);
  const imgRef = useRef(null);
  const isFullCoverage = !geometry || (geometry.photoArea.w >= 1 && geometry.photoArea.h >= 1);
  const fillShape = fillStyle ? fillStyle.split(':')[0] : 'solid';

  useEffect(() => {
    if (textColor !== 'auto') {
      setResolved(textColor);
      return undefined;
    }
    if (!isFullCoverage && fillShape !== 'blur' && fillColor && fillColor !== 'auto') {
      setResolved(bestContrastColor(hexToRgb(fillColor)));
      return undefined;
    }
    if (!photoUrl || !crop || !geometry) {
      setResolved(AUTO_COLOR_FALLBACK);
      return undefined;
    }

    let cancelled = false;
    let raf = null;

    const recompute = () => {
      raf = null;
      if (cancelled) return;
      const img = imgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) return;
      try {
        const sampleArea = isFullCoverage ? geometry.messageArea : { x: 0, y: 0, w: 1, h: 1 };
        const avg = sampleFrameColor(img, crop, cssFilter, sampleArea);
        setResolved(bestContrastColor(avg));
      } catch {
        setResolved(AUTO_COLOR_FALLBACK);
      }
    };
    const schedule = () => {
      if (raf === null) raf = requestAnimationFrame(recompute);
    };

    let img = imgRef.current;
    if (!img || img.src !== photoUrl) {
      img = new Image();
      img.onload = schedule;
      img.src = photoUrl;
      imgRef.current = img;
    }
    schedule();

    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- crop's own
    // fields are the real dependency, not its object identity, which
    // changes on every pan/zoom dispatch.
  }, [textColor, photoUrl, crop?.x, crop?.y, crop?.w, crop?.h, cssFilter, geometry, isFullCoverage, fillStyle, fillColor]);

  return resolved;
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
