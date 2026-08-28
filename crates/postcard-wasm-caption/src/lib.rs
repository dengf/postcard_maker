//! Lazily-loaded WebAssembly bindings for on-device photo captioning --
//! a genuinely large (~139MB across three ONNX models plus a tokenizer)
//! and architecturally different capability from "Suggest a look"
//! (`postcard-wasm-vibe`): a single forward pass there, a multi-step
//! autoregressive generation loop here. Split into its own crate for
//! exactly that reason -- so this download is never paid by anyone who
//! only ever taps "Suggest a look", the same reasoning that split
//! `postcard-wasm-vibe` off `postcard-wasm` in the first place.
//!
//! `www/src/captionWorker.js` `import()`s this crate's own `pkg-caption`
//! output, and fetches all four files (three models, one tokenizer)
//! themselves, only the first time the caption feature's own explicit
//! action is tapped -- never alongside "Suggest a look", never on an
//! ordinary page load.
//!
//! No business logic lives in this crate either -- `generate_caption`
//! parses bytes, calls into `postcard-calc`, and serializes the result
//! back. See CLAUDE.md and `postcard-wasm`'s own identical rule.

mod caption;
mod convert;
mod dto;
mod message;

use wasm_bindgen::prelude::wasm_bindgen;

pub use caption::generate_caption;

#[wasm_bindgen(start)]
fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
