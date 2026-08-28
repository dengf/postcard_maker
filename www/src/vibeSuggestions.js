import { toneAdjustments } from "./exposureSuggestion";

/**
 * What to recommend for each `Vibe` the classifier can return -- which
 * filter, and optionally which sticker. This is curatorial/copy, not a
 * calculation with one right answer (unlike the classification itself,
 * which is `postcard_calc::vibe`'s job), so it lives here in the host
 * layer, same as `stickers.js`'s own labels.
 *
 * Rather than hand-writing (and translating into three languages) one
 * full sentence per look, each vibe declares a small curated set of
 * plausible filters and stickers (`VIBE_LOOKS`); `looksFor` takes their
 * cross product. That is a real, if informal, photo-editing judgment
 * call for each vibe -- same as the filters/stickers list was before --
 * but multiplying two short curated lists gives a much larger, still
 * tasteful pool (124 looks across the 7 vibes) without maintaining 124
 * hand-translated strings.
 *
 * The sentence itself is a second, independent composition on top of
 * that: an "opener" naming the vibe (`vibe.opener.*`, 10 variants) plus
 * a "closer" naming the filter and, if there is one, the sticker
 * (`vibe.closer.withSticker.*`/`vibe.closer.noSticker.*`, 5 variants
 * each) -- see `VibePanel.jsx`'s `labelFor`, which joins
 * `${opener} — ${closer}`. 10 openers x 5 closers is 50 distinct
 * sentence shapes for a with-sticker look and 50 more for a
 * without-sticker one -- ~100 phrasings, from 20 short translated
 * pieces rather than 100 full hand-translated sentences, layered on top
 * of the 124-look filter/sticker pool so the wording doesn't repeat
 * itself every time a candidate cycles back to the same filter/sticker.
 */
export const VIBE_LOOKS = {
  beach: {
    filters: ["vintage", "sepia", "grayscale", "none"],
    stickers: [null, "wave", "palm", "sun", "star"],
  },
  mountain: {
    filters: ["none", "grayscale", "sepia", "vintage"],
    stickers: [null, "sun", "cloud", "star", "arrow"],
  },
  water: {
    filters: ["none", "vintage", "grayscale", "sepia"],
    stickers: [null, "wave", "cloud", "star"],
  },
  architecture: {
    filters: ["grayscale", "sepia", "none", "vintage"],
    stickers: [null, "arrow", "star", "stamp", "washi"],
  },
  winter: {
    filters: ["grayscale", "none", "sepia", "vintage"],
    stickers: [null, "cloud", "star", "blossom"],
  },
  food: {
    filters: ["vintage", "sepia", "none", "grayscale"],
    stickers: [null, "heart", "star", "washi"],
  },
  pet: {
    filters: ["none", "vintage", "sepia", "grayscale"],
    stickers: [null, "heart", "star", "confetti"],
  },
};

const OPENER_COUNT = 10;
const CLOSER_COUNT = 5;

/**
 * Every (filter, sticker) pair for one vibe, in the vibe's own curated
 * preference order (used as the tie-break when no photo tone is known).
 * A pure cross product, not a further hand-curated list -- see the
 * module doc comment for why that is the deliberate design here.
 *
 * `openerIndex`/`closerIndex` are picked independently (different
 * strides through the pair's own position in the cross product) rather
 * than from the same index, so two looks that happen to land on the
 * same opener don't also always land on the same closer -- a small
 * decorrelation that spreads the ~100 possible sentence shapes out
 * across the pool instead of visibly cycling in lockstep.
 */
export function looksFor(vibe) {
  const spec = VIBE_LOOKS[vibe];
  if (!spec) return [];
  const looks = [];
  spec.filters.forEach((filter, fi) => {
    spec.stickers.forEach((sticker, si) => {
      const index = fi * spec.stickers.length + si;
      looks.push({
        vibe,
        filter,
        sticker,
        vibeLabelKey: `vibe.label.${vibe}`,
        filterLabelKey: `editor.filter.${filter}`,
        stickerLabelKey: sticker ? `stickers.${sticker}` : null,
        openerKey: `vibe.opener.${index % OPENER_COUNT}`,
        closerKey: sticker
          ? `vibe.closer.withSticker.${(index * 3 + 1) % CLOSER_COUNT}`
          : `vibe.closer.noSticker.${(index * 3 + 1) % CLOSER_COUNT}`,
      });
    });
  });
  return looks;
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
    case "grayscale":
      return brightness * 0.6 + saturation * 0.4;
    case "vintage":
      return brightness * 0.4 + saturation * 0.6;
    case "sepia":
      return (1 - brightness) * 0.5 + (1 - saturation) * 0.5;
    case "none":
    default:
      return 1 - Math.abs(brightness - 0.5) * 2;
  }
}

/**
 * Flattens the classifier's top vibe matches into one ordered candidate
 * list: every vibe's own looks ranked by fit against `tone` first (see
 * `scoreForTone`), then every vibe's top pick ahead of any vibe's other
 * looks, mirroring the model's own confidence order across vibes. The
 * panel shows a front slice of this list and "shuffles" through the
 * rest, rather than needing separate per-vibe state. `tone` is optional
 * -- omitting it (or passing `null`) falls back to each vibe's own
 * curated order, same as before this existed.
 *
 * Every candidate also carries whatever `toneAdjustments(tone)` returns
 * (a brightness/contrast/saturation nudge -- see `exposureSuggestion.js`)
 * when the photo's own pixel statistics call for one, so applying a
 * vibe-based look never leaves an under/overexposed or washed-out photo
 * uncorrected just because it happened to also match a `Vibe`.
 */
export function buildCandidates(matches, tone = null) {
  const adjustments = toneAdjustments(tone);
  const primary = [];
  const alternates = [];
  for (const m of matches) {
    const looks = tone
      ? [...looksFor(m.vibe)].sort(
          (a, b) => scoreForTone(b.filter, tone) - scoreForTone(a.filter, tone),
        )
      : looksFor(m.vibe);
    looks.forEach((look, i) => {
      const candidate = { ...look, confidence: m.confidence, adjustments };
      (i === 0 ? primary : alternates).push(candidate);
    });
  }
  return [...primary, ...alternates];
}
