import React, { useCallback, useRef } from 'react';
import { panCrop } from '../cropGesture';
import { previewFilterCss } from '../previewFilter';

/**
 * One photo's pan/zoom/filter-preview frame inside a collage slot --
 * the same background-position/size math `PostcardCanvas` uses, minus
 * the aspect-ratio CSS (the parent slot div, positioned by
 * `CollageEditor.jsx` from the layout's own `NormRect`, already sizes
 * this) and minus the message/sticker/doodle overlay (shared once across
 * the whole collage by `CollageEditor`, not per photo). Kept as its own
 * small component rather than adding a "collage mode" branch to
 * `PostcardCanvas` -- see CLAUDE.md for why: the message/sticker overlay
 * lives in a different coordinate space here (the whole card, not one
 * slot), and threading that distinction through the already-shipped
 * single-photo component was the riskier option, not the simpler one.
 */
export default function CollagePhotoSlot({ photoUrl, naturalW, naturalH, crop, onCropChange, adjustments, filter }) {
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
      const scale = drag.current.crop.w / rect.width;
      const next = panCrop(
        drag.current.crop,
        (e.clientX - drag.current.x) * scale,
        (e.clientY - drag.current.y) * scale,
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

  return (
    <div
      ref={frameRef}
      className="collage-photo-slot"
      style={{
        backgroundImage: `url(${photoUrl})`,
        backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
        backgroundPosition: `${bgPosX}% ${bgPosY}%`,
        filter: previewFilterCss(adjustments, filter),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {filter === 'vintage' && <div className="postcard-vignette" />}
    </div>
  );
}
