//! Result DTO for this crate's one binding. The model and photo bytes
//! cross as direct `&[u8]` wasm-bindgen parameters, not fields on a
//! serde_wasm_bindgen params struct -- routing multi-megabyte buffers
//! through serde_wasm_bindgen would encode every byte as a JS array
//! element instead of a typed array. Same shape as `budget-wasm-ocr`'s
//! `RunOcrResult`.

use postcard_core::Message;
use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestVibeResult {
    pub vibe: Option<String>,
    pub confidence: Option<f32>,
    pub error: Option<String>,
    pub error_message: Option<Message>,
}
