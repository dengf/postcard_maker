// Host-layer by design, like `fonts.js`'s `containsCjk`: the question this
// answers is "why did *the browser* refuse to decode this file", which is a
// property of the user agent's own image decoder, not of any image math
// postcard-calc owns. There is nothing here a second implementation could
// get numerically wrong -- it reads the MIME type the file picker handed us
// and the name's extension, and picks which sentence to show.
//
// Why it exists at all: HEIC is the iPhone camera's default format, and no
// browser but Safari decodes it. The app used to warn about this on the
// intro screen, before anyone had chosen anything -- a caveat aimed at a
// failure most people never hit, and wrong for its own primary audience,
// since Safari handles HEIC natively and iOS's own picker usually converts
// to JPEG on the way out. The warning now happens where it's true: on the
// file that actually failed.

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const HEIC_EXTENSIONS = ['.heic', '.heif'];

/**
 * Whether a file the picker gave us looks like HEIC/HEIF.
 *
 * Checks the declared type first, then falls back to the extension: some
 * platforms hand over an empty `type` for formats they don't themselves
 * recognize, which is exactly the case that matters here.
 */
export function isLikelyHeic(file) {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  if (HEIC_TYPES.includes(type)) return true;
  const name = (file.name || '').toLowerCase();
  return HEIC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * The `errors.*` catalog key for a photo the browser could not decode.
 *
 * Shaped as a `Message`-like `{ code }` so `ErrorToast` localizes it the
 * same way it does the codes that cross the wasm boundary -- see
 * `postcard-wasm/src/message.rs`. Naming HEIC when it is HEIC is the whole
 * point: "that photo couldn't be read" leaves someone re-picking the same
 * photo, while naming the format points at the two things that do work.
 */
export function unreadablePhotoError(file) {
  return { code: isLikelyHeic(file) ? 'err.heicUnsupported' : 'err.unreadableImage' };
}
