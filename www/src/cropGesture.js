/**
 * Interactive pan/zoom arithmetic for the crop the user is dragging in
 * the editor. This is *not* a second implementation of `postcard-calc`'s
 * crop logic -- `suggest_crop` (Rust) still owns the one real decision
 * here, the aspect-correct starting rectangle, and `crop::validate`
 * (also Rust) is still the authority that `process_photo` checks against
 * at export. This module only turns a drag/slider gesture into a
 * candidate rectangle for the user to look at live; see CLAUDE.md.
 */

function clamp(value, lo, hi) {
  return Math.min(Math.max(value, lo), Math.max(lo, hi));
}

/** The zoom at which the photo exactly fills the card: `crop` is then the
 * zoom-1 suggestion, the largest rectangle of the card's shape that fits
 * on the photo. It is the *top* of the zoom-out range, not the bottom --
 * below it the crop can no longer grow to match, so the photo is drawn
 * smaller than the card with a blurred bed behind it (`letterbox.js`).
 * How far below depends on the photo, so the floor is `fitZoom`'s answer
 * and travels as a parameter rather than living here as a constant. */
export const FILL_ZOOM = 1;
export const MAX_ZOOM = 3;

/** What the zoom slider offers, and so what a pinch is held to as well --
 * one gesture and one control driving the same value must agree on its
 * range, or a pinch can leave the slider pinned at an end. */
export function clampZoom(zoom, minZoom = FILL_ZOOM) {
  return clamp(zoom, minZoom, MAX_ZOOM);
}

/** What the quick-turn buttons step by, and the angles a twist snaps to. */
export const QUARTER_TURN = 90;

/** How close to a quarter turn a twist has to get before it snaps there.
 * Level is the angle people actually want and the hardest to hit with two
 * fingers on glass; wide enough to be reachable, narrow enough that
 * deliberately sitting at 8 degrees still works. */
export const SNAP_WINDOW = 5;

/** Degrees, always in `[0, 360)` -- mirrors `postcard_calc::rotate`'s own
 * `normalize`, which is what the stored value is read back through. */
