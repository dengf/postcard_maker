/**
 * What to recommend for each `Vibe` the classifier can return -- which
 * filter, and optionally which sticker. This is curatorial/copy, not a
 * calculation with one right answer (unlike the classification itself,
 * which is `postcard_calc::vibe`'s job), so it lives here in the host
 * layer, same as `stickers.js`'s own labels.
 *
 * Each vibe maps to a *list* of three look variants, not just one --
 * "Suggest a look" surfaces a small set of candidates rather than a
 * single answer, and `buildCandidates` below layers those variants
 * across the model's own top-matched vibes for "show a couple, then let
 * me shuffle for different ones." Three per vibe, not two: the single
 * most common case is exactly one matched vibe (most photos don't
 * confidently clear the confidence floor for a second one -- see
 * `postcard_calc::vibe::classify_top_vibes`), and with `VibePanel.jsx`
 * showing 2 at a time, two variants alone would never leave anything to
 * shuffle into for that overwhelmingly common single-vibe case.
 */
export const VIBE_SUGGESTIONS = {
  beach: [
    { labelKey: 'vibe.chip.beach', filter: 'vintage', sticker: 'wave' },
    { labelKey: 'vibe.chip.beach.alt', filter: 'sepia', sticker: 'palm' },
    { labelKey: 'vibe.chip.beach.alt2', filter: 'grayscale', sticker: 'wave' },
  ],
  mountain: [
    { labelKey: 'vibe.chip.mountain', filter: 'none', sticker: null },
    { labelKey: 'vibe.chip.mountain.alt', filter: 'grayscale', sticker: null },
    { labelKey: 'vibe.chip.mountain.alt2', filter: 'none', sticker: 'sun' },
  ],
  water: [
    { labelKey: 'vibe.chip.water', filter: 'none', sticker: 'wave' },
    { labelKey: 'vibe.chip.water.alt', filter: 'vintage', sticker: 'wave' },
    { labelKey: 'vibe.chip.water.alt2', filter: 'grayscale', sticker: 'wave' },
  ],
  architecture: [
    { labelKey: 'vibe.chip.architecture', filter: 'grayscale', sticker: null },
    { labelKey: 'vibe.chip.architecture.alt', filter: 'sepia', sticker: null },
    { labelKey: 'vibe.chip.architecture.alt2', filter: 'none', sticker: null },
  ],
  winter: [
    { labelKey: 'vibe.chip.winter', filter: 'grayscale', sticker: null },
    { labelKey: 'vibe.chip.winter.alt', filter: 'none', sticker: 'cloud' },
    { labelKey: 'vibe.chip.winter.alt2', filter: 'sepia', sticker: null },
  ],
  food: [
    { labelKey: 'vibe.chip.food', filter: 'vintage', sticker: null },
    { labelKey: 'vibe.chip.food.alt', filter: 'sepia', sticker: null },
    { labelKey: 'vibe.chip.food.alt2', filter: 'none', sticker: null },
  ],
  pet: [
    { labelKey: 'vibe.chip.pet', filter: 'none', sticker: 'heart' },
    { labelKey: 'vibe.chip.pet.alt', filter: 'vintage', sticker: 'heart' },
    { labelKey: 'vibe.chip.pet.alt2', filter: 'none', sticker: 'star' },
  ],
};

export function looksFor(vibe) {
  return VIBE_SUGGESTIONS[vibe] ?? [];
}

/**
 * Flattens the classifier's top vibe matches into one ordered candidate
 * list: every vibe's primary look first (ranked by the model's own
 * confidence order), then every vibe's alternate looks after. The panel
 * shows a front slice of this list and "shuffles" through the rest,
 * rather than needing separate per-vibe state.
 */
export function buildCandidates(matches) {
  const primary = [];
  const alternates = [];
  for (const m of matches) {
    looksFor(m.vibe).forEach((look, i) => {
      const candidate = { ...look, vibe: m.vibe, confidence: m.confidence };
      (i === 0 ? primary : alternates).push(candidate);
    });
  }
  return [...primary, ...alternates];
}
