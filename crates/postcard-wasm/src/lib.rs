//! wasm-bindgen bridge for `postcard-calc`. Every binding here only
//! parses `JsValue`/`&[u8]`, calls into `postcard-calc`, and serializes
//! the result -- no algorithm lives in this crate. See the repo's
//! CLAUDE.md for the full Rust/JS boundary this sits on.

mod collage;
mod convert;
mod dto;
mod message;
mod photo;
mod template;

use wasm_bindgen::prelude::wasm_bindgen;

pub use collage::collage_layouts;
pub use photo::{process_photo, suggest_crop, suggest_crop_ratio};
pub use template::template_geometry;

#[wasm_bindgen(start)]
fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
