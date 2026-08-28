use wasm_bindgen::prelude::*;

use crate::convert::to_js;
use crate::dto::{SuggestVibeResult, VibeMatchDto};
use crate::message::Message;

/// Up to this many distinct vibes are surfaced per photo, most confident
/// first -- enough for "a couple of alternative ideas" in the UI without
/// padding the result with barely-plausible guesses.
const MAX_MATCHES: usize = 3;

/// Classifies `photo` against `model` (a MobileNetV3-Small ImageNet-1000
/// ONNX file -- see the repo's CLAUDE.md for sourcing/licensing) and
/// maps the result to up to [`MAX_MATCHES`] of this app's own `Vibe`
/// categories. An empty `matches` list means "no suggestion worth
/// showing", not a failure -- see
/// `postcard_calc::vibe::classify_top_vibes`'s own doc comment for why a
/// low-confidence or unmapped class is deliberately left out rather than
/// surfaced as a wrong-looking guess.
#[wasm_bindgen]
pub fn suggest_vibe(model: &[u8], photo: &[u8]) -> JsValue {
    to_js(&match postcard_calc::run_inference(model, photo) {
        Ok(logits) => {
            let matches = postcard_calc::classify_top_vibes(&logits, MAX_MATCHES)
                .into_iter()
                .map(|(vibe, confidence)| VibeMatchDto {
                    vibe: vibe.name().to_string(),
                    confidence,
                })
                .collect();
            SuggestVibeResult {
                matches,
                error: None,
                error_message: None,
            }
        }
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
