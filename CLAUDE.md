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
- **'auto' is the *default*, in both reducers — don't set a literal
  back.** It shipped as a literal `#ffffff` at first, which meant the
  contrast math above only ran for people who went looking for it. A
  usage-flow review measured the result on an ordinary bright photo:
  white over pale sand came to **1.56:1**, under WCAG's 3:1 floor for
  large text, where 'auto' resolved the same card to ~**10.9:1**. The
  first postcard someone makes is the one they send, so the safe pick
  has to be the one they get without asking. `postcardReducer`'s and
  `collageReducer`'s initial state and the `OPEN_PHOTO` restore fallback
  all say `'auto'`, and `postcardReducer.test.js` pins it so a
  regression can't ship quietly. A literal stays one tap away in
  `TextPanel` for anyone who wants to override it.

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

**One record holds either kind of card.** Collages went unsaved at first
(listed as a scope cut under "Known v1 limitations"), which is exactly
the kind of assumption a user finds: a collage is *more* work to rebuild
than a single photo, not less. The record is told apart by `kind`: a
collage writes `'collage'` and keeps its photos in `slots`, while the
single-photo flow keeps writing the shape it always did, with one
`photoBlob` and no `kind` at all — so records written before any of this
read back as single-photo drafts with no migration. That's why the
discriminator is `isCollageDraft`, asking "is it a collage", not "is it a
postcard". Things worth not re-deriving:

- **The collage autosave is guarded on at least one slot being filled.**
  There is one record, so saving an empty collage is a *destructive*
  act — without the guard, merely tapping "Make a collage" would wipe an
  unfinished single-photo draft before anyone had added anything.
- **`CollageEditor` restores itself, App just hands it the record.**
  Turning a stored blob back into a slot needs the layout's own geometry
  and a wasm call, neither of which App has. `SET_LAYOUT` runs first (it
  decides how many slots there are), then the hydration effect decodes
  each blob and dispatches `RESTORE_DRAFT`.
- **Base crops are recomputed on restore, never stored.** They're derived
  from a slot's share of the card, which the layout already knows; a
  stored copy is what goes stale when a layout's proportions change. The
  saved `crop`/`zoom` are restored on top, same as the single-photo flow.
- **A slot whose blob no longer decodes is left empty**, not fatal —
  three photos back beats a toast and an empty card.
- **Collage "Start over" now confirms and clears the draft.** With the
  draft in place, leaving it behind would put a card the user explicitly
  threw away back in the resume banner on the next visit. An empty
  collage skips the question, which is why `onExit` takes whether any
  slot is filled.
- **Both editors have a Back, and it is not Start over.** Start over was
  the only control that reached the intro, and it asks to throw the card
  away to get there — so "go back and look at the front page" meant
  either losing the work or using the browser's own Back button, which
  is what a user reported. Back keeps everything: it writes the draft
  **on the spot** rather than waiting out the 800ms debounce (leaving
  must not cost the last keystroke — that's why `postcardDraft()` and
  `collageDraft()` are named functions and not inline in their autosave
  effects), then App re-offers the card through `showDraftBanner()`.
  Reaching the intro again is what made that loader worth extracting;
  before this it only ever ran at startup.
