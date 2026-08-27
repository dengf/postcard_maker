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

/**
 * Re-centers and resizes `crop` for a new zoom level, using `baseCrop`
 * (the zoom=1 suggestion) for the aspect-correct size at zoom 1. Keeps
 * `crop`'s own current center rather than `baseCrop`'s, so zooming
 * doesn't discard a pan the user already made.
 */
export function zoomedCrop(crop, baseCrop, naturalW, naturalH, zoom) {
  const w = Math.max(1, Math.round(baseCrop.w / zoom));
  const h = Math.max(1, Math.round(baseCrop.h / zoom));
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  return {
    x: clamp(Math.round(cx - w / 2), 0, naturalW - w),
    y: clamp(Math.round(cy - h / 2), 0, naturalH - h),
    w,
    h,
  };
}

/** Pans `crop` by a delta already converted into source-photo pixels. */
export function panCrop(crop, dx, dy, naturalW, naturalH) {
  return {
    ...crop,
    x: clamp(Math.round(crop.x - dx), 0, naturalW - crop.w),
    y: clamp(Math.round(crop.y - dy), 0, naturalH - crop.h),
  };
}
