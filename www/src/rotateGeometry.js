/**
 * The host side of a rotated photo: the wasm calls that own the geometry,
 * and the one CSS transform that draws what they decided.
 *
 * **A crop is expressed in rotated space.** Turning a photo gives it a new
 * bounding box, and `crop` is a rectangle in *that* box, not on the
 * upright photo -- `postcard_calc::rotate`'s module docs carry the full
 * reasoning. Everything here exists so no part of the host layer has to
 * re-derive that, because the cost of getting it slightly different is a
 * card that exports a pixel or two off the one the editor showed.
 *
 * Wrappers, not logic: same reason `photoLayout.js` exists. `bounds` in
 * particular is one line of trigonometry that would be very easy to
 * inline into a component and very hard to notice diverging.
 * `wasm-call-sites.test.js` enforces that nothing calls these bindings
 * directly -- `fit_rotated_crop` takes seven arguments, and a wasm
 * binding called with too few throws a message that names nothing in this
 * codebase (see that file's own note).
 */

/** The box a photo fills once it is turned `rotation` degrees. */
export function rotatedBounds(wasmModule, naturalW, naturalH, rotation) {
  return wasmModule.rotated_bounds(naturalW, naturalH, rotation);
}

/** The zoom-1 crop of `ratio` for a photo turned `rotation` degrees: the
 * largest one that still fits entirely on it. Shrinks as the angle grows,
 * which is what makes a turning photo appear to scale up rather than show
 * empty corners. */
export function suggestRotatedCrop(wasmModule, naturalW, naturalH, rotation, ratio) {
  return wasmModule.suggest_crop_rotated(naturalW, naturalH, rotation, ratio);
}

/**
 * Pulls a candidate crop back onto the turned photo.
 *
 * The rounding and the `Math.max(0, ...)` are marshalling, not geometry:
 * the binding takes four `u32`s, and a gesture mid-frame can easily
 * produce a fractional or briefly-negative origin that would blow up at
 * the wasm boundary rather than being clamped by the code whose job that
 * is.
 */
export function fitRotatedCrop(wasmModule, naturalW, naturalH, rotation, crop) {
  return wasmModule.fit_rotated_crop(
    naturalW,
    naturalH,
    rotation,
    Math.max(0, Math.round(crop.x)),
    Math.max(0, Math.round(crop.y)),
    Math.max(1, Math.round(crop.w)),
    Math.max(1, Math.round(crop.h)),
  );
}

/**
 * Bundles the three calls above against one photo, for the pointer hook.
 *
 * `usePhotoGestures` has no wasm of its own and shouldn't grow any -- it
 * handles pointers. Handing it this small interface keeps the rotated
 * geometry in exactly one place while leaving the hook testable with a
 * plain object in place of a wasm module.
 */
export function cropMathFor(wasmModule, naturalW, naturalH, ratio) {
  return {
    bounds: (rotation) => rotatedBounds(wasmModule, naturalW, naturalH, rotation),
    base: (rotation) => suggestRotatedCrop(wasmModule, naturalW, naturalH, rotation, ratio),
    fit: (crop, rotation) => fitRotatedCrop(wasmModule, naturalW, naturalH, rotation, crop),
  };
}

/**
 * Where to put the `<img>` inside a photo frame so the frame shows
 * exactly `crop` of a photo turned `rotation` degrees.
 *
 * This replaced a `background-position`/`background-size` pair, which is
 * simpler but cannot rotate a background image at all. The frame keeps
 * doing the clipping (`overflow: hidden`); the photo is a child sized in
 * percentages of the frame, centred on the rotated bounding box's own
 * centre, and turned about itself:
 *
 * - the frame's width stands for `crop.w` rotated-space units, so the
 *   photo's own `naturalW` becomes `naturalW / crop.w` of the frame;
 * - the box centre lands at `bounds / 2` measured from the crop's origin,
 *   which is the one place both the upright and turned cases agree on;
 * - `translate(-50%, -50%)` then `rotate()` turns it about that centre,
 *   clockwise, the same direction `postcard_calc::rotate` turns pixels.
 *
 * Still just CSS arithmetic on numbers Rust already decided -- the same
 * carve-out `photoLayout.js` documents.
 */
export function photoLayerStyle(crop, bounds, naturalW, naturalH, rotation) {
  return {
    width: `${(naturalW / crop.w) * 100}%`,
    height: `${(naturalH / crop.h) * 100}%`,
    left: `${((bounds.w / 2 - crop.x) / crop.w) * 100}%`,
    top: `${((bounds.h / 2 - crop.y) / crop.h) * 100}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
}
