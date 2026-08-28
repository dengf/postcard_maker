// Host-side wrapper around `vibeWorker.js` -- see that file for why this
// runs in a Worker at all. Nothing here decides what "beach" or "pet"
// means; that's `postcard_calc::vibe`'s job. This module is purely the
// browser plumbing to get photo bytes to the worker and a result back.

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./vibeWorker.js', import.meta.url));
  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data;
    const call = pending.get(id);
    if (!call) return;
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
 * Classifies `photoBytes` (the original encoded photo, JPEG/PNG -- the
 * same bytes already held for `process_photo`) and resolves to
 * `{ vibe, confidence, error, error_message }`. `vibe`/`confidence` are
 * `null`/`undefined` when the model has no suggestion worth showing, not
 * necessarily an error -- see `postcard_calc::vibe::classify_vibe`.
 */
export function suggestVibe(photoBytes) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // Transferred, not copied -- `photoBytes` is a full-resolution photo
    // (a few MB), and structured-clone would otherwise duplicate it
    // across the worker boundary. The caller's own copy is detached
    // after this call; see `App.jsx`, which always has the original
    // `photo.bytes` to hand a fresh transferable view of if needed again.
    const transferable = photoBytes.slice().buffer;
    getWorker().postMessage({ id, photoBytes: new Uint8Array(transferable) }, [transferable]);
  });
}
