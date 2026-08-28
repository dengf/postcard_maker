/**
 * A curated greeting-message starter per `Vibe` -- not AI-generated text
 * (this app has no server and never uploads a photo, and an on-device
 * model capable of genuinely writing a sentence needs 600MB-1.3GB+, far
 * past this app's footprint goal; see CLAUDE.md). One hand-written,
 * translated sentence per vibe instead: still tailored to what the photo
 * actually shows, just picked rather than generated.
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
