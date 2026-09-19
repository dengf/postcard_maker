/**
 * Zooming *out* past the point where the photo fills the card.
 *
 * The zoom slider does not scale the photo -- it sizes the crop, as
 * `crop.w = baseCrop.w / zoom` (`cropGesture.js`). `baseCrop` is Rust's
 * `suggest_for_ratio`, the largest rectangle of the card's own shape that
 * fits on the photo, so `zoom = 1` is already as far out as cropping can
 * go. Any photo whose proportions differ from the card's has therefore
 * had its edges cut off before the editor even opens, with no way to get
 * them back -- which is what this module exists to fix.
 *
 * **The crop stays a real rectangle of real pixels at every zoom.** Below
 * 1 the rectangle the zoom asks for is wider or taller than the photo, so
 * `zoomedCropAt` stops it at the photo's own edge. Nothing out of bounds
 * ever reaches the wasm boundary, `crop::validate` needs no relaxing, and
 * a draft saved at any zoom reopens through exactly the path it always
 * did. What the clamp costs is the difference between the rectangle asked
 * for and the one given, and that difference *is* the letterbox:
 * `photoFit` measures it as the fraction of the frame the photo should
 * cover, and the margin gets a blurred, over-scanned copy of the same
 * photo behind it -- the treatment `fillTreatments.js`'s `blur` shape
 * already uses for a split card's blank side.
 *
 * Preview and export both go through these numbers, `PostcardCanvas` /
 * `CollagePhotoSlot` by positioning a box inside the frame and `export.js`
 * by drawing into the matching rectangle of the canvas. At `zoom >= 1`
 * every function here returns the identity, so a card that was never
 * zoomed out exports down exactly the code path it did before.
 *
 * **It is exact at quarter turns, approximate in between.** At 0/90/180/
 * 270 degrees the photo fills its own bounding box, so zooming out to
 * `fitZoom` really does reveal every pixel of it. At any other angle the
 * photo sits tilted inside that box and `fit_rotated_crop` still holds
 * the crop's corners on it -- so zooming out there shrinks the photo on
 * the card rather than revealing more of it. That is the deliberate
 * choice: the alternative is transparent corners where the crop overhangs
 * the tilted photo, and this way `rotate::fit` stays the single authority
 * on what a turned photo may show.
 */

import { FILL_ZOOM } from './cropGesture';

/** The photo covering its frame edge to edge: what every zoom at or above
 * `FILL_ZOOM` gives, and the identity for everything downstream. */
export const FULL_FIT = { x: 0, y: 0, w: 1, h: 1 };

/**
 * How much bigger than its frame the blurred bed is drawn.
 *
 * A CSS `filter: blur()` samples past the edges of what it is blurring
 * and finds nothing there, so a bed sized exactly to the frame fades out
 * along the seam and leaves a pale rim around the card. Over-scanning
 * pushes that fade outside the frame, which clips it away. Export applies
 * the same factor so the two stay framed alike.
 */
export const BLUR_BED_SCALE = 1.12;

/**
 * The bed's blur radius, as a fraction of the shorter side of the frame
 * it fills.
 *
 * Relative, not a pixel count, because the preview frame is a few
 * hundred pixels across and the exported card a couple of thousand -- a
 * radius that reads as a soft wash on screen is a legible photo in the
 * file. `main.css` spends this through `cqmin`, which is the one CSS
 * length that means "a percentage of this box", and `drawBlurBed`
 * multiplies it out for the canvas. Change it in one place or the card
 * someone saves stops looking like the one they were shown.
 */
export const BLUR_BED_RADIUS = 0.06;

/** The zoom slider's step. The floor below is rounded down onto this
 * grid, because an `<input type=range>` counts its steps *from its own
 * minimum*: at a raw floor of 0.8892 the nearest stops either side of
 * 1x are 0.9892 and 0.9992, so the one zoom every photo starts at would
 * be the one value the slider could not return to. Rounding down also
 * keeps the floor at or below the real one, never above it. */
const ZOOM_STEP = 0.01;

/**
 * The lowest zoom worth offering for this photo at this angle: the one
 * where the crop last grew, i.e. where it has reached the photo's own
 * bounding box on both axes. Going below it would only shrink the photo
 * on the card without revealing any more of it, so the slider and the
 * pinch both stop here -- the same number for both, which is why the
 * step rounding lives here and not in the panel.
 *
 * Always `<= 1`, and exactly 1 for a photo already shaped like the card
 * -- there is nothing cropped off such a photo, so there is nothing to
 * zoom out to and the control keeps the range it always had.
 */
export function fitZoom(baseCrop, bounds) {
  if (!baseCrop || !bounds || !(bounds.w > 0) || !(bounds.h > 0)) return FILL_ZOOM;
  const raw = Math.min(FILL_ZOOM, baseCrop.w / bounds.w, baseCrop.h / bounds.h);
  return Math.min(FILL_ZOOM, Math.floor(raw / ZOOM_STEP) * ZOOM_STEP);
}

/**
 * Where the cropped photo sits inside its frame, in fractions of the
 * frame: the rectangle the crop *asked* for is `baseCrop / zoom`, and
 * `crop` is however much of that the photo could actually supply.
 *
 * Centred on the axis that came up short, because that is where the crop
 * already is: on an axis where the rectangle overruns the photo, the
 * clamp in `zoomedCropAt` and `panCrop` leaves no room to pan and pins
 * the crop across the whole of it.
 */
export function photoFit(crop, baseCrop, zoom) {
  if (!crop || !baseCrop || !(zoom > 0) || zoom >= FILL_ZOOM) return FULL_FIT;
  if (!(baseCrop.w > 0) || !(baseCrop.h > 0)) return FULL_FIT;
  const w = Math.min(1, (crop.w * zoom) / baseCrop.w);
  const h = Math.min(1, (crop.h * zoom) / baseCrop.h);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Whether `fit` leaves any margin at all -- i.e. whether the frame needs
 * a bed behind the photo. */
export function isLetterboxed(fit) {
  return fit.w < 1 || fit.h < 1;
}

/**
 * The part of `crop` to put behind the photo as the blurred bed: the
 * largest rectangle of the *frame's* shape inside it, centred.
 *
 * The bed has to cover the frame edge to edge, and the letterboxed crop
 * by definition does not have the frame's proportions -- so it is the
 * crop's own middle, cut to the frame's shape, rather than the crop
 * stretched to fit. A blurred stretch would be invisible at this radius,
 * but it would also be the one place in this app where a photo is drawn
 * out of proportion, and that is not worth saving four lines for.
 *
 * `baseCrop` supplies the shape: it is the zoom-1 crop, so it already has
 * the frame's ratio at whatever angle the photo is turned to.
 */
export function coverCrop(crop, baseCrop) {
  if (!crop || !baseCrop || !(baseCrop.h > 0) || !(baseCrop.w > 0)) return crop;
  const ratio = baseCrop.w / baseCrop.h;
  let w = crop.w;
  let h = w / ratio;
  if (h > crop.h) {
    h = crop.h;
    w = h * ratio;
  }
  return { x: crop.x + (crop.w - w) / 2, y: crop.y + (crop.h - h) / 2, w, h };
}
