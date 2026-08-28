# Working in this repo

Third tool in the meifio line, after `mortgage_calculator` and
`budget_planner`. Same promise: Rust core -> WASM -> static browser page,
no server, no account, nothing uploaded. What it does here: take or choose
a photo, crop it to a postcard template, apply a filter, add a greeting
message and stickers, then share (email) or save the result.

## The rule: real algorithms live in Rust; presentation lives in JS

This is a photo editor, not a budgeting app, so "business logic" means
something more specific here than in the other two tools. Applying it:

> Business logic is anything where a second implementation could give a
> different answer.

| Layer | Owns |
|---|---|
| `postcard-core` | Shared vocabulary: `Aspect`, `Filter`/`Adjustments`, `ExportFormat`, `CollageLayout`/`CollageSlot`, geometry, the `Message` error convention |
| `postcard-calc` | Crop geometry, every filter's pixel math, template/collage layout facts, the decode -> crop -> filter -> resize -> encode pipeline, `vibe` (photo classification, feature-gated) |
| `postcard-wasm` | Bridge only. Parse `JsValue`/`&[u8]`, call `postcard-calc`, serialize back |
| `postcard-wasm-vibe` | Same bridge rule, lazily-loaded (see "Suggest a look" below) |
| `www/` | Camera/file capture, live preview (CSS, not wasm), text/sticker/doodle placement, the one-shot canvas bake at export, i18n |

**Rust owns:** crop/resize geometry against a template's aspect ratio,
every filter's pixel transform (grayscale/sepia/vintage,
brightness/contrast/saturation), the compositing order, and JPEG/PNG
encoding. All of it is real per-pixel arithmetic on a multi-megapixel
photo — exactly where wasm speed matters and where a second, drifting
implementation would be a real bug.

**JS/DOM owns, deliberately:**
- **The live editor preview is CSS, not a canvas redraw.** Pan/zoom is
  `background-position`/`background-size` math on the frame div
  (`cropGesture.js`, `PostcardCanvas.jsx`); the filter/adjustment preview
  is a CSS `filter:` string (`previewFilter.js`) that *approximates*
  the Rust math, not a second implementation of it — it exists purely so
  a slider drag doesn't round-trip through wasm every frame. The real
  pixels only ever come from `postcard-calc` at export. If the preview
  and the exported result ever look meaningfully different, fix the CSS
  approximation to track the Rust filter more closely; do not "fix" it by
  moving the live preview into wasm.
- **Text rendering is `<canvas>` `fillText`, never Rust.** Embedding a
  CJK-capable font (Simplified + Traditional Chinese) to rasterize the
  greeting message in Rust would cost 8-10MB+ — flatly incompatible with
  this app's small-footprint goal — while the browser's own font stack
  already shapes CJK correctly for free. See `export.js` and
  `wordwrap.js` (word-wraps Latin text, character-wraps CJK text, since
  CJK has no spaces to break on).
- **Sticker placement and the final flatten are `<canvas>` too**
  (`export.js`): draw the Rust-filtered bitmap as the base layer, then
  text, then stickers, then `canvas.toBlob()`. `postcard-wasm`'s contract
  stays "pixels in, filtered pixels out."
- **"Auto" text color (`autoTextColor.js`) is genuine WCAG contrast math,
  and it still lives in JS.** It picks whichever of the four color
  swatches contrasts most strongly against the photo behind the message
  box — a real algorithm, not copy, so by the letter of the rule above it
  might look like `postcard-calc`'s job. It stays in JS because the input
  it needs (already-composited pixels, or a live CSS-filtered
  approximation of them) only exists on a `<canvas>`/`<img>` at the exact
  point text is about to be drawn — the same boundary as text rendering
  and sticker placement just above, not a new exception to it. Two
  callers, one shared pure-math core: `export.js`'s `drawMessage` samples
  the *real* composited canvas (exact, since the true pixels are already
  there); `PostcardOverlay.jsx`'s live preview can only approximate,
  same "preview approximates, export is authoritative" split as the CSS
  filter. `CollageEditor.jsx` shares that same overlay with no single
  photo to sample while editing, so its live preview falls back to a
  fixed color — `export.js`'s `renderCollage` still resolves 'auto'
  exactly at export regardless, since it samples the real canvas the
  same way `renderPostcard` does.

