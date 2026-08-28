/**
 * A "people are together in this photo" suggestion, based purely on
 * `count_faces`'s face count -- no object classification, so like
 * `exposureSuggestion.js` it works on the case the vibe classifier
 * structurally can't: a photo of people, which ImageNet has almost no
 * classes for.
 *
 * Deliberately generic: 2+ faces gets one "you're together" look and
 * caption, never a guess at *who* these people are to each other
 * (family, friends, a couple...). That specific inference was researched
 * and ruled out -- it's an open, unsolved computer-vision research
 * problem with no small deployable model, not a feature gap. Claiming to
 * know a relationship the photo can't actually reveal would be a worse
 * failure than saying nothing.
 */

const THRESHOLD = 2;

export function suggestGroup(faceCount) {
  if (faceCount < THRESHOLD) return null;
  return { labelKey: 'group.together', sticker: 'confetti' };
}

export function groupCaptionFor(faceCount) {
  return faceCount >= THRESHOLD ? 'group.caption' : null;
}
