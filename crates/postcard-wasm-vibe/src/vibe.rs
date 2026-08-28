use wasm_bindgen::prelude::*;

use crate::convert::to_js;
use crate::dto::SuggestVibeResult;
use crate::message::Message;

/// Classifies `photo` against `model` (a MobileNetV3-Small ImageNet-1000
/// ONNX file -- see the repo's CLAUDE.md for sourcing/licensing) and
/// maps the result to one of this app's own `Vibe` categories. `None`
/// for `vibe`/`confidence` means "no suggestion worth showing", not a
/// failure -- see `postcard_calc::vibe::classify_vibe`'s own doc comment
/// for why a low-confidence or unmapped class is deliberately silent
/// rather than a wrong-looking guess.
#[wasm_bindgen]
pub fn suggest_vibe(model: &[u8], photo: &[u8]) -> JsValue {
    to_js(&match postcard_calc::run_inference(model, photo) {
        Ok(logits) => match postcard_calc::classify_vibe(&logits) {
            Some((vibe, confidence)) => SuggestVibeResult {
                vibe: Some(vibe.name().to_string()),
                confidence: Some(confidence),
                error: None,
                error_message: None,
            },
            None => SuggestVibeResult::default(),
        },
        Err(e) => {
            let message = Message::from(&e);
            SuggestVibeResult {
                error: Some(message.text.clone()),
                error_message: Some(message),
                ..Default::default()
            }
        }
    })
}