### A real, non-obvious UX interaction

A decorative Latin-only display font offered in the text tool silently
falls back to a system font for any CJK characters typed into the same
message, producing a mismatched look mid-word. `fonts.js`'s
`containsCjk`/`effectiveFont` detect this and force the plain system font
whenever the message contains CJK — `TextPanel.jsx` disables the
decorative button and shows why, rather than letting the mismatch happen
silently. Don't remove this guard to "simplify" the font picker.

## Persistence is plain `indexedDB`, not a Rust/wasm crate

Unlike `budget_planner`'s `budget-ports`/`budget-ext-redb` (structured,
queryable financial records across seven collections), the postcard draft
is **one opaque blob**: a photo plus a handful of scalar settings, saved
and loaded whole, never queried. That has no calculation for
`postcard-calc` to own — it's the same "reading localStorage/FileReader"
host-layer carve-out `budget_planner`'s own CLAUDE.md already draws,
just against IndexedDB instead of `localStorage` because a photo can be
several megabytes. See `draftStore.js`. Don't add a Rust persistence
crate here unless the draft shape grows real structure (e.g. a
multi-draft gallery with queries) — for a single opaque blob it would be
pure overhead on the wasm bundle.

## "Suggest a look" -- the one on-device ML feature, and why it's shaped this way

`postcard-wasm-vibe` classifies a photo against **MobileNetV3-Small,
trained on ImageNet-1000** (BSD-3-Clause, torchvision lineage —
`www/static/vibe/mobilenetv3-small.onnx`, exported from
`torchvision.models.mobilenet_v3_small(weights=IMAGENET1K_V1)`, opset 17)
via `rten` — the same pure-Rust ONNX runtime `budget_planner` already
proved out for OCR, reused here for a plain classifier. Real, measured
facts, not estimates:

- **Model file: 10.18MB** (float32, no quantization attempted yet —
  quantizing needs its own calibration pipeline, not a free flag; revisit
  only if the download actually proves to be a problem in practice).
- **`postcard-wasm-vibe`'s own wasm: ~2.22MB raw / ~647KB gzipped**
  (`rten` + `rayon`, wasm32+SIMD).
- **Both are lazy** — `www/src/vibeWorker.js` only `import()`s the wasm
  and `fetch()`es the model the first time "Suggest a look" is tapped,
  confirmed in-browser via the Network panel showing zero requests for
  either on an ordinary page load. Never automatic, same as OCR's own
  precedent in the sibling tool.
- **Runs in a Web Worker**, not the main thread, even though a single
  224×224 forward pass measured only ~60ms natively — OCR's own
  synchronous-call-froze-the-tab lesson was cheap enough to preempt here
  that it wasn't worth risking, not because this was observed to be slow.
- **A real finding, not assumed going in**: ImageNet is an *object*
  dataset, not a *scene* dataset — no "sunset" or "night" class exists at
  all. `postcard-calc::vibe`'s `Vibe` enum (Beach, Mountain, Water,
  Architecture, Winter, Food, Pet) reflects what this specific model can
  actually see, curated by hand against the real class list — see that
  module's own doc comment before ever expanding the category set.
  `IMAGENET_CLASS_TO_VIBE` was widened once already (~37 entries to
  ~120) after early real-world use turned up too many "no suggestion"
  results — every index was checked against the canonical class list's
  actual label before merging (a common, easy-to-make mistake here is a
  transcribed index that's off by one), and `Food` ended up by far the
  largest list, a real reflection of how fruit/vegetable/dish-dense the
  dataset is, not an oversight. `no_curated_index_appears_twice` (Rust
  test) guards against a copy-paste duplicate at this size, but does not
  and cannot check that a label's comment actually matches its index --
  re-verify against the canonical list by hand for any future addition.
- **Multiple candidates, not one verdict.** `classify_top_vibes` (Rust)
  returns up to 3 *distinct* vibes ranked by confidence, deduped across
  the many ImageNet classes that map to the same vibe (six separate
  beach-adjacent classes, for instance). `vibeSuggestions.js` then fans
  each matched vibe out to its own primary + alternate look (curation,
  not classification, so it stays in the host layer), giving
  `VibePanel.jsx` a flat candidate pool: a few shown at once, "Try other
  ideas" rotates a window over the rest. `classify_vibe` (single best
  guess) is now a one-line wrapper over `classify_top_vibes(_, 1)` kept
  for callers that only want one.
