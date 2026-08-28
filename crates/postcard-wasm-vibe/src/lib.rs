//! Lazily-loaded WebAssembly bindings for "Suggest a look": photo
//! classification (`suggest_vibe`) and face counting (`count_faces`),
//! two independent models sharing one crate and one `rten` runtime
//! since both are downloaded together on the same tap.
//!
//! Split out from `postcard-wasm` for the same reason `budget-wasm-ocr`
//! is split from `budget-wasm`: `rten` (a full ML tensor runtime) is most
//! of this crate's own wasm payload, paid on every page load if it lived
//! in the main bundle even though most sessions never tap "Suggest a
//! look". `postcard-calc`'s `vibe` Cargo feature (which only this crate
//! enables) keeps `rten` out of `postcard-wasm`'s dependency graph
//! entirely, not just unreached at runtime.
//!
//! `www/src/vibeWorker.js` `import()`s this crate's own `pkg-vibe` output
//! only the first time someone taps that button, and fetches both model
//! files themselves just as lazily.
//!
//! No business logic lives in this crate either -- each binding parses
//! bytes, calls into `postcard-calc`, and serializes the result back.
//! See CLAUDE.md and `postcard-wasm`'s own identical rule.

mod convert;
mod dto;
mod face;
mod message;
mod vibe;

use wasm_bindgen::prelude::wasm_bindgen;

pub use face::count_faces;
pub use vibe::suggest_vibe;

#[wasm_bindgen(start)]
fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
