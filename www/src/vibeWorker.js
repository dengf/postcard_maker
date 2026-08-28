// Runs "Suggest a look" photo classification off the main thread.
//
// `postcard-wasm-vibe` and its model files are `import()`/fetched
// lazily, only the first time a message actually arrives here -- an
// ordinary editing session never downloads either. Ported from
// budget_planner's identical `ocrWorker.js` pattern, including its two
// hard-won lessons: this crate's bindings are synchronous Rust calls, so
// they run in a Worker rather than on the main thread (a real OCR scan
// there froze the whole tab for 20-40+ seconds; a single MobileNet
// forward pass measured much faster natively, ~60ms, but there's no
// reason to risk it blocking the UI when the Worker plumbing is this
// cheap to reuse); and model paths are resolved against this worker's
// own runtime location (`self.location.href`), not `import.meta.url` or
// a root-relative path, because GitHub Pages serves this app from a
// subpath (`/postcard_maker/`, not domain root) and webpack treats `new
// URL(literal, import.meta.url)` as a bundled asset import rather than a
// reference to a file `CopyWebpackPlugin` copies from `static/`.
const MODEL_PATH = new URL('vibe/mobilenetv3-small.onnx', self.location.href);
// ~1MB, small enough next to the ~10MB vibe model above that it doesn't
// get its own progress tracking -- see `loadFaceModel`.
const FACE_MODEL_PATH = new URL('face/ultra-light-face-detector.onnx', self.location.href);

let wasmPromise = null;
let modelBytesPromise = null;
let faceModelBytesPromise = null;

function loadWasm() {
  if (!wasmPromise) {
    wasmPromise = import('../pkg-vibe').then(async (wasm) => {
      if (wasm.default) await wasm.default();
      return wasm;
    });
  }
  return wasmPromise;
}

// Fetched once per worker lifetime -- a second "Suggest a look" tap in
// the same session shouldn't re-download the model. `onProgress` only
// ever fires for whichever call is in flight when the real download
// happens; a tap that arrives after the model's already cached resolves
// straight away with nothing to report, which is correct -- there's
// nothing left to download.
function loadModel(onProgress) {
  if (!modelBytesPromise) {
    modelBytesPromise = fetch(MODEL_PATH).then(async (res) => {
      if (!res.ok) throw new Error(`could not fetch ${MODEL_PATH}: ${res.status}`);
      const total = Number(res.headers.get('Content-Length'));
      // No streaming body, or the server didn't send a length (e.g. a
      // compressed response) -- fall back to an all-at-once download
      // with no progress, same as before this existed.
      if (!res.body || !total) {
        return new Uint8Array(await res.arrayBuffer());
      }
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- inherently
        // sequential: each chunk depends on the stream position left by
        // the last.
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress?.(received / total);
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    });
  }
  return modelBytesPromise;
}

// Small enough (~1MB) that a plain all-at-once fetch is fine -- no
// streaming/progress tracking, unlike `loadModel` above. Fetched once
// per worker lifetime, same caching rationale.
function loadFaceModel() {
  if (!faceModelBytesPromise) {
    faceModelBytesPromise = fetch(FACE_MODEL_PATH).then(async (res) => {
      if (!res.ok) throw new Error(`could not fetch ${FACE_MODEL_PATH}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    });
  }
  return faceModelBytesPromise;
}

self.onmessage = async (event) => {
  const { id, photoBytes } = event.data;
  try {
    const wasm = await loadWasm();
    // The face model/count is a best-effort supplement (see
    // exposureSuggestion.js's sibling reasoning in VibePanel.jsx) --
    // failing to load or run it should never take down the vibe
    // classification it rides alongside, so its own promise is awaited
    // and caught independently rather than joined into the same
    // `Promise.all` as the required vibe model.
    const [model, faceModel] = await Promise.all([
      loadModel((fraction) => self.postMessage({ id, progress: fraction })),
      loadFaceModel().catch(() => null),
    ]);

    const result = wasm.suggest_vibe(model, photoBytes);

    let faceCount = 0;
    if (faceModel) {
      try {
        const faceResult = wasm.count_faces(faceModel, photoBytes);
        faceCount = faceResult?.faceCount ?? 0;
      } catch {
        faceCount = 0;
      }
    }

    self.postMessage({ id, ok: true, result: { ...result, faceCount } });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
  }
};
