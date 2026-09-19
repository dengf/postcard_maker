import React, { useRef } from 'react';
import usePhotoGestures from '../usePhotoGestures';
import { previewFilterCss } from '../previewFilter';
import { BLUR_BED_SCALE, coverCrop, isLetterboxed, photoFit } from '../letterbox';
import { photoLayerStyle } from '../rotateGeometry';

/**
 * One photo's pan/zoom/rotate/filter-preview frame inside a collage slot
 * -- the same `photoLayerStyle` math `PostcardCanvas` uses, minus the
 * aspect-ratio CSS (the parent slot div, positioned by `CollageEditor.jsx`
 * from the layout's own `NormRect`, already sizes this) and minus the
 * message/sticker/doodle overlay (shared once across the whole collage by
 * `CollageEditor`, not per photo). Kept as its own small component rather
 * than adding a "collage mode" branch to `PostcardCanvas` -- see CLAUDE.md
 * for why: the message/sticker overlay lives in a different coordinate
 * space here (the whole card, not one slot), and threading that
 * distinction through the already-shipped single-photo component was the
 * riskier option, not the simpler one.
 */
export default function CollagePhotoSlot({
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
  adjustments,
  filter,
  onDoubleTap,
}) {
  const frameRef = useRef(null);
  const gestures = usePhotoGestures({
    boxRef: frameRef,
    crop,
    baseCrop,
    zoom,
    rotation,
    cropMath,
    onCropChange,
    onPinchZoom,
    onDoubleTap,
  });

  // Zoomed out past 1x the photo covers only part of the slot, and the
  // rest gets a blurred copy of it -- the same `letterbox.js` treatment
  // the single-photo card uses, per slot here because a collage crops
  // every slot to its own shape and so cuts every photo differently.
  const fit = photoFit(crop, baseCrop, zoom);
  const letterboxed = isLetterboxed(fit);

  return (
    <div
      ref={frameRef}
      className="collage-photo-slot"
      style={{ filter: previewFilterCss(adjustments, filter) }}
      {...gestures}
    >
      {letterboxed && (
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
      <div
        className="photo-fit"
        style={
          letterboxed
            ? { left: `${fit.x * 100}%`, top: `${fit.y * 100}%`, width: `${fit.w * 100}%`, height: `${fit.h * 100}%` }
            : undefined
        }
      >
        <img
          className="photo-layer"
          src={photoUrl}
          alt=""
          draggable="false"
          style={photoLayerStyle(crop, bounds, naturalW, naturalH, rotation)}
        />
        {filter === 'vintage' && <div className="postcard-vignette" />}
      </div>
    </div>
  );
}
