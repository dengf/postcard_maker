import React, { useRef } from 'react';
import usePhotoGestures from '../usePhotoGestures';
import { previewFilterCss } from '../previewFilter';
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

  return (
    <div
      ref={frameRef}
      className="collage-photo-slot"
      style={{ filter: previewFilterCss(adjustments, filter) }}
      {...gestures}
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
  );
}
