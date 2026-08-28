// Runs "Suggest a look" photo classification off the main thread.
//
// `postcard-wasm-vibe` and its ~10MB model file are `import()`/fetched
// lazily, only the first time a message actually arrives here -- an
// ordinary editing session never downloads either. Ported from
// budget_planner's identical `ocrWorker.js` pattern, including its two
// hard-won lessons: this crate's `suggest_vibe` binding is a synchronous
// Rust call, so it runs in a Worker rather than on the main thread (a
// real OCR scan there froze the whole tab for 20-40+ seconds; a single
// MobileNet forward pass measured much faster natively, ~60ms, but
// there's no reason to risk it blocking the UI when the Worker plumbing
// is this cheap to reuse); and the model path is resolved against this
// worker's own runtime location (`self.location.href`), not
// `import.meta.url` or a root-relative path, because GitHub Pages serves
// this app from a subpath (`/postcard_maker/`, not domain root) and
// webpack treats `new URL(literal, import.meta.url)` as a bundled asset
// import rather than a reference to a file `CopyWebpackPlugin` copies
// from `static/`.
const MODEL_PATH = new URL('vibe/mobilenetv3-small.onnx', self.location.href);

let wasmPromise = null;
let modelBytesPromise = null;

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
// the same session shouldn't re-download the model.
function loadModel() {
  if (!modelBytesPromise) {
    modelBytesPromise = fetch(MODEL_PATH).then(async (res) => {
      if (!res.ok) throw new Error(`could not fetch ${MODEL_PATH}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    });
  }
  return modelBytesPromise;
}

self.onmessage = async (event) => {
  const { id, photoBytes } = event.data;
  try {
    const [wasm, model] = await Promise.all([loadWasm(), loadModel()]);
    const result = wasm.suggest_vibe(model, photoBytes);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
  }
};