- **Which look ranks first depends on the photo, not just its `Vibe`.**
  Early feedback: two very differently-toned photos of the same vibe (a
  blown-out bright beach shot vs. a hazy flat one) always got the exact
  same top suggestion, which read as a dumb fixed lookup rather than
  something tailored. `photoTone.js` samples a cheap 32×32 downscale of
  the *original* photo bytes (independent of whatever crop/filter is
  currently applied — "what the photo actually looks like" is the
  honest signal, not whatever the user already picked) for overall
  brightness/saturation; `vibeSuggestions.js`'s `scoreForTone` then
  reorders each matched vibe's own 3 looks by fit before flattening them
  — grayscale suits a photo already bright and colorful enough to carry
  losing its hue, vintage suits one that's already vivid enough to
  afford being toned down, sepia suits one that's dim or washed out,
  keeping the original suits one that's already balanced. Still no new
  model or Rust: this is host-layer curation logic, same boundary as the
  rest of this feature's copy.
- **The caption suggestion is picked, not generated.** A curated
  greeting-message starter per `Vibe` (`vibeCaptions.js`, one hand-written
  sentence per category, translated into all three languages) — tapping
  "Use this message" drops it straight into the message textarea. This is
  deliberately *not* free-form text generation: a model capable of really
  writing a sentence needs 600MB-1.3GB+ (researched and ruled out when
  this feature was first built), and this app has no server to call out
  to instead. A small curated phrase bank keyed off real photo content is
  the offline-compatible middle ground.
- **License disclosure**: the model's BSD-3-Clause attribution lives in
  `www/static/privacy.html`'s "Third-party models" section and this
  repo's README — keep both in sync if the model is ever swapped.

## Doodle, collage and the postcard back side

- **Doodle** (`DoodleLayer.jsx`): strokes are normalized (0..1) point
  lists, same convention as sticker `x`/`y`, drawn identically in the live
  preview and in `export.js`'s bake (`drawStrokes` mirrors
  `DoodleLayer`'s own canvas code on purpose — keep them in sync if either
  changes). A `drawMode` toggle exists so pen strokes and pan/sticker-drag
  never compete for the same pointer events on the same frame.
- **Collage** (`CollageEditor.jsx`, `collageReducer.js`) is a **parallel
  flow to the single-photo one, not a generalization of it** — unifying
  "one photo" into "a collage of one" was rejected as real regression risk
  on the already-shipped, tested single-photo path for no benefit. A
  collage slot's own on-card pixel ratio is virtually never one of the
  three named `Aspect` values (e.g. a 0.7-width "big" slot), which is why
  `postcard_calc::crop::suggest_for_ratio`/`suggest_crop_ratio` exist
  alongside the named-aspect versions rather than replacing them.
  Message/stickers/doodle are shared across the whole collage, never
  per-slot.
- **Back side** (`renderBackSide` in `export.js`) is pure host-layer
  canvas drawing — no photo, so no Rust involved at all. Optional and off
  by default; when on, `share.js`'s `shareFiles`/`saveFiles` carry two
  files, relying on `navigator.share`'s native multi-file support rather
  than anything new.

## Known v1 limitations (parked, not bugs)

