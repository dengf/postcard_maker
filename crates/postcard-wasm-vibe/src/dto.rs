//! Result DTO for this crate's one binding. The model and photo bytes
//! cross as direct `&[u8]` wasm-bindgen parameters, not fields on a
//! serde_wasm_bindgen params struct -- routing multi-megabyte buffers
//! through serde_wasm_bindgen would encode every byte as a JS array
//! element instead of a typed array. Same shape as `budget-wasm-ocr`'s
//! `RunOcrResult`.

use postcard_core::Message;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VibeMatchDto {
    pub vibe: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestVibeResult {
    /// Zero or more distinct vibes the photo matched, most confident
    /// first -- see `postcard_calc::vibe::classify_top_vibes`. Empty
    /// means "no suggestion worth showing", not a failure.
    pub matches: Vec<VibeMatchDto>,
    pub error: Option<String>,
    pub error_message: Option<Message>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountFacesResult {
    /// How many face-shaped regions the model found -- not who they are,
    /// see `postcard_calc::face`'s own doc comment. `0` on either a
    /// genuinely faceless photo or a failure; the caller (`vibeWorker.js`)
    /// treats this analysis as best-effort and doesn't distinguish the
    /// two, so `error`/`error_message` exist for parity with
    /// `SuggestVibeResult` rather than because anything reads them today.
    pub face_count: u32,
    pub error: Option<String>,
    pub error_message: Option<Message>,
}
