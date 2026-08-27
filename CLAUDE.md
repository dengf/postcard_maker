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
| `postcard-core` | Shared vocabulary: `Aspect`, `Filter`/`Adjustments`, `ExportFormat`, geometry, the `Message` error convention |
| `postcard-calc` | Crop geometry, every filter's pixel math, template layout facts, the decode -> crop -> filter -> resize -> encode pipeline |
| `postcard-wasm` | Bridge only. Parse `JsValue`/`&[u8]`, call `postcard-calc`, serialize back |
| `www/` | Camera/file capture, live preview (CSS, not wasm), text/sticker placement, the one-shot canvas bake at export, i18n |

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

## Verification traps specific to this repo

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

## Landing changes

**Never push to a remote, or run `gh repo create`, without the user asking
in that exact moment** — see the other two tools' CLAUDE.md for why this
is a standing rule, not a one-time caution. Build, commit and test
locally; ask before the first push.
