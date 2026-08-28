/**
 * A curated greeting-message starter per `Vibe` -- not AI-generated text.
 * "Suggest a look" is a fast, always-on lookup by design (see CLAUDE.md),
 * so it stays a single hand-written, translated sentence per vibe rather
 * than a large pool: real per-photo AI-generated text is "Write a
 * caption" instead (SmolVLM-256M-Instruct, its own explicit ~140MB
 * download), which looks at the actual photo and writes an original
 * sentence -- this pool is not trying to compete with that, just to give
 * "Suggest a look" a warm one-line default with no download at all.
 */
export const VIBE_CAPTIONS = {
  beach: 'vibe.caption.beach',
  mountain: 'vibe.caption.mountain',
  water: 'vibe.caption.water',
  architecture: 'vibe.caption.architecture',
  winter: 'vibe.caption.winter',
  food: 'vibe.caption.food',
  pet: 'vibe.caption.pet',
};

export function captionFor(vibe) {
  return VIBE_CAPTIONS[vibe] ?? null;
}
