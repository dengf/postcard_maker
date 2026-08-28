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
 * How well a look's filter suits a photo's actual tone (see
 * `photoTone.js`) -- higher is a better match. Without this, every photo
 * classified as the same `Vibe` gets the identical top suggestion
 * regardless of what it actually looks like, which is exactly what read
 * as "dumb" -- two beach photos, one blown-out and bright, one hazy and
 * flat, calling for different treatments, not the same canned answer.
 * Each case is a real, if informal, photo-editing judgment call, not
 * arbitrary: grayscale reads best on a scene with enough brightness and
 * color contrast to still carry without hue; vintage's desaturating,
 * dimming look suits a photo that's already vivid and can afford to be
 * toned down; sepia's warmth complements a photo that's dim or washed
 * out rather than doubling down on one that's already vivid; keeping the
 * original suits a photo that's already reasonably balanced.
 */
function scoreForTone(filter, { brightness, saturation }) {
  switch (filter) {
    case 'grayscale':
      return brightness * 0.6 + saturation * 0.4;
    case 'vintage':
      return brightness * 0.4 + saturation * 0.6;
    case 'sepia':
      return (1 - brightness) * 0.5 + (1 - saturation) * 0.5;
    case 'none':
    default:
      return 1 - Math.abs(brightness - 0.5) * 2;
  }
}

/**
 * Flattens the classifier's top vibe matches into one ordered candidate
 * list: every vibe's own looks ranked by fit against `tone` first (see
 * `scoreForTone`), then every vibe's primary pick ahead of any vibe's
 * alternates, mirroring the model's own confidence order across vibes.
 * The panel shows a front slice of this list and "shuffles" through the
 * rest, rather than needing separate per-vibe state. `tone` is optional
 * -- omitting it (or passing `null`) falls back to each vibe's own
 * curated order, same as before this existed.
 */
export function buildCandidates(matches, tone = null) {
  const primary = [];
  const alternates = [];
  for (const m of matches) {
    const looks = tone
      ? [...looksFor(m.vibe)].sort((a, b) => scoreForTone(b.filter, tone) - scoreForTone(a.filter, tone))
      : looksFor(m.vibe);
    looks.forEach((look, i) => {
      const candidate = { ...look, vibe: m.vibe, confidence: m.confidence };
      (i === 0 ? primary : alternates).push(candidate);
    });
  }
  return [...primary, ...alternates];
}
