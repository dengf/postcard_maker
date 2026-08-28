// Host-side wrapper around `captionWorker.js` -- see that file and
// `postcard-wasm-caption`'s own doc comment for why this runs in its own
// Worker, entirely separate from `vibe.js`'s. Nothing here decides what
// the caption says; that's `postcard_calc::caption`'s job. This module
// is purely the browser plumbing to get photo bytes to the worker and a
// result back, mirroring `vibe.js`'s own shape.

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./captionWorker.js', import.meta.url));
  worker.onmessage = (event) => {
    const { id, ok, result, error, progress } = event.data;
    const call = pending.get(id);
    if (!call) return;
    if (progress !== undefined) {
      call.onProgress?.(progress);
      return; // an interim update, not the final resolution
    }
    pending.delete(id);
    if (ok) call.resolve(result);
    else call.reject(new Error(error));
  };
  worker.onerror = (event) => {
    for (const call of pending.values()) call.reject(new Error(event.message));
    pending.clear();
  };
  return worker;
}

/**
 * Generates a real caption for `photoBytes` (the original encoded
 * photo, JPEG/PNG) and resolves to `{ caption, error, error_message }`.
 * `caption` is `null` on failure, never an empty string on success.
 *
 * `onProgress`, if given, is called with a 0..1 fraction combined across
 * all four files (~139MB total) this feature downloads on first use --
 * see `captionWorker.js`'s own doc comment for why this is one combined
 * fraction rather than four separate ones. This download is large enough
 * that showing real progress isn't a nicety here, it's necessary.
 */
export function generateCaption(photoBytes, onProgress) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    // Transferred, not copied -- see `vibe.js`'s identical reasoning.
    const transferable = photoBytes.slice().buffer;
    getWorker().postMessage({ id, photoBytes: new Uint8Array(transferable) }, [transferable]);
  });
}