export function normalizeRotation(deg) {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/** Pulls an angle onto the nearest quarter turn when it is close enough,
 * so a photo someone meant to leave straight ends up exactly straight. */
export function snapRotation(deg) {
  const turn = normalizeRotation(deg);
  const nearest = Math.round(turn / QUARTER_TURN) * QUARTER_TURN;
  return Math.abs(turn - nearest) <= SNAP_WINDOW ? normalizeRotation(nearest) : turn;
}

/** The angle of the line between two pointers, in degrees. */
export function twistAngle(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/**
 * The rotation a two-finger twist is asking for: however far the line
 * between the fingers has turned since the gesture began, added to the
 * rotation it began at.
 *
 * Measured against the gesture's own starting angle every frame rather
 * than the previous frame's, for the same reason [`pinchZoom`] is -- a
 * twist out and back has to land exactly where it started instead of
 * accumulating drift. The `+540 % 360 - 180` fold keeps a gesture that
 * crosses the atan2 discontinuity from reading as a 350-degree jolt.
 */
export function pinchRotation(startRotation, startAngle, angle) {
  const delta = ((((angle - startAngle) % 360) + 540) % 360) - 180;
  return snapRotation(startRotation + delta);
}

/**
 * Re-expresses `crop` in a different bounding box, keeping the same
 * relative position within it.
 *
 * Turning the photo changes the box the crop lives in, and the crop has
 * to come along. Holding its *fractional* centre is what makes a twist
 * feel continuous: the box grows and shrinks smoothly with the angle, so
 * the framing drifts with it instead of jumping back to the middle the
 * moment someone who had panned into a corner starts to turn the photo.
 */
export function rebaseCrop(crop, from, to) {
  const fx = from.w > 0 ? (crop.x + crop.w / 2) / from.w : 0.5;
  const fy = from.h > 0 ? (crop.y + crop.h / 2) / from.h : 0.5;
  return {
    ...crop,
    x: Math.round(fx * to.w - crop.w / 2),
    y: Math.round(fy * to.h - crop.h / 2),
  };
}

/**
 * Resizes `crop` for a new zoom level, using `baseCrop` (the zoom=1
 * suggestion) for the aspect-correct size at zoom 1, and holding one
 * point of the frame still while it does.
 *
 * `anchor` is that point, in fractions of the frame's own box: `{ fx:
 * 0.5, fy: 0.5 }` holds the center, which is what the zoom slider wants
 * -- it has no point on the photo to zoom *at*. A pinch passes the
 * midpoint between the two fingers instead, so the bit of the photo
 * someone is pinching stays under their fingers rather than sliding
 * away from them.
 *
 * `boundsW`/`boundsH` are the *rotated* photo's bounding box, which for
 * an upright photo is its own size -- the crop lives in that space (see
 * `rotateGeometry.js`). The clamp here only keeps the rectangle inside
 * that box, which is all an unrotated photo ever needed; a turned one
 * gets the real corner constraint from `fitRotatedCrop` afterwards, and
 * that answer is the authority. This is not a second implementation of
 * it -- it is what stops a mid-gesture rectangle reaching the wasm
 * boundary with a negative origin.
 *
 * Below `FILL_ZOOM` the rectangle this asks for is *larger* than the
 * photo, and the size clamp is what keeps the crop a real rectangle of
 * real pixels: it stops growing at the photo's own edge, and the gap
 * between what was asked for and what was given is the letterbox
 * `photoFit` then measures. Every crop that leaves here is still one
 * `crop::validate` accepts, at any zoom.
 */
export function zoomedCropAt(crop, baseCrop, boundsW, boundsH, zoom, anchor) {
  const w = clamp(Math.round(baseCrop.w / zoom), 1, Math.max(1, boundsW));
  const h = clamp(Math.round(baseCrop.h / zoom), 1, Math.max(1, boundsH));
  const { fx, fy } = anchor;
  // The source pixel currently under the anchor, which has to stay there.
  const sx = crop.x + fx * crop.w;
  const sy = crop.y + fy * crop.h;
  return {
    x: clamp(Math.round(sx - fx * w), 0, boundsW - w),
    y: clamp(Math.round(sy - fy * h), 0, boundsH - h),
    w,
    h,
  };
}

/**
 * Re-centers and resizes `crop` for a new zoom level. Keeps `crop`'s own
 * current center rather than `baseCrop`'s, so zooming doesn't discard a
 * pan the user already made.
 */
export function zoomedCrop(crop, baseCrop, boundsW, boundsH, zoom) {
  return zoomedCropAt(crop, baseCrop, boundsW, boundsH, zoom, { fx: 0.5, fy: 0.5 });
}

/**
 * Where a two-finger pinch is centered, as fractions of the photo box --
 * the `anchor` `zoomedCropAt` wants. `rect` is the box's own
 * bounding rect; `a` and `b` are the two live pointers in client
 * coordinates. Clamped to the box, since a pointer captured by the box
 * can travel outside it mid-gesture.
 */
export function pinchAnchor(rect, a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return {
    fx: rect.width > 0 ? clamp((mx - rect.left) / rect.width, 0, 1) : 0.5,
    fy: rect.height > 0 ? clamp((my - rect.top) / rect.height, 0, 1) : 0.5,
  };
}

/**
 * The zoom a pinch is asking for: fingers twice as far apart as they
 * started means twice the zoom they started at. Measured against the
 * gesture's own starting distance every frame rather than the previous
 * frame's, so a pinch out and back lands exactly where it began instead
 * of accumulating rounding drift.
 *
 * `minZoom` is the photo's own zoom-out floor, not a constant, because
 * how far out is worth going depends on how much of the photo the card's
 * shape leaves out -- see `letterbox.js`'s `fitZoom`.
 */
export function pinchZoom(startZoom, startDist, dist, minZoom = FILL_ZOOM) {
  if (!(startDist > 0)) return clampZoom(startZoom, minZoom);
  return clampZoom((startZoom * dist) / startDist, minZoom);
}

/** Pans `crop` by a delta already converted into source-photo pixels. */
export function panCrop(crop, dx, dy, boundsW, boundsH) {
  return {
    ...crop,
    x: clamp(Math.round(crop.x - dx), 0, boundsW - crop.w),
    y: clamp(Math.round(crop.y - dy), 0, boundsH - crop.h),
  };
}
