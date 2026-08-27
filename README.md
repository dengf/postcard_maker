# Postcard Maker

Turn a photo into a postcard — crop it to a template, apply a filter, write
a greeting, decorate it with stickers, then email or save it. meifio's
third tool, built as a web app with a pure Rust image-processing core
compiled to WebAssembly.

**A build to verify locally before it is deployed anywhere** — this repo
has not been pushed to a remote yet. See `npm start` below.

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
- **Finish**: Share (native share sheet with the image attached, where
  supported) or Save, with a `mailto:` + download fallback everywhere else

## Architecture

Same layered shape as
[mortgage_calculator](https://github.com/dengf/mortgage_calculator) and
[budget_planner](https://github.com/dengf/budget_planner), independently
implemented. See `CLAUDE.md` for the Rust/JS boundary this app draws and
why it differs from the other two in one place (persistence).

```
crates/
  postcard-core   shared vocabulary: Aspect, Filter/Adjustments,
                   ExportFormat, geometry, errors
  postcard-calc   every image algorithm -- crop math, filter pixel
                   transforms, template layout, the encode pipeline
  postcard-wasm   thin wasm-bindgen bridge -- parses, calls, serializes
www/              React + webpack front end: capture, live CSS preview,
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
