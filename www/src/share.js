/**
 * "Email it" / "Save it" for a finished postcard blob. No server is ever
 * involved -- see CLAUDE.md for the full reasoning behind trying the Web
 * Share API first and falling back to a download plus a `mailto:` draft.
 */

export function savePostcard(blob, filename) {
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

function fileFrom(blob, filename) {
  return new File([blob], filename, { type: blob.type });
}

export function canShareFile(blob, filename) {
  const file = fileFrom(blob, filename);
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

/** Resolves `true` if the native share sheet opened; `false` if it was
 * cancelled or isn't available, so the caller knows whether to fall back. */
export async function sharePostcard(blob, filename, { title, text } = {}) {
  if (!canShareFile(blob, filename)) return false;
  try {
    await navigator.share({ files: [fileFrom(blob, filename)], title, text });
    return true;
  } catch (err) {
    // AbortError is the user cancelling the share sheet -- not a failure
    // worth falling back from with a second, confusing download.
    if (err?.name === 'AbortError') return true;
    return false;
  }
}
