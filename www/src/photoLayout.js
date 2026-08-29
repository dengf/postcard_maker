/**
 * Small host-layer helpers for the photo/blank split. The actual
 * geometry facts (`photoArea`/`blankArea`/`stampBox`/`messageArea`) come
 * from `wasmModule.template_geometry` -- this file only derives what's
 * needed to call it and to pick the right crop-suggestion wasm function
 * for whichever area the photo currently occupies. Per CLAUDE.md's
 * "business logic is anything where a second implementation could give a
 * different answer": this isn't that -- it's arithmetic on numbers Rust
 * already computed and a couple of string lookups, not a competing
 * algorithm.
 */

// 'bigSmall' (JS/UI naming, matches `fontScale`-style camelCase already
// used throughout the reducer) vs `"big_small"` (wasm's snake_case,
// matching `postcard_core::PhotoCoverage`'s own serde rename).
const COVERAGE_TO_WASM = { full: 'full', half: 'half', bigSmall: 'big_small' };

export function templateGeometry(wasmModule, aspectId, coverage, side) {
  return wasmModule.template_geometry(aspectId, COVERAGE_TO_WASM[coverage], side);
}

/** The photo box's own on-card pixel aspect ratio (width/height), given
 * the card's own ratio and the normalized `photoArea` Rust returned. */
export function photoAreaRatio(photoArea, cardRatio) {
  return (photoArea.w * cardRatio) / photoArea.h;
}

/** Suggests a crop for the photo: the plain named-aspect suggestion when
 * it covers the whole card, or the photo box's own ratio otherwise --
 * `suggest_crop_ratio`, the same wasm call `CollageEditor.jsx` already
 * uses per-slot for exactly this reason. */
export function suggestCropForLayout(wasmModule, naturalW, naturalH, aspectId, coverage, photoArea, cardRatio) {
  if (coverage === 'full') {
    return wasmModule.suggest_crop(naturalW, naturalH, aspectId);
  }
  return wasmModule.suggest_crop_ratio(naturalW, naturalH, photoAreaRatio(photoArea, cardRatio));
}

/**
 * Where `photoArea` and `blankArea` actually touch -- the boundary line
 * between the photo and the blank side of a split layout. Derived purely
 * from the two rects Rust already returned (not a new geometry fact of
 * its own): whichever rect starts at 0 along the split axis, the
 * boundary is where it ends; the other rect's own start is the same
 * number, just computed the other way, which is why this doesn't need to
 * know `photoSide` -- it works out the same regardless of which side the
 * photo is on. Used by both the live preview (`PostcardOverlay.jsx`, a
 * CSS line) and the export bake (`export.js`, a canvas line) so the two
 * never disagree about where the card was actually split.
 */
export function splitBoundary(photoArea, blankArea) {
  const vertical = photoArea.w < 1;
  if (vertical) {
    const pos = photoArea.x < blankArea.x ? photoArea.x + photoArea.w : blankArea.x + blankArea.w;
    return { axis: 'x', pos };
  }
  const pos = photoArea.y < blankArea.y ? photoArea.y + photoArea.h : blankArea.y + blankArea.h;
  return { axis: 'y', pos };
}

/**
 * The unused strip of `blankArea` between the stamp corner and the
 * greeting message -- exactly where a "To" + address block fits without
 * touching either, mirroring the back side's own address block
 * (`export.js`'s `renderBackSide`) but on the front's blank side of a
 * split layout instead. Not a new Rust geometry fact: `stampBox` and
 * `messageArea` already reserve their own space, so this is just "the
 * gap left over," computed the same way in both the live preview and the
 * export bake. Returns `null` if that gap is too thin to bother with
 * (a very short blank area), rather than drawing an address block with
 * negative height.
 */
export function toAddressArea(geometry) {
  const { stampBox, messageArea, safeMargin } = geometry;
  const gap = safeMargin;
  const y = stampBox.y + stampBox.h + gap;
  const h = messageArea.y - gap - y;
  if (h <= 0) return null;
  return { x: messageArea.x, y, w: messageArea.w, h };
}
