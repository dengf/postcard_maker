# Postcard Maker

Turn a photo into a postcard — crop it to a template, apply a filter, write
a greeting, decorate it with stickers, then email or save it. meifio's
third tool, built as a web app with a pure Rust image-processing core
compiled to WebAssembly.

Live at [dengf.github.io/postcard_maker](https://dengf.github.io/postcard_maker/). See `npm start` below to run it locally.

## What it is, and what it deliberately is not

No account, no upload, no server. The photo you take or choose is cropped,
filtered and encoded entirely in your browser; the greeting and any
stickers are drawn onto it the same way. "Share" hands the finished image
to your device's own share sheet or mail client; "Save" downloads it. At
no point does the photo, the message, or a recipient's address cross the
network — open your browser's Network tab while you use it and watch it
stay empty.

- **Filters are real Rust pixel math**, not a CSS trick pretending to be
  one — grayscale, sepia and a vintage tone-curve-plus-vignette, plus
  continuous brightness/contrast/saturation, all in `postcard-calc`.
- **Everything unfinished stays on your device**, written to IndexedDB in
  your own browser. Clearing site data removes it for good.
- **Three languages**, no regionalization: English, 简体中文, 繁體中文 — this
  tool has no regulatory or region-specific logic to carry, unlike the
  other two.

## Features

- **Photo intake**: an in-page live camera (falls back to a plain file
  picker on any device/browser without one) or choosing an existing photo
- **Templates**: three postcard shapes — landscape (3:2), square (1:1),
  portrait (5:7) — with a live pan/zoom crop
- **Filters**: original, black & white, sepia, vintage, plus
  brightness/contrast/saturation sliders
- **Message**: a greeting in a plain or decorative style (decorative turns
  itself off for a Chinese message — see `CLAUDE.md`), three alignments,
  four colors
- **Stickers**: a small hand-drawn set — heart, star, sun, cloud, wave,
  airplane, postmark, palm tree, confetti, arrow, washi tape, and the
  brand's own plum blossom — placed by dragging
- **Suggest a look**: on-device photo classification (MobileNetV3-Small,
  lazily loaded only when tapped) suggests a filter and sticker matching
  what's in the photo — beach, mountain, water, architecture, winter,
  food, or a pet. A second, much smaller on-device model counts faces to
  suggest a warm look and caption for photos of people, which the
  classifier structurally can't recognize on its own (ImageNet has almost
  no "person" classes) — a solo portrait and a group of two or more each
  get their own tone, rather than one generic "you're together" that only
  makes sense for a group. A third check reads the photo's own brightness/
  contrast/saturation to suggest an exposure fix on any photo at all, no
  recognition needed. See `CLAUDE.md` for the real findings behind all
  three.
- **Draw**: a freehand doodle layer over the postcard
- **Collage**: 2 or 3 photos in one postcard, three curated layouts per
  template shape
- **A real back side**: lined message, a stamp graphic, and a
  postmark-style date/location line, as an optional second image
- **Finish**: Share (native share sheet with the image(s) attached, where
  supported) or Save, with a `mailto:` + download fallback everywhere else

## Architecture

Same layered shape as
[mortgage_calculator](https://github.com/dengf/mortgage_calculator) and
[budget_planner](https://github.com/dengf/budget_planner), independently
implemented. See `CLAUDE.md` for the Rust/JS boundary this app draws and
why it differs from the other two in one place (persistence).

```
crates/
  postcard-core     shared vocabulary: Aspect, Filter/Adjustments,
                     ExportFormat, CollageLayout/Slot, geometry, errors
  postcard-calc     every image algorithm -- crop math, filter pixel
                     transforms, template/collage layout, the encode
                     pipeline, and `vibe` (photo classification, behind
                     its own Cargo feature)
  postcard-wasm     thin wasm-bindgen bridge -- parses, calls, serializes
  postcard-wasm-vibe  same bridge rule, lazily loaded (see CLAUDE.md)
www/                React + webpack front end: capture, live CSS preview,
                     canvas bake at export, i18n, IndexedDB draft autosave
```

`postcard-calc` has zero dependencies on wasm, the DOM, or a clock — every
function takes plain bytes and typed parameters, which is what makes a
crop suggestion or a filter's pixel math a fast, focused unit test rather
than something you have to click through a browser to check.

## Run it

```bash
cd www
npm install
npm start          # builds the wasm, starts the dev server
```

```bash
npm test           # frontend unit tests
npm run build:wasm && npm run build   # production build
```

```bash
cargo test --workspace                                # Rust tests
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings
cargo build -p postcard-wasm --target wasm32-unknown-unknown --release   # see CLAUDE.md
```

## Privacy

No accounts, no server, no analytics of any kind. See
`www/static/privacy.html` once deployed, or read it directly in this repo.

## License

MIT — see `LICENSE`.

### Third-party licenses

Audited 2026-08-28: every crate in the Rust dependency graph
(`cargo metadata`, full transitive closure of the workspace) is MIT,
Apache-2.0, BSD-3-Clause, 0BSD, Unlicense, or Zlib — no GPL/LGPL/AGPL
anywhere. Every production npm dependency (`react`, `react-dom`, and
their two small transitive deps) is MIT. No fonts or icon assets are
bundled or redistributed: the brand mark (`assets/icon/`,
`MeifioMark.jsx`) and every sticker (`www/src/stickers.js`) are
hand-authored inline SVG/PNG, and the text tool's fonts are the
browser's own system font stack, never shipped as files. Re-check this
if a new dependency is ever added — `cargo metadata --format-version=1`
for Rust, `npx license-checker --production` for npm.

**Two vendored models**, added after the original audit:
- `www/static/vibe/mobilenetv3-small.onnx` is MobileNetV3-Small trained
  on ImageNet-1000, **BSD-3-Clause** (torchvision lineage), exported
  directly from
  `torchvision.models.mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)`.
- `www/static/face/ultra-light-face-detector.onnx` is
  [Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB)
  (`version-slim-320_simplified.onnx`), **MIT**.

Same disclosure duty as budget_planner's OCR models — see
`www/static/privacy.html`'s "Third-party models" section.
