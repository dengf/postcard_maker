/**
 * "Email it" / "Save it" for a finished postcard -- one image, or two
 * when the optional back side is on. No server is ever involved -- see
 * CLAUDE.md for the full reasoning behind trying the Web Share API first
 * and falling back to a download plus a `mailto:` draft.
 */

function fileFrom({ blob, filename }) {
  return new File([blob], filename, { type: blob.type });
}

function saveOne({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Deferred so the download has actually started before the blob URL it
  // points at is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `files` is `[{ blob, filename }, ...]` -- one entry normally, two when
 * a back side was generated. Each downloads as its own file; browsers
 * don't offer a "save several files as one action" primitive. */
export function saveFiles(files) {
  files.forEach(saveOne);
}

export function savePostcard(blob, filename) {
  saveFiles([{ blob, filename }]);
}

export function canShareFiles(files) {
  const shareFiles = files.map(fileFrom);
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: shareFiles });
}

export function canShareFile(blob, filename) {
  return canShareFiles([{ blob, filename }]);
}

/** Resolves `true` if the native share sheet opened (including if the
 * user then cancelled it -- see below); `false` if the API isn't
 * available at all, so the caller knows whether to fall back. */
export async function shareFiles(files, { title, text } = {}) {
  if (!canShareFiles(files)) return false;
  try {
    await navigator.share({ files: files.map(fileFrom), title, text });
    return true;
  } catch (err) {
    // AbortError is the user cancelling the share sheet -- not a failure
    // worth falling back from with a second, confusing download.
    if (err?.name === 'AbortError') return true;
    return false;
  }
}

export async function sharePostcard(blob, filename, opts) {
  return shareFiles([{ blob, filename }], opts);
}