- **The single-photo autosave never wrote `messagePosition`**, though
  `OPEN_PHOTO` had always restored it — so a greeting dragged off centre
  came back centred. Fixed in passing when the payload moved into
  `postcardDraft()`.

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
- **The exposure suggestion (`exposureSuggestion.js`) is the one part of
  "Suggest a look" that works on *any* photo, including one the vibe
  classifier structurally can't help with.** ImageNet has almost no
  "person" classes at all, so a portrait or group photo -- probably the
  majority of real postcard photos -- will rarely match any `Vibe` no
  matter how wide `IMAGENET_CLASS_TO_VIBE` gets; widening that table
  further was never going to fix this specific gap. `exposureSuggestion`
  needs no object recognition, just `photoTone.js`'s own brightness/
  contrast/saturation read (contrast is a new addition there too: std
  deviation of per-pixel luminance, a cheap proxy for "how flat does this
  photo look"), so it still has something to offer -- "this looks a bit
  dark, brighten it up?" -- even when zero vibes match. `VibePanel.jsx`
  appends it to the candidate pool whenever it fires, and it's the reason
  the classifier finding nothing no longer means the panel has nothing
  to show. Thresholds are a reasoned starting point, not tuned against a
  labeled photo set (none exists) -- same honesty this file already
  applies to `CONFIDENCE_FLOOR`.
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

## The face-counting model -- covering what the vibe classifier structurally can't

Even a wide `IMAGENET_CLASS_TO_VIBE` table can't help a photo of people:
ImageNet has almost no "person" classes at all, so a portrait or group
photo -- likely the majority of real postcard photos -- rarely matches
any `Vibe` no matter how much curation goes into that table. Widening it
further (already done once) was never going to close this specific gap.
A person/social-relationship-inference model ("is this family, friends,
a couple?") was researched and explicitly ruled out: it's an active,
*unsolved* computer-vision research problem (see e.g. arXiv:1812.05917),
no pretrained deployable model exists for it, and a shipped app
confidently guessing wrong about people's relationships would be a worse
failure than saying nothing.

What's real and shipped instead: `postcard_calc::face::count_faces`
counts face-shaped regions -- not identity, not expression, not age or
gender, nothing biometric beyond "a face-shaped region is here" -- via
[Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB)
(`version-slim-320_simplified.onnx`, **MIT**, ~1MB — smaller than the
vibe model). Same crate, same `rten` runtime, same lazy-loaded
`postcard-wasm-vibe`, downloaded alongside the vibe model on the same
"Suggest a look" tap (see `vibeWorker.js`) rather than as a third
separate lazy-load step.

- **A real finding, verified with a standalone spike before writing any
  of the shipped code**: this model's ONNX export does *not* bake in box
  decoding. Its raw output is SSD-style anchor-offset regressions, not
  ready-to-use coordinates -- treating them as normalized coordinates
  produces nonsense (boxes far outside the photo, dozens of phantom faces
  on a 4-person photo). The correct decode (anchor-box generation +
  center/size-variance offset formula) was ported from the reference
  repo's actual `box_utils.py`/`fd_config.py`, not guessed, and verified
  against real photos with known face counts before being trusted: exact
  matches on a 4-person and a 5-person photo, a plausible 47 on a
  ~50-person crowd photo.
- **Two tiers by face count, not one** (`www/src/groupSuggestion.js`): 2+
  faces gets a "you're together" look and caption; exactly 1 face gets its
  own "solo shot" look and caption, distinct in tone (no "we"/"together"
  phrasing for a photo of one person). Originally this only handled 2+,
  which meant a solo portrait -- one person, on their own trip, arguably
  the single most common postcard photo -- fell through every path with
  nothing to offer: not a group, and the vibe classifier has almost no
  "person" classes to match against either. A real, reported gap, not a
  hypothetical one; closed by adding the solo tier rather than lowering
  the group threshold, since "you're together" literally doesn't parse
  for a photo of one person. Neither tier guesses *who* the people are to
  each other, same reasoning as before. This mirrors `exposureSuggestion.
  js`'s role exactly -- the two things in "Suggest a look" that still have
  something to offer when the vibe classifier finds nothing, neither
  needing object recognition (one reads pixel statistics, the other reads
  a face count).
- **Face-detection failures are silent, not surfaced**, unlike vibe
  classification failures: if the model fails to load or run for any
  reason, `vibeWorker.js` treats it as "0 faces" and the rest of "Suggest
  a look" proceeds normally. It's a best-effort supplement riding along
  with the required vibe download, not a required part of the result.

## "Write a caption" was tried and removed -- real findings, for whoever proposes it again

Built and shipped once: a real generated sentence per photo via
[SmolVLM-256M-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct)
(Apache-2.0) -- three ONNX graphs (vision encoder, token embedder, 30-layer
KV-cached decoder) run through `rten`, its own crate
(`postcard-wasm-caption`) and Cargo feature to keep the ~139MB download
(confirmed to barely gzip-compress -- quantized weights are already dense
binary data) out of everyone else's bundle, gated behind its own explicit
button. The engineering worked end-to-end and was verified in the browser,
but the actual output quality wasn't good enough after trying it for real
-- pulled at the user's call, not a technical failure. If this is
revisited, the real technical findings worth not re-deriving: `rten`
genuinely can run a multi-step autoregressive decoder (not just
single-pass classifiers), the exact prompt/image-token layout has to be
hand-assembled from `transformers`' own `SmolVLMProcessor` source (the
ONNX export carries no chat-template logic), and a 256M-parameter model's
tone-following is weak -- it reliably describes what's in the photo but
doesn't reliably sound like a postcard just because the prompt asks. That
last point is likely *why* the quality fell short -- a bigger model would
cost considerably more download weight, which is the real tradeoff any
future attempt has to weigh, not a prompt-tuning problem.

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
- **Changing the photo is one feature across both editors, and it did not
  exist at first.** A photo was a one-way door: the collage's only file
  input lived in `EmptySlot`, which unmounts the moment `slot.photo` is
  set, and the single-photo card had no replace control at all — so the
  only way back was "Start over", which throws away the whole card rather
  than the one photo. Both now get the same `ReplacePhotoButton` chip
  plus a **double-tap on the photo itself**, and the pieces that make
  that work are worth not re-deriving:
  - **Each editor owns one hidden `PhotoPickerInput`** and both paths
    click it. The alternative — a file input inside each chip — breaks
    down the moment a second way in exists, because the collage's chip
    renders on the *active* slot only while a double-tap works on any
    filled slot.
  - **Double-tap is detected from the pointer stream (`doubleTap.js`),
    not `dblclick`.** These surfaces set `touch-action: none` and capture
    the pointer, and a *drag* that ends near where it started must not
    read as a tap — `travel` is the furthest the pointer ever got from
    the down point, not the down-to-up distance, or a pan out and back
    would swap the photo. A firing tap clears the log so an impatient
    triple tap opens the picker once.
  - **The old object URL is revoked only after the new photo decodes**,
    in both flows. Revoke first and an undecodable pick blanks a card
    that still had a good photo on it. (`openPhoto` revokes up front,
    which is fine *there* — nothing is on screen yet to break.)
  - **`REPLACE_PHOTO` is a separate action from `OPEN_PHOTO`**, because
    `OPEN_PHOTO` resets to `initialState`: reusing it would silently
    throw away the message, stickers, doodle, back side and template
    along with the photo. What does reset is what belonged to the old
    photo — crop, zoom, filter, adjustments — the same line
    `collageReducer`'s `OPEN_SLOT_PHOTO` already drew for a slot.
  - **The chip sits top *left*.** `geometry.stampBox` puts the dashed
    stamp guide in the card's top right, where a chip lands on top of it.
  - `collage-slot-refill.test.js` guards both controls' existence and
    `doubleTap.test.js` the gesture arithmetic; nothing in this suite
    renders components, so the first is a source-text guard.
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
  Safari decodes HEIC natively. **The app says so at the point of failure,
  not before it**: `photoFormat.js` sniffs the picked file when the
  browser's decoder rejects it and picks `err.heicUnsupported` over the
  generic `err.unreadableImage`. It used to be a standing caveat on the
  intro screen (`intro.heicHint`, now removed) — three lines of grey text
  warning everyone about a failure most never hit, and misleading for its
  own audience, since iOS decodes HEIC natively and its picker usually
  hands over JPEG anyway. If another format ever needs the same treatment,
  extend `photoFormat.js`; don't put it back on the first screen.
- **No sticker rotation, only move + the palette's default scale.**
  Move-only covers "decorate the postcard" well; rotation is a real chunk
  of drag-math UI for comparatively little payoff. Revisit if asked for.
- **One in-progress draft, no multi-draft gallery.** `draftStore.js`'s
  schema (one fixed key) would need to change first.
- **Simplified/Traditional Chinese copy is mine, not a native speaker's**
  (same caveat `mortgage_calculator`'s CLAUDE.md carries for its
  regulatory copy) — wants a native-speaker pass before this ships
  broadly.
  (Collage drafts *were* listed here as not autosaved, a scope cut that
  turned out to be one someone hits — see the persistence section above.)

**The collage editor had never actually worked in a shipped build** — see
the `template_geometry` arity entry under verification traps. It threw on
entry and rendered no slots, and nobody noticed because the resulting
toast was blank. Treat that as the standing warning about this section:
"parked, not a bug" is a claim about code someone has *run*. The collage
flow now has browser coverage exercising all three layouts and all three
shapes; keep it that way rather than trusting that it still works.

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
  budget_planner's multi-crate wasm32 CI job. Both are real CI steps in
  `.github/workflows/ci.yml`'s `wasm32` job, not just a developer habit.
- **A `ResizeObserver` that resizes the element it's observing, inside its
  own callback, can trigger "ResizeObserver loop completed with
  undelivered notifications"** — spec-legal, but webpack's dev overlay
  treats it as an uncaught error and blocks the page. `DoodleLayer.jsx`
  defers the actual canvas resize to `requestAnimationFrame` to break the
  synchronous loop; keep that pattern if another component ever needs to
  resize a canvas to match its container.
- **`.panel` is `display: flex; flex-direction: column`, so any panel
  that wants a row has to say `flex-direction: row` explicitly.** Setting
  only `display: flex` on a `.panel` child class looks right and silently
  inherits the column — the draft banner's thumbnail stacked above its
  text instead of sitting beside it until the direction was named. Same
  family as budget_planner's CSS source-order trap: the rule that bites
  is the one already there, not the one being written.
- **The theme has three tiers and only two of them are CSS blocks.**
  `main.css`'s bare `:root` is dark; the `prefers-color-scheme: light`
  media query is guarded `:root:not([data-theme='dark'])`; and
  `:root[data-theme='light']` repeats the same eleven light values for an
  explicit choice. There is deliberately no `[data-theme='dark']` block —
  dark is what bare `:root` already says, and the media query's guard is
  the entire mechanism that lets an explicit dark choice win on a
  light-OS device. A light token added to one of the two light blocks and
  not the other produces a theme that is correct only when the OS happens
  to agree. `color-scheme` follows the tokens through all three tiers so
  UA-drawn chrome (the header's `<select>` popups, scrollbars) matches;
  it needed no declaration before the picker existed, because the OS was
  always right. `index.html` carries a fourth, hand-duplicated copy of
  the same three tiers for the loading screen plus an inline pre-paint
  script — React doesn't mount until after an async wasm load, so
  anything waiting on `theme.js` would flash the wrong theme for the
  length of that load.
- **`.editor-preview-col` is `position: sticky` on phones, so anything put
  inside it is pinned for the whole session and subtracted from the room
  the controls have to scroll in.** Only the frame and its terminal
  action belong there. The collage editor had Shape and Layout in it,
  which pinned ~330px on top of the frame's own ~206px and left barely
  200px of an 812px viewport for every other panel — they arrived
  pre-squeezed between the pinned block and the fixed Share/Save bar.
  Moving those two into the controls column (where `App.jsx` has always
  kept its equivalents) took the pinned block from 537px to 258px and the
  usable band from ~200px to 481px. When adding anything to an editor's
  preview column, measure the pinned height at 375×812 first.
- **A stray `*/` or a comment reopened after it was closed silently eats
  the rule that follows it.** Inserting prose after a `*/` and closing it
  again left `.finish-jump { display: none; }` unparsed, so the phone
  layout showed a shortcut it was supposed to hide — with no error
  anywhere, and the rules *after* the bad one still applying, which makes
  it look like the selector is wrong rather than the comment. After
  editing a comment in `main.css`, assert the neighbouring rule still
  computes, don't just read the diff.
- **Calling a wasm binding with too few arguments fails with a message
  that names nothing in this codebase.** wasm-bindgen reads `.length` off
  the missing `&str`, so you get `undefined is not an object (evaluating
  'n.length')` — no file, no line, no clue. This shipped:
  `CollageEditor` called `wasmModule.template_geometry(aspectId)` when the
  binding takes `(aspect, coverage, side)`, which threw on *every* entry
  to the collage editor, before `selectLayout` could run, so the editor
  rendered zero slots and no photo could be added at all. Go through
  `photoLayout.js`'s `templateGeometry` wrapper, which is what
  `wasm-call-sites.test.js` now enforces. If another binding grows an
  argument, give it a wrapper and add it to that guard — the JS side gets
  no arity checking of its own.
- **`ErrorToast` only renders what it's given, so `setError(new Error(…))`
  used to produce a toast with a dismiss button and no words in it.** Its
  chain is now `error.code` (translated) → `error.text` (the wasm
  boundary's English fallback) → `error.message` (a plain JS `Error`) →
  `errors.unknown`. The missing `.message` rung was a live bug: an
  undecodable photo showed a blank toast and left the user on the intro
  with nothing to act on. Prefer giving a new failure a **code** so it
  translates; the raw-message rung is a safety net, not a destination.
- **`prettier --check` does not pass on this repo and is not a CI gate**
  — `.github/workflows/ci.yml`'s `www-test` job runs `npm test` only.
  ~75 files under `www/src` are already non-conformant on `main`. Match
  the surrounding style by hand; do **not** run `prettier --write` across
  the tree as part of an unrelated change, or the real diff disappears
  into a reformat. (This differs from `budget_planner`, where
  `format:check` *is* enforced — don't carry the habit across.)

## Landing changes

**Never push to a remote, or run `gh repo create`, without the user asking
in that exact moment** — see the other two tools' CLAUDE.md for why this
is a standing rule, not a one-time caution. Build, commit and test
locally; ask before the first push.
