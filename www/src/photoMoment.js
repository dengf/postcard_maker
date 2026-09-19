/**
 * "When was this taken" -- the one signal in "Suggest a look" that costs
 * no download at all.
 *
 * Every other signal here needs a model: the vibe classifier ~10MB, the
 * face detector ~1MB, both behind `vibeWorker.js`'s lazy fetch. This one
 * reads bytes that are already inside the photo, through the *main*
 * wasm bundle (`postcard-wasm`, +41KB raw / +14KB gzipped for the EXIF
 * parser), so it is available the moment a photo opens and needs no
 * network at all. See `postcard_calc::moment` for the seasons/hours
 * rules, which are Rust's, not this file's.
 *
 * Like `exposureSuggestion.js` and `groupSuggestion.js`, it covers what
 * the vibe classifier structurally cannot: a date needs no object
 * recognition, so it works on a photo of people, a photo in the dark,
 * and a photo of nothing recognisable at all.
 *
 * What lives here is the curation -- which sentence suits which season
 * or hour -- exactly the host-layer/copy half of the split the rest of
 * this feature already follows.
 */

import { pickCaption } from './vibeCaptions';

// Seasonal lines, four per season. `null` season (the tropics -- see
// `Belt` in Rust) simply contributes nothing here, which is the point:
// there is no "winter" to name in Singapore, and the time-of-day pool
// below still has something to say about any photo.
const SEASON_CAPTIONS = {
  spring: [
    'moment.caption.spring.0',
    'moment.caption.spring.1',
    'moment.caption.spring.2',
    'moment.caption.spring.3',
  ],
  summer: [
    'moment.caption.summer.0',
    'moment.caption.summer.1',
    'moment.caption.summer.2',
    'moment.caption.summer.3',
  ],
  autumn: [
    'moment.caption.autumn.0',
    'moment.caption.autumn.1',
    'moment.caption.autumn.2',
    'moment.caption.autumn.3',
  ],
  winter: [
    'moment.caption.winter.0',
    'moment.caption.winter.1',
    'moment.caption.winter.2',
    'moment.caption.winter.3',
  ],
};

const TIME_CAPTIONS = {
  morning: [
    'moment.caption.morning.0',
    'moment.caption.morning.1',
    'moment.caption.morning.2',
    'moment.caption.morning.3',
  ],
  afternoon: [
    'moment.caption.afternoon.0',
    'moment.caption.afternoon.1',
    'moment.caption.afternoon.2',
    'moment.caption.afternoon.3',
  ],
  evening: [
    'moment.caption.evening.0',
    'moment.caption.evening.1',
    'moment.caption.evening.2',
    'moment.caption.evening.3',
  ],
  night: [
    'moment.caption.night.0',
    'moment.caption.night.1',
    'moment.caption.night.2',
    'moment.caption.night.3',
  ],
};

/** The browser's IANA zone, or `''`. Permission-free and request-free,
 * the same observation `location.js` makes for the postmark -- and only
 * a fallback: a photo carrying its own GPS never consults it. */
function timezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/**
 * The wrapper every call site goes through, so none of them has to
 * remember that the binding takes a timezone as well as the bytes --
 * the arity hazard `wasm-call-sites.test.js` exists to catch (a wasm
 * binding called with too few arguments throws a message that names
 * nothing in this codebase).
 *
 * Returns `null` for a photo with no EXIF date, which is an ordinary
 * outcome and not an error: screenshots, downloaded images, anything
 * that has been through a chat app, and -- worth knowing before hunting
 * for a bug -- photos taken with this app's own in-page camera, since
 * `canvas.toBlob` writes no EXIF at all.
 */
export function readPhotoMoment(wasmModule, bytes) {
  try {
    return wasmModule.read_photo_moment(bytes, timezone()) ?? null;
  } catch {
    // Best-effort, like `photoTone`: a suggestion that can't be made is
    // not worth a toast, and every other suggestion path still runs.
    return null;
  }
}

/**
 * A greeting line suited to when the photo was taken, or `null`.
 *
 * Season and time-of-day lines share one pool rather than the season
 * winning outright: both are true of the same photo, and always leading
 * with the season would make every photo from one trip open the same
 * way.
 */
export function momentCaptionFor(moment) {
  if (!moment) return null;
  const pool = [
    ...(moment.season ? (SEASON_CAPTIONS[moment.season] ?? []) : []),
    ...(TIME_CAPTIONS[moment.timeOfDay] ?? []),
  ];
  return pickCaption(pool);
}
