import React, { useCallback, useRef } from 'react';
import { panCrop } from '../cropGesture';
import { previewFilterCss } from '../previewFilter';
import PostcardOverlay from './PostcardOverlay';
import DoodleLayer from './DoodleLayer';

/**
 * The live editor preview: a fixed-aspect frame showing the current crop
 * of the photo (via CSS `background-position`/`background-size`, not a
 * `<canvas>` redraw -- panning and zooming are just background-image math,
 * so every drag frame is a style write, nothing more) with the filter
 * preview, message, stickers (`PostcardOverlay`) and doodle strokes
 * (`DoodleLayer`) layered as plain DOM on top. The one real `<canvas>`
 * this app uses is `export.js`'s one-shot bake; see CLAUDE.md.
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
  strokes,
  drawMode,
  strokeColor,
  strokeWidth,
  onAddStroke,
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

      <PostcardOverlay
        frameRef={frameRef}
        geometry={geometry}
        message={message}
        font={font}
        textColor={textColor}
        textAlign={textAlign}
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
