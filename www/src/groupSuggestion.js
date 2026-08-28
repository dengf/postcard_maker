/**
 * A "there are people in this photo" suggestion, based purely on
 * `count_faces`'s face count -- no object classification, so like
 * `exposureSuggestion.js` it works on the case the vibe classifier
 * structurally can't: a photo of people, which ImageNet has almost no
 * classes for.
 *
 * Two tiers, not one: 2+ faces gets a "you're together" look and caption;
 * exactly 1 face gets its own "solo shot" look and caption, distinct in
 * tone (no "we"/"together" phrasing for a photo of one person). A solo
 * portrait -- one person, on their own trip -- is arguably the single
 * most common postcard photo, and before this it fell through every
 * suggestion path with nothing to offer: not a group, and the vibe
 * classifier has almost no "person" classes to match against. Neither
 * tier guesses *who* the people are or their relationship to each other
 * (family, friends, a couple...) -- that specific inference was
 * researched and ruled out earlier, it's an open, unsolved computer-vision
 * research problem with no small deployable model, not a feature gap.
 * Claiming to know a relationship the photo can't actually reveal would
 * be a worse failure than saying nothing.
 */

import { pickCaption } from './vibeCaptions';

const SOLO_COUNT = 1;
const GROUP_THRESHOLD = 2;

const SOLO_CAPTIONS = [
  'solo.caption.0',
  'solo.caption.1',
  'solo.caption.2',
  'solo.caption.3',
  'solo.caption.4',
  'solo.caption.5',
  'solo.caption.6',
  'solo.caption.7',
];

const GROUP_CAPTIONS = [
  'group.caption.0',
  'group.caption.1',
  'group.caption.2',
  'group.caption.3',
  'group.caption.4',
  'group.caption.5',
  'group.caption.6',
  'group.caption.7',
];

export function suggestGroup(faceCount) {
  if (faceCount >= GROUP_THRESHOLD) return { labelKey: 'group.together', sticker: 'confetti' };
  if (faceCount === SOLO_COUNT) return { labelKey: 'group.solo', sticker: 'heart' };
  return null;
}

export function groupCaptionFor(faceCount) {
  if (faceCount >= GROUP_THRESHOLD) return pickCaption(GROUP_CAPTIONS);
  if (faceCount === SOLO_COUNT) return pickCaption(SOLO_CAPTIONS);
  return null;
}
