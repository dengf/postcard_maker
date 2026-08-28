/**
 * A curated pool of greeting-message starters per `Vibe` -- not
 * AI-generated text ("Write a caption" tried a real on-device model for
 * this and was pulled after real-world testing, see CLAUDE.md). Several
 * hand-written, translated variants per vibe instead of one fixed line:
 * a single caption repeated verbatim every time reads as dull rather
 * than tailored, even though it's genuinely picked for what's in the
 * photo. `captionFor` picks one at random per tap, so suggesting a look
 * again on the same photo can surface a different line.
 *
 * The last entry in each pool is a short public-domain poetry quote
 * (Matthew Arnold, Du Fu, Li Bai, Keats, Frost, Rossetti, Su Shi --
 * all well over a century out of copyright, the Chinese classical
 * verses closer to twelve centuries) matched to that vibe's theme, with
 * plain attribution. One per pool, not the whole pool -- these are meant
 * to season the repertoire, not turn every suggested message into a
 * literature quiz.
 */
export const VIBE_CAPTIONS = {
  beach: [
    "vibe.caption.beach.0",
    "vibe.caption.beach.1",
    "vibe.caption.beach.2",
    "vibe.caption.beach.3",
    "vibe.caption.beach.4",
    "vibe.caption.beach.5",
    "vibe.caption.beach.6",
    "vibe.caption.beach.7",
    "vibe.caption.beach.8",
    "vibe.caption.beach.9",
    "vibe.caption.beach.10",
    "vibe.caption.beach.11",
    "vibe.caption.beach.12",
  ],
  mountain: [
    "vibe.caption.mountain.0",
    "vibe.caption.mountain.1",
    "vibe.caption.mountain.2",
    "vibe.caption.mountain.3",
    "vibe.caption.mountain.4",
    "vibe.caption.mountain.5",
    "vibe.caption.mountain.6",
    "vibe.caption.mountain.7",
    "vibe.caption.mountain.8",
    "vibe.caption.mountain.9",
    "vibe.caption.mountain.10",
    "vibe.caption.mountain.11",
    "vibe.caption.mountain.12",
  ],
  water: [
    "vibe.caption.water.0",
    "vibe.caption.water.1",
    "vibe.caption.water.2",
    "vibe.caption.water.3",
    "vibe.caption.water.4",
    "vibe.caption.water.5",
    "vibe.caption.water.6",
    "vibe.caption.water.7",
    "vibe.caption.water.8",
    "vibe.caption.water.9",
    "vibe.caption.water.10",
    "vibe.caption.water.11",
    "vibe.caption.water.12",
  ],
  architecture: [
    "vibe.caption.architecture.0",
    "vibe.caption.architecture.1",
    "vibe.caption.architecture.2",
    "vibe.caption.architecture.3",
    "vibe.caption.architecture.4",
    "vibe.caption.architecture.5",
    "vibe.caption.architecture.6",
    "vibe.caption.architecture.7",
    "vibe.caption.architecture.8",
    "vibe.caption.architecture.9",
    "vibe.caption.architecture.10",
    "vibe.caption.architecture.11",
    "vibe.caption.architecture.12",
  ],
  winter: [
    "vibe.caption.winter.0",
    "vibe.caption.winter.1",
    "vibe.caption.winter.2",
    "vibe.caption.winter.3",
    "vibe.caption.winter.4",
    "vibe.caption.winter.5",
    "vibe.caption.winter.6",
    "vibe.caption.winter.7",
    "vibe.caption.winter.8",
    "vibe.caption.winter.9",
    "vibe.caption.winter.10",
    "vibe.caption.winter.11",
    "vibe.caption.winter.12",
  ],
  food: [
    "vibe.caption.food.0",
    "vibe.caption.food.1",
    "vibe.caption.food.2",
    "vibe.caption.food.3",
    "vibe.caption.food.4",
    "vibe.caption.food.5",
    "vibe.caption.food.6",
    "vibe.caption.food.7",
    "vibe.caption.food.8",
    "vibe.caption.food.9",
    "vibe.caption.food.10",
    "vibe.caption.food.11",
    "vibe.caption.food.12",
  ],
  pet: [
    "vibe.caption.pet.0",
    "vibe.caption.pet.1",
    "vibe.caption.pet.2",
    "vibe.caption.pet.3",
    "vibe.caption.pet.4",
    "vibe.caption.pet.5",
    "vibe.caption.pet.6",
    "vibe.caption.pet.7",
    "vibe.caption.pet.8",
    "vibe.caption.pet.9",
    "vibe.caption.pet.10",
    "vibe.caption.pet.11",
    "vibe.caption.pet.12",
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