- **HEIC photos (iPhone's default format) uploaded via file picker won't
  decode in `<canvas>`/`<img>` on non-Safari desktop browsers.** No
  practical pure-Rust/wasm HEIC decoder exists, and pulling in a JS HEIC
  library conflicts with the Rust-first preference for what is a rare
  path. Not a dead end: the in-page live camera (`CameraCapture.jsx`)
  always yields JPEG via `canvas.toBlob` regardless of source format, and
  Safari decodes HEIC natively. `Intro.jsx` says so (`intro.heicHint`).
- **No sticker rotation, only move + the palette's default scale.**
  Move-only covers "decorate the postcard" well; rotation is a real chunk
  of drag-math UI for comparatively little payoff. Revisit if asked for.
- **One in-progress draft, no multi-draft gallery.** `draftStore.js`'s
  schema (one fixed key) would need to change first.
- **Simplified/Traditional Chinese copy is mine, not a native speaker's**
  (same caveat `mortgage_calculator`'s CLAUDE.md carries for its
  regulatory copy) — wants a native-speaker pass before this ships
  broadly.
- **Collage drafts aren't autosaved.** Only the single-photo flow persists
  to `draftStore.js`; starting a collage and reloading loses it. Same
  category of scope cut as the single-draft-only limitation above, just
  narrower.

## Verification traps specific to this repo

- **The browser and `image` (Rust) can disagree about a photo's own
  width/height — always decode through `pipeline::decode_oriented`, never
  a bare `ImageReader::decode()`/`image::load_from_memory`.** A phone
  photo commonly carries an EXIF orientation tag; browsers auto-rotate
  for display (`<img>.naturalWidth`/`naturalHeight` — what the crop UI
  drags against — reflect that correction), but `image`'s own decode does
  not apply it. Skip the correction and a 90/270-degree-rotated photo
  decodes here with width and height *swapped* relative to what the
  browser showed, silently turning a perfectly valid crop into
  `CropOutOfBounds` — a real bug that shipped and was reported before
  being caught (`pipeline.rs`'s own tests hand-splice a real EXIF
  orientation tag into a fixture JPEG to actually exercise this, not just
  assert the API compiles). `vibe::run_inference` shares the same helper
  for the same reason: classifying a sideways photo would otherwise
  undermine "Suggest a look" for the same common case.
- **`npm run build` does not rebuild the wasm.** It's webpack-only; run
  `npm run build:wasm` first, or you're testing the previous `pkg/`.
- **`cargo check --workspace`/`cargo test --workspace` never proves the
  wasm target compiles.** `postcard-wasm` depends on `image`, which has
  real platform-specific code paths; always also run `cargo build -p
  postcard-wasm --target wasm32-unknown-unknown --release` before
  trusting a change that touches `postcard-calc` or `postcard-wasm`. This
  was verified once already (854KB raw / ~492KB via wasm-pack / ~187KB
  gzipped) — if a change balloons that, look for a new dependency pulling
  in something heavy before assuming it's fine.
- **`wasm-pack` wants a `LICENSE` file at the workspace root** to stop
  warning on every build (it doesn't fail without one, just nags) — kept
  in sync with `Cargo.toml`'s `license = "MIT"`.
- **`wasm-opt` is off deliberately**, same measured tradeoff recorded in
  the other two tools' `*-wasm/Cargo.toml`. Don't "fix" it here either.
- **The live preview and the exported image are never pixel-identical.**
  CSS `filter:` (preview) and the Rust filter math (export) are two
  different renderers by design — see the boundary section above. A
  slight look difference between them is expected, not a bug; a *large*
  difference (e.g. vintage looking sepia live but doing nothing at
  export) is a real bug worth checking with a pixel sample
  (`ctx.getImageData`), not by eyeballing a screenshot — the vintage
  transform's shift is real but subtle on already-saturated source
  photos and easy to misjudge by eye alone.
- **`cargo build -p postcard-wasm-vibe --target wasm32-unknown-unknown`
  is its own separate check** from `postcard-wasm`'s — two independent
  wasm-pack builds (`npm run build:wasm:core` / `build:wasm:vibe`), and a
  green build of one proves nothing about the other, same reasoning as
  budget_planner's three-crate wasm32 CI job.
- **A `ResizeObserver` that resizes the element it's observing, inside its
  own callback, can trigger "ResizeObserver loop completed with
  undelivered notifications"** — spec-legal, but webpack's dev overlay
  treats it as an uncaught error and blocks the page. `DoodleLayer.jsx`
  defers the actual canvas resize to `requestAnimationFrame` to break the
  synchronous loop; keep that pattern if another component ever needs to
  resize a canvas to match its container.

## Landing changes

**Never push to a remote, or run `gh repo create`, without the user asking
in that exact moment** — see the other two tools' CLAUDE.md for why this
is a standing rule, not a one-time caution. Build, commit and test
locally; ask before the first push.
