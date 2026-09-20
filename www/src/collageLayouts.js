/**
 * Host-layer helpers around the generated collage layouts.
 *
 * The layouts themselves come from Rust
 * (`postcard_calc::collage_gen` -- `collage_shuffle` for a row,
 * `collage_layout` to rebuild one from a stored id). Per CLAUDE.md's
 * "business logic is anything where a second implementation could give a
 * different answer", the *arrangement* is emphatically that: a saved
 * collage stores its layout's id alone, so the same id has to produce the
 * same rectangles forever, which is why it isn't `Math.random()` up here.
 *
 * What is up here: picking the seed to ask for (a seed is an arbitrary
 * number, not an answer), keeping the row coherent while someone taps
 * around it, and re-deriving crops when a slot changes shape.
 */

import { suggestRotatedCrop } from './rotateGeometry';

/** A slot's own on-card pixel aspect ratio: its fraction of the card,
 * scaled by the whole card's ratio -- see CLAUDE.md/`crop.rs`'s
 * `suggest_for_ratio` for why a collage slot needs this instead of one of
 * the three named templates. Mirrors `collage_gen`'s own `pixel_ratio`,
 * which is what its slot guardrails are written against. */
export function slotPixelRatio(area, cardRatio) {
  return (area.w / area.h) * cardRatio;
}

/** A seed for a row of layouts. Any 32-bit number will do -- Rust turns
 * it into arrangements -- so this is the one genuinely arbitrary choice
 * in the feature, and the only part that should differ between two
 * openings of the editor. */
export function randomSeed() {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

/**
 * The row to actually show: what the last shuffle dealt, plus the
 * currently-selected layout if that isn't among them.
 *
 * Without this, shuffling while a layout is in use takes its swatch off
 * the screen -- the collage on the card is still using it, but nothing is
 * highlighted, so the shuffle reads as having silently changed the card.
 * Prepending rather than replacing keeps all six new options too: the
 * point of the tap was to see new ones.
 */
export function withSelected(row, selected) {
  if (!selected) return row;
  return row.some((l) => l.id === selected.id) ? row : [selected, ...row];
}

/**
 * Moves the photos already placed onto a different layout's slots, by
 * index -- slot 0's photo stays slot 0's photo. (Rust returns every
 * layout's slots in reading order for exactly this reason, so "index 0"
 * means the same corner of the card in both layouts.)
 *
 * Switching layout used to reset the whole collage to empty, which was
 * survivable when the three layouts were a one-time pick at the start.
 * With a Shuffle button it would mean a row of swatches that each throw
 * away every photo, message, sticker and stroke on the card -- the
 * feature would be unusable.
 *
 * What resets per slot is what belonged to the *old shape*: the crop and
 * the zoom, which were framed for different proportions and would be
 * wrong (or out of bounds) against the new ones. What carries is what
 * belongs to the *photo* -- the filter, the adjustments, and the angle it
 * was turned to -- the same line `REPLACE_PHOTO` draws in the other
 * direction, where the shape stays and the photo changes. (A photo
 * someone straightened is straight regardless of which slot it lands in;
 * the crop that fits at that angle is what depends on the slot, which is
 * why the rotation is carried *into* the new suggestion rather than
 * reset alongside the crop.)
 *
 * A layout with fewer slots than there are photos drops the extras; they
 * are the last ones in reading order, which is the only stable answer
 * available and at least a predictable one.
 */
export function carrySlots(wasmModule, slots, layout, cardRatio, emptySlot) {
  return layout.slots.map((s, index) => {
    const prev = slots[index];
    if (!prev?.photo) return emptySlot();
    const rotation = prev.rotation ?? 0;
    const base = suggestRotatedCrop(
      wasmModule,
      prev.photo.naturalW,
      prev.photo.naturalH,
      rotation,
      slotPixelRatio(s.area, cardRatio),
    );
    return { ...prev, baseCrop: base, crop: base, zoom: 1 };
  });
}

/**
 * The slot an arrow key should move to, or `null` when there is none in
 * that direction.
 *
 * Ordinal order (slot 0, 1, 2…) is the wrong answer here: the layouts are
 * generated, so slot 2 of a three-up can sit below slot 1 in one
 * arrangement and beside it in the next, and a keyboard user would be
 * navigating an order they cannot see. `dx`/`dy` are a unit step in card
 * space, and the answer is the nearest slot that actually shares an edge
 * that way -- which is the arrangement the eye reads.
 *
 * "Shares an edge" and not "lies roughly that way": a candidate has to
 * overlap the slot being left across the axis pressed. Down out of a tall
 * left-hand slot therefore does nothing rather than jumping to the
 * bottom-right corner, and Up from wherever Down landed comes back to
 * where it started. Nothing is stranded by the stricter rule, because the
 * slots tile the card -- every one of them touches another on some side.
 */
const EPSILON = 1e-6;

export function slotInDirection(layout, fromIndex, dx, dy) {
  const slots = layout?.slots;
  const origin = slots?.[fromIndex]?.area;
  if (!origin) return null;

  // The pressed axis ("along") and the one at right angles to it
  // ("across"), each as the interval the rectangle occupies.
  const along = (a) => (dx ? [a.x, a.x + a.w] : [a.y, a.y + a.h]);
  const across = (a) => (dx ? [a.y, a.y + a.h] : [a.x, a.x + a.w]);
  const sign = dx || dy;
  const [originLo, originHi] = across(origin);
  const originEdge = sign > 0 ? along(origin)[1] : along(origin)[0];
  const originMid = (originLo + originHi) / 2;

  let best = null;
  let bestScore = null;
  slots.forEach(({ area }, index) => {
    if (index === fromIndex) return;
    const [lo, hi] = across(area);
    if (Math.min(originHi, hi) - Math.max(originLo, lo) <= EPSILON) return;
    const [aLo, aHi] = along(area);
    const gap = sign > 0 ? aLo - originEdge : originEdge - aHi;
    if (gap < -EPSILON) return;
    // Nearest in the direction pressed; a tie (two slots stacked against
    // the same edge) goes to whichever lines up better, and a tie there
    // to reading order.
    const score = [gap, Math.abs((lo + hi) / 2 - originMid)];
    if (bestScore === null || score[0] < bestScore[0] - EPSILON) {
      bestScore = score;
      best = index;
    } else if (score[0] < bestScore[0] + EPSILON && score[1] < bestScore[1] - EPSILON) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}
