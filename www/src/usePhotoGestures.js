import { useCallback, useRef } from 'react';
import {
  panCrop,
  pinchAnchor,
  pinchRotation,
  pinchZoom,
  rebaseCrop,
  twistAngle,
  zoomedCropAt,
} from './cropGesture';
import { createTapLog, distance, recordTap } from './doubleTap';

/**
 * Every gesture one photo surface understands: one finger pans, two
 * fingers pinch to zoom *and* twist to rotate, two taps swap the photo.
 * Shared by `PostcardCanvas` and `CollagePhotoSlot`, which had grown two
 * copies of the same pointer bookkeeping -- CLAUDE.md's note about
 * keeping those two components apart is about the overlay's coordinate
 * space and their separate reducers, not about the pointer stream, which
 * is identical.
 *
 * The surface must set `touch-action: none` (both do) or the browser
 * takes the second finger for its own page zoom and the app never sees
 * it. The page itself still can't zoom while pinching here, which is the
 * point: someone pinching a photo means the photo, not the page.
 *
 * `onPinchZoom(crop, zoom, rotation)` gets all three in one call because
 * both editors dispatch them as one action -- values that disagreed for
 * even one render would show as a jump. Zoom and rotation come off the
 * *same* two fingers on purpose: separating them would mean a mode, and
 * a photo people want turned is usually one they also want to reframe.
 *
 * `cropMath` is `rotateGeometry.js`'s bundle of wasm-backed geometry
 * (`bounds`/`base`/`fit`). This hook deliberately has no wasm of its own:
 * a turn changes both the box the crop lives in and the crop that fits
 * inside it, and both answers belong to Rust.
 */
export default function usePhotoGestures({
  boxRef,
  crop,
  baseCrop,
  zoom,
  rotation = 0,
  cropMath,
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
  live.current = { crop, baseCrop, zoom, rotation, cropMath };

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
          startAngle: twistAngle(points[0], points[1]),
          startZoom: live.current.zoom,
          startRotation: live.current.rotation,
          crop: live.current.crop,
          bounds: live.current.cropMath.bounds(live.current.rotation),
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
        const start = pinch.current;
        const math = live.current.cropMath;
        const nextZoom = pinchZoom(start.startZoom, start.startDist, distance(points[0], points[1]));
        const nextRotation = pinchRotation(
          start.startRotation,
          start.startAngle,
          twistAngle(points[0], points[1]),
        );

        // Turning moves the goalposts: the photo's bounding box is a
        // different size at the new angle, and so is the zoom-1 crop that
        // fits inside it. Both are re-asked for rather than scaled, and
        // the crop the gesture started on is carried across by its
        // relative position so the framing follows the turn instead of
        // snapping back to centre.
        const bounds = math.bounds(nextRotation);
        const base = math.base(nextRotation);
        const from = rebaseCrop(start.crop, start.bounds, bounds);

        // Always from the crop the pinch started on, so the gesture is
        // reversible; the anchor keeps the bit of photo between the two
        // fingers where it is instead of sliding out from under them.
        const next = zoomedCropAt(from, base, bounds.w, bounds.h, nextZoom, start.anchor);
        onPinchZoom(math.fit(next, nextRotation), nextZoom, nextRotation);
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
      const math = live.current.cropMath;
      const bounds = math.bounds(live.current.rotation);
      const panned = panCrop(
        drag.current.crop,
        (e.clientX - drag.current.x) * scale,
        (e.clientY - drag.current.y) * scale,
        bounds.w,
        bounds.h,
      );
      onCropChange(math.fit(panned, live.current.rotation));
    },
    [boxRef, onCropChange, onPinchZoom],
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
