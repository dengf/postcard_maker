/**
 * What to recommend for each `Vibe` the classifier can return -- which
 * filter, and optionally which sticker. This is curatorial/copy, not a
 * calculation with one right answer (unlike the classification itself,
 * which is `postcard_calc::vibe`'s job), so it lives here in the host
 * layer, same as `stickers.js`'s own labels.
 */
export const VIBE_SUGGESTIONS = {
  beach: { labelKey: 'vibe.chip.beach', filter: 'vintage', sticker: 'wave' },
  mountain: { labelKey: 'vibe.chip.mountain', filter: 'none', sticker: null },
  water: { labelKey: 'vibe.chip.water', filter: 'none', sticker: 'wave' },
  architecture: { labelKey: 'vibe.chip.architecture', filter: 'grayscale', sticker: null },
  winter: { labelKey: 'vibe.chip.winter', filter: 'grayscale', sticker: null },
  food: { labelKey: 'vibe.chip.food', filter: 'vintage', sticker: null },
  pet: { labelKey: 'vibe.chip.pet', filter: 'none', sticker: 'heart' },
};

export function suggestionFor(vibe) {
  return VIBE_SUGGESTIONS[vibe] ?? null;
}
