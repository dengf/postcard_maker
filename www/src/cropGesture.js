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

/** What the zoom slider offers, and so what a pinch is held to as well --
 * one gesture and one control driving the same value must agree on its
 * range, or a pinch can leave the slider pinned at an end. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export function clampZoom(zoom) {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
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
 */
export function zoomedCropAt(crop, baseCrop, naturalW, naturalH, zoom, anchor) {
  const w = Math.max(1, Math.round(baseCrop.w / zoom));
  const h = Math.max(1, Math.round(baseCrop.h / zoom));
  const { fx, fy } = anchor;
  // The source pixel currently under the anchor, which has to stay there.
  const sx = crop.x + fx * crop.w;
  const sy = crop.y + fy * crop.h;
  return {
    x: clamp(Math.round(sx - fx * w), 0, naturalW - w),
    y: clamp(Math.round(sy - fy * h), 0, naturalH - h),
    w,
    h,
  };
}

/**
 * Re-centers and resizes `crop` for a new zoom level. Keeps `crop`'s own
 * current center rather than `baseCrop`'s, so zooming doesn't discard a
 * pan the user already made.
 */
export function zoomedCrop(crop, baseCrop, naturalW, naturalH, zoom) {
  return zoomedCropAt(crop, baseCrop, naturalW, naturalH, zoom, { fx: 0.5, fy: 0.5 });
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
 */
export function pinchZoom(startZoom, startDist, dist) {
  if (!(startDist > 0)) return clampZoom(startZoom);
  return clampZoom((startZoom * dist) / startDist);
}

/** Pans `crop` by a delta already converted into source-photo pixels. */
export function panCrop(crop, dx, dy, naturalW, naturalH) {
  return {
    ...crop,
    x: clamp(Math.round(crop.x - dx), 0, naturalW - crop.w),
    y: clamp(Math.round(crop.y - dy), 0, naturalH - crop.h),
  };
}
