/**
 * A curated pool of greeting-message starters per `Vibe` -- not
 * AI-generated text ("Write a caption" tried a real on-device model for
 * this and was pulled after real-world testing, see CLAUDE.md). Several
 * hand-written, translated variants per vibe instead of one fixed line:
 * a single caption repeated verbatim every time reads as dull rather
 * than tailored, even though it's genuinely picked for what's in the
 * photo. `captionFor` picks one at random per tap, so suggesting a look
 * again on the same photo can surface a different line.
 */
export const VIBE_CAPTIONS = {
  beach: [
    'vibe.caption.beach.0',
    'vibe.caption.beach.1',
    'vibe.caption.beach.2',
    'vibe.caption.beach.3',
    'vibe.caption.beach.4',
    'vibe.caption.beach.5',
    'vibe.caption.beach.6',
    'vibe.caption.beach.7',
  ],
  mountain: [
    'vibe.caption.mountain.0',
    'vibe.caption.mountain.1',
    'vibe.caption.mountain.2',
    'vibe.caption.mountain.3',
    'vibe.caption.mountain.4',
    'vibe.caption.mountain.5',
    'vibe.caption.mountain.6',
    'vibe.caption.mountain.7',
  ],
  water: [
    'vibe.caption.water.0',
    'vibe.caption.water.1',
    'vibe.caption.water.2',
    'vibe.caption.water.3',
    'vibe.caption.water.4',
    'vibe.caption.water.5',
    'vibe.caption.water.6',
    'vibe.caption.water.7',
  ],
  architecture: [
    'vibe.caption.architecture.0',
    'vibe.caption.architecture.1',
    'vibe.caption.architecture.2',
    'vibe.caption.architecture.3',
    'vibe.caption.architecture.4',
    'vibe.caption.architecture.5',
    'vibe.caption.architecture.6',
    'vibe.caption.architecture.7',
  ],
  winter: [
    'vibe.caption.winter.0',
    'vibe.caption.winter.1',
    'vibe.caption.winter.2',
    'vibe.caption.winter.3',
    'vibe.caption.winter.4',
    'vibe.caption.winter.5',
    'vibe.caption.winter.6',
    'vibe.caption.winter.7',
  ],
  food: [
    'vibe.caption.food.0',
    'vibe.caption.food.1',
    'vibe.caption.food.2',
    'vibe.caption.food.3',
    'vibe.caption.food.4',
    'vibe.caption.food.5',
    'vibe.caption.food.6',
    'vibe.caption.food.7',
  ],
  pet: [
    'vibe.caption.pet.0',
    'vibe.caption.pet.1',
    'vibe.caption.pet.2',
    'vibe.caption.pet.3',
    'vibe.caption.pet.4',
    'vibe.caption.pet.5',
    'vibe.caption.pet.6',
    'vibe.caption.pet.7',
  ],
};

/**
 * Picks a random caption key from `pool` -- shared by this module's
 * `captionFor` and `groupSuggestion.js`'s own caption pool, so both pick
 * the same way.
 */
export function pickCaption(pool) {
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function captionFor(vibe) {
  return pickCaption(VIBE_CAPTIONS[vibe]);
}
