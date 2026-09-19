import React, { useEffect, useRef, useState } from 'react';
import usePhotoGestures from '../usePhotoGestures';
import { previewFilterCss } from '../previewFilter';
import { hexToRgb, sampleFrameColor } from '../autoTextColor';
import { fillCss, parseFillStyle } from '../fillTreatments';
import { BLUR_BED_SCALE, coverCrop, isLetterboxed, photoFit } from '../letterbox';
import { photoLayerStyle } from '../rotateGeometry';
import PostcardOverlay from './PostcardOverlay';
import DoodleLayer from './DoodleLayer';
import ReplacePhotoButton from './ReplacePhotoButton';

const FULL_AREA = { x: 0, y: 0, w: 1, h: 1 };

/**
 * A live-preview approximation of the photo's own average color, used by
 * both the `auto` and `gradient` blank-area fills (the latter builds two
 * shades of it -- see `fillTreatments.js`): sampled the same way
 * `PostcardOverlay.jsx`'s own `useAutoTextColor` samples for a live
 * preview (a small offscreen canvas redraw, not a real composited
 * canvas) -- `export.js`'s `renderPostcard` computes the authoritative
 * version from the real drawn pixels, same "preview approximates, export
 * is authoritative" split as everywhere else this app does this.
 */
function useAutoFillColor(photoUrl, crop, cssFilter, view, active) {
  const [rgb, setRgb] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!active || !photoUrl || !crop) {
      setRgb(null);
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
        const sampled = sampleFrameColor(img, crop, cssFilter, FULL_AREA, view);
        setRgb(sampled.map(Math.round));
      } catch {
        setRgb(null);
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
  }, [photoUrl, crop?.x, crop?.y, crop?.w, crop?.h, cssFilter, view.rotation, active]);

  return rgb;
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
 * A `.postcard-fill` layer behind the photo box shows `fillStyle`: one of
 * `fillTreatments.js`'s shape+variant treatments (solid/gradient/radial/
 * dots/stripes) in either the picked swatch or the photo's own sampled
 * average color, or a second, blurred copy of the photo stretched across
 * the whole frame for the `blur` shape -- visible everywhere the sharp
 * photo box doesn't cover.
 */
export default function PostcardCanvas({
  photoUrl,
  naturalW,
  naturalH,
  crop,
  baseCrop,
  zoom,
  rotation,
  bounds,
  cropMath,
  onCropChange,
  onPinchZoom,
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
  messagePosition,
  onMessageMove,
  address,
  stickers,
  onStickerMove,
  onStickerRemove,
  strokes,
  drawMode,
  strokeColor,
  strokeWidth,
  onAddStroke,
  onReplacePhoto,
}) {
  const frameRef = useRef(null);
  const photoBoxRef = useRef(null);
  // Pan/pinch/double-tap all measure against the photo box, not the
  // frame: on a split template the photo covers only part of the card.
  const gestures = usePhotoGestures({
    boxRef: photoBoxRef,
    crop,
    baseCrop,
    zoom,
    rotation,
    cropMath,
    onCropChange,
    onPinchZoom,
    onDoubleTap: onReplacePhoto,
  });

  const cssFilter = previewFilterCss(adjustments, filter);
  // The photo is drawn as an `<img>` child of its frame rather than as a
  // background image, because a background cannot be rotated; see
  // `rotateGeometry.js`'s `photoLayerStyle`.
  const layerStyle = photoLayerStyle(crop, bounds, naturalW, naturalH, rotation);
  const photoView = { bounds, rotation };

  // Below 1x the crop has stopped growing at the photo's own edge, so the
  // photo covers only part of the box and the rest gets a blurred,
  // over-scanned copy of it -- see `letterbox.js`. At 1x and above `fit`
  // is the whole box and the bed is not rendered at all, leaving the
  // markup a card that was never zoomed out has always had.
  const fit = photoFit(crop, baseCrop, zoom);
  const letterboxed = isLetterboxed(fit);
  const fitStyle = letterboxed
    ? { left: `${fit.x * 100}%`, top: `${fit.y * 100}%`, width: `${fit.w * 100}%`, height: `${fit.h * 100}%` }
    : undefined;

  const photoArea = geometry?.photoArea ?? FULL_AREA;
  const split = photoArea.w < 1 || photoArea.h < 1;
  const { shape, variant } = parseFillStyle(fillStyle);
  const needsAutoRgb = split && shape !== 'blur' && fillColor === 'auto';
  const autoFillRgb = useAutoFillColor(photoUrl, crop, cssFilter, photoView, needsAutoRgb);

  let fillBoxStyle = null;
  if (shape !== 'blur') {
    const baseRgb = fillColor === 'auto' ? (autoFillRgb ?? [244, 237, 224]) : hexToRgb(fillColor);
    fillBoxStyle = fillCss(shape, variant, baseRgb);
  }

  const photoBoxStyle = {
    left: `${photoArea.x * 100}%`,
    top: `${photoArea.y * 100}%`,
    width: `${photoArea.w * 100}%`,
    height: `${photoArea.h * 100}%`,
    filter: cssFilter,
  };

  return (
    <div className="postcard-frame" style={{ aspectRatio, '--card-ratio': aspectRatio }} ref={frameRef}>
      {split && shape === 'blur' && (
        // A second, blurred copy of the same crop stretched across the
        // whole card. It reuses the photo box's own percentages against a
        // differently-shaped box on purpose -- that stretch is what fills
        // the card edge to edge.
        <div className="postcard-fill" style={{ filter: `${cssFilter} blur(18px)` }}>
          <img className="photo-layer" src={photoUrl} alt="" draggable="false" style={layerStyle} />
        </div>
      )}
      {split && shape !== 'blur' && <div className="postcard-fill" style={fillBoxStyle} />}

      <div
        ref={photoBoxRef}
        className="postcard-photo-box"
        style={photoBoxStyle}
        {...gestures}
      >
        {letterboxed && (
          /* `.postcard-photo-box` already carries `cssFilter`, so the bed
             inherits the look of the photo and the class only adds the
             blur. The over-scan keeps that blur's own faded edge outside
             the box, where the box's `overflow: hidden` clips it. */
          <div className="photo-blur-bed" style={{ transform: `scale(${BLUR_BED_SCALE})` }} aria-hidden="true">
            <img
              className="photo-layer"
              src={photoUrl}
              alt=""
              draggable="false"
              style={photoLayerStyle(coverCrop(crop, baseCrop), bounds, naturalW, naturalH, rotation)}
            />
          </div>
        )}
        <div className="photo-fit" style={fitStyle}>
          <img className="photo-layer" src={photoUrl} alt="" draggable="false" style={layerStyle} />
          {filter === 'vintage' && <div className="postcard-vignette" />}
        </div>
        {onReplacePhoto && <ReplacePhotoButton onRequest={onReplacePhoto} />}
      </div>

      <PostcardOverlay
        frameRef={frameRef}
        geometry={geometry}
        message={message}
        font={font}
        fontScale={fontScale}
        textColor={textColor}
        textAlign={textAlign}
        messagePosition={messagePosition}
        onMessageMove={onMessageMove}
        photoUrl={photoUrl}
        crop={crop}
        photoView={photoView}
        cssFilter={cssFilter}
        fillStyle={fillStyle}
        fillColor={fillColor}
        address={address}
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
