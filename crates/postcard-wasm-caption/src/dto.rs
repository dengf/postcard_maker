//! Result DTO for this crate's one binding. The four inputs (three
//! model files plus the photo) cross as direct `&[u8]` wasm-bindgen
//! parameters, not fields on a serde_wasm_bindgen params struct --
//! routing multi-megabyte buffers through serde_wasm_bindgen would
//! encode every byte as a JS array element instead of a typed array.
//! Same shape as `postcard-wasm-vibe::dto`.

use postcard_core::Message;
use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCaptionResult {
    /// `None` on failure, never an empty string on success -- see
    /// `postcard_calc::caption::generate_caption`'s own stopping logic.
    pub caption: Option<String>,
    pub error: Option<String>,
    pub error_message: Option<Message>,
}
