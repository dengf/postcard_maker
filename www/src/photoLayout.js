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
