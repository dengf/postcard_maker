// Runs on-device photo captioning off the main thread. See
// `postcard-wasm-caption`'s own doc comment for why this is a wholly
// separate crate/worker from `vibeWorker.js` rather than folded into it:
// this is a genuinely large (~139MB across three ONNX models plus a
// tokenizer) and architecturally different capability (multi-step
// autoregressive generation, not a single forward pass), triggered by
// its own explicit UI action, never downloaded alongside "Suggest a
// look". Same lazy-loading and subpath-resolution rationale as
// `vibeWorker.js` otherwise -- see that file's own doc comment.

const VISION_MODEL_PATH = new URL('caption/vision_encoder.onnx', self.location.href);
const EMBED_MODEL_PATH = new URL('caption/embed_tokens.onnx', self.location.href);
const DECODER_MODEL_PATH = new URL('caption/decoder_model_merged.onnx', self.location.href);
const TOKENIZER_PATH = new URL('caption/tokenizer.json', self.location.href);

let wasmPromise = null;
let assetsPromise = null;

function loadWasm() {
  if (!wasmPromise) {
    wasmPromise = import('../pkg-caption').then(async (wasm) => {
      if (wasm.default) await wasm.default();
      return wasm;
    });
  }
  return wasmPromise;
}

/**
 * Streams one file, reporting bytes received via `onBytes` -- the raw
 * building block `loadAssets` combines across all four files into one
 * overall fraction, since reporting each file's own progress separately
 * would be four disjointed bars for what a user experiences as a single
 * wait.
 */
async function fetchWithProgress(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url}: ${res.status}`);
  const total = Number(res.headers.get('Content-Length'));
  if (!res.body || !total) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    onBytes(bytes.length, bytes.length);
    return bytes;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- sequential by nature,
    // same as vibeWorker.js's identical loop.
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// Fetched once per worker lifetime, same as vibeWorker.js's models.
// `onProgress` gets one combined 0..1 fraction across all four files'
// bytes, not four separate ones -- see `fetchWithProgress`'s own doc
// comment.
function loadAssets(onProgress) {
  if (!assetsPromise) {
    const files = [
      { url: VISION_MODEL_PATH, received: 0, total: 1 },
      { url: EMBED_MODEL_PATH, received: 0, total: 1 },
      { url: DECODER_MODEL_PATH, received: 0, total: 1 },
      { url: TOKENIZER_PATH, received: 0, total: 1 },
    ];
    const reportCombined = () => {
      const received = files.reduce((sum, f) => sum + f.received, 0);
      const total = files.reduce((sum, f) => sum + f.total, 0);
      onProgress?.(received / total);
    };
    assetsPromise = Promise.all(
      files.map((f) =>
        fetchWithProgress(f.url, (received, total) => {
          f.received = received;
          f.total = total;
          reportCombined();
        }),
      ),
    ).then(([visionModel, embedModel, decoderModel, tokenizer]) => ({
      visionModel,
      embedModel,
      decoderModel,
      tokenizer,
    }));
  }
  return assetsPromise;
}

self.onmessage = async (event) => {
  const { id, photoBytes } = event.data;
  try {
    const [wasm, assets] = await Promise.all([loadWasm(), loadAssets((fraction) => self.postMessage({ id, progress: fraction }))]);
    const result = wasm.generate_caption(assets.visionModel, assets.embedModel, assets.decoderModel, assets.tokenizer, photoBytes);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
  }
};
