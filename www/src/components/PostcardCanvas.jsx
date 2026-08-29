import React, { useCallback, useEffect, useRef, useState } from 'react';
import { panCrop } from '../cropGesture';
import { previewFilterCss } from '../previewFilter';
import { sampleFrameColor } from '../autoTextColor';
import PostcardOverlay from './PostcardOverlay';
import DoodleLayer from './DoodleLayer';

const FULL_AREA = { x: 0, y: 0, w: 1, h: 1 };

/**
 * A live-preview approximation of the "auto" blank-area fill: the
 * average color of the cropped photo, sampled the same way
 * `PostcardOverlay.jsx`'s own `useAutoTextColor` samples for a live
 * preview (a small offscreen canvas redraw, not a real composited
 * canvas) -- `export.js`'s `renderPostcard` computes the authoritative
 * version from the real drawn pixels, same "preview approximates, export
 * is authoritative" split as everywhere else this app does this.
 */
function useAutoFillColor(photoUrl, crop, cssFilter, active) {
  const [color, setColor] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!active || !photoUrl || !crop) {
      setColor(null);
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
        const [r, g, b] = sampleFrameColor(img, crop, cssFilter, FULL_AREA);
        setColor(`rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`);
      } catch {
        setColor(null);
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
    // fields are the real dependency, not its object identity.
  }, [photoUrl, crop?.x, crop?.y, crop?.w, crop?.h, cssFilter, active]);

  return color;
}

/**
 * The live editor preview: a fixed-aspect frame showing the current crop
 * of the photo (via CSS `background-position`/`background-size`, not a
 * `<canvas>` redraw -- panning and zooming are just background-image math,
 * so every drag frame is a style write, nothing more) with the filter
 * preview, message, stickers (`PostcardOverlay`) and doodle strokes
 * (`DoodleLayer`) layered as plain DOM on top. The one real `<canvas>`
 * this app uses is `export.js`'s one-shot bake; see CLAUDE.md.
 *
 * The photo itself lives in an inner `.postcard-photo-box`, positioned by
 * `geometry.photoArea` (the whole frame when the photo is full-bleed, a
 * sub-rect otherwise -- see `postcard-calc::template::geometry`). The
 * outer frame always keeps the card's own aspect ratio regardless, which
 * is why `PostcardOverlay`'s message/stamp/sticker positions (already
 * frame-relative fractions) need no changes for the split layout at all.
 * A `.postcard-fill` layer behind the photo box shows `fillStyle`: a
 * plain background color for `solid`/`auto`, or a second, blurred copy of
 * the photo stretched across the whole frame for `blur` -- visible
 * everywhere the sharp photo box doesn't cover.
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
  fillStyle,
  fillColor,
  message,
  font,
  fontScale,
  textColor,
  textAlign,
  stickers,
  onStickerMove,
  onStickerRemove,
  strokes,
  drawMode,
  strokeColor,
  strokeWidth,
  onAddStroke,
}) {
  const frameRef = useRef(null);
  const photoBoxRef = useRef(null);
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
      if (!drag.current || !photoBoxRef.current) return;
      const rect = photoBoxRef.current.getBoundingClientRect();
      // The photo box's on-screen width represents `crop.w` source
      // pixels, so that ratio converts a screen-space drag into source
      // pixels -- same idea as before this box existed, just scoped to
      // the box's own (possibly less-than-full-frame) size now.
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
  const cssFilter = previewFilterCss(adjustments, filter);

  const photoArea = geometry?.photoArea ?? FULL_AREA;
  const split = photoArea.w < 1 || photoArea.h < 1;
  const autoFillColor = useAutoFillColor(photoUrl, crop, cssFilter, split && fillStyle === 'auto');

  const photoBoxStyle = {
    left: `${photoArea.x * 100}%`,
    top: `${photoArea.y * 100}%`,
    width: `${photoArea.w * 100}%`,
    height: `${photoArea.h * 100}%`,
    backgroundImage: `url(${photoUrl})`,
    backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
    backgroundPosition: `${bgPosX}% ${bgPosY}%`,
    filter: cssFilter,
  };

  return (
    <div className="postcard-frame" style={{ aspectRatio, '--card-ratio': aspectRatio }} ref={frameRef}>
      {split && (
        <div
          className="postcard-fill"
          style={
            fillStyle === 'blur'
              ? {
                  backgroundImage: `url(${photoUrl})`,
                  backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
                  backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                  filter: `${cssFilter} blur(18px)`,
                }
              : { background: fillStyle === 'auto' ? (autoFillColor ?? fillColor) : fillColor }
          }
        />
      )}

      <div
        ref={photoBoxRef}
        className="postcard-photo-box"
        style={photoBoxStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {filter === 'vintage' && <div className="postcard-vignette" />}
      </div>

      <PostcardOverlay
        frameRef={frameRef}
        geometry={geometry}
        message={message}
        font={font}
        fontScale={fontScale}
        textColor={textColor}
        textAlign={textAlign}
        photoUrl={photoUrl}
        crop={crop}
        cssFilter={cssFilter}
        fillStyle={fillStyle}
        fillColor={fillColor}
        stickers={stickers}
        onStickerMove={onStickerMove}
        onStickerRemove={onStickerRemove}
      />

      <DoodleLayer
        strokes={strokes}
        drawMode={drawMode}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        onAddStroke={onAddStroke}
      />
    </div>
  );
}
