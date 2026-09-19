import { useCallback, useRef } from 'react';
import { panCrop, pinchAnchor, pinchZoom, zoomedCropAt } from './cropGesture';
import { createTapLog, distance, recordTap } from './doubleTap';

/**
 * Every gesture one photo surface understands: one finger pans, two
 * fingers pinch to zoom, two taps swap the photo. Shared by
 * `PostcardCanvas` and `CollagePhotoSlot`, which had grown two copies of
 * the same pointer bookkeeping -- CLAUDE.md's note about keeping those
 * two components apart is about the overlay's coordinate space and their
 * separate reducers, not about the pointer stream, which is identical.
 *
 * The surface must set `touch-action: none` (both do) or the browser
 * takes the second finger for its own page zoom and the app never sees
 * it. The page itself still can't zoom while pinching here, which is the
 * point: someone pinching a photo means the photo, not the page.
 *
 * `onPinchZoom(crop, zoom)` gets both values in one call because both
 * editors dispatch them as one action -- a crop and a zoom that
 * disagreed for even one render would show as a jump.
 */
export default function usePhotoGestures({
  boxRef,
  crop,
  baseCrop,
  zoom,
  naturalW,
  naturalH,
  onCropChange,
  onPinchZoom,
  onDoubleTap,
}) {
  const pointers = useRef(new Map());
  const drag = useRef(null);
  const pinch = useRef(null);
  const taps = useRef(createTapLog());
  // The gesture handlers outlive any one render, and a pinch that ends
  // with a finger still down has to pick the pan back up from whatever
  // crop the pinch just produced -- so they read the live values here
  // rather than closing over a render's copy.
  const live = useRef(null);
  live.current = { crop, baseCrop, zoom };

  const startDrag = useCallback((point, startCrop, time, tappable) => {
    drag.current = { x: point.x, y: point.y, crop: startCrop, time, travel: 0, tappable };
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const points = [...pointers.current.values()];

      if (points.length === 2 && onPinchZoom && live.current.baseCrop && boxRef.current) {
        const rect = boxRef.current.getBoundingClientRect();
        pinch.current = {
          startDist: distance(points[0], points[1]),
          startZoom: live.current.zoom,
          crop: live.current.crop,
          anchor: pinchAnchor(rect, points[0], points[1]),
        };
        // The first finger's pan stops here: continuing it would fight
        // the zoom for the same crop, and a pinch is never a tap.
        drag.current = null;
        taps.current = createTapLog();
        return;
      }

      if (points.length === 1) startDrag(points[0], live.current.crop, e.timeStamp, true);
    },
    [boxRef, onPinchZoom, startDrag],
  );

  const onPointerMove = useCallback(
    (e) => {
      const tracked = pointers.current.get(e.pointerId);
      if (tracked) {
        tracked.x = e.clientX;
        tracked.y = e.clientY;
      }
      if (!boxRef.current) return;

      if (pinch.current) {
        const points = [...pointers.current.values()];
        if (points.length < 2) return;
        const nextZoom = pinchZoom(
          pinch.current.startZoom,
          pinch.current.startDist,
          distance(points[0], points[1]),
        );
        // Always from the crop the pinch started on, so the gesture is
        // reversible; the anchor keeps the bit of photo between the two
        // fingers where it is instead of sliding out from under them.
        onPinchZoom(
          zoomedCropAt(
            pinch.current.crop,
            live.current.baseCrop,
            naturalW,
            naturalH,
            nextZoom,
            pinch.current.anchor,
          ),
          nextZoom,
        );
        return;
      }

      if (!drag.current) return;
      drag.current.travel = Math.max(
        drag.current.travel,
        distance(drag.current, { x: e.clientX, y: e.clientY }),
      );
      const rect = boxRef.current.getBoundingClientRect();
      // The photo box's on-screen width represents `crop.w` source
      // pixels, so that ratio converts a screen-space drag into source
      // pixels.
      const scale = drag.current.crop.w / rect.width;
      onCropChange(
        panCrop(
          drag.current.crop,
          (e.clientX - drag.current.x) * scale,
          (e.clientY - drag.current.y) * scale,
          naturalW,
          naturalH,
        ),
      );
    },
    [boxRef, naturalW, naturalH, onCropChange, onPinchZoom],
  );

  // Double-tapping the photo opens the picker again, the same thing the
  // chip does -- the gesture people already try on a photo they want to
  // change, and the only one available while the chip is under a finger.
  const onPointerUp = useCallback(
    (e) => {
      pointers.current.delete(e.pointerId);
      const gesture = drag.current;
      drag.current = null;

      if (pinch.current) {
        pinch.current = null;
        const left = [...pointers.current.values()];
        // Lifting one of two fingers leaves a pan in progress, re-based
        // on the zoom just applied -- otherwise the photo jumps as the
        // remaining finger moves against a stale crop. That pan is not
        // tappable: the other half of a pinch is not a tap.
        if (left.length === 1) startDrag(left[0], live.current.crop, e.timeStamp, false);
        return;
      }

      if (!gesture || !gesture.tappable || !onDoubleTap) return;
      const done = { x: e.clientX, y: e.clientY, time: e.timeStamp, travel: gesture.travel };
      if (recordTap(taps.current, done)) onDoubleTap();
    },
    [onDoubleTap, startDrag],
  );

  // A cancelled pointer (the browser took the gesture over) ended in no
  // tap at all, so it must not be logged as one.
  const onPointerCancel = useCallback((e) => {
    pointers.current.delete(e.pointerId);
    drag.current = null;
    if (pointers.current.size < 2) pinch.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
