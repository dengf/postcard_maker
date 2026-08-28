use wasm_bindgen::prelude::*;

use crate::convert::to_js;
use crate::dto::GenerateCaptionResult;
use crate::message::Message;

/// Generates a real, on-device caption for `photo` -- see the repo's
/// CLAUDE.md and `postcard_calc::caption`'s own doc comment for the
/// model choice, the real gotchas found building this (SSD-style
/// decoding was face detection's; this one's are the hand-assembled
/// image-token prompt layout and the multi-step generation loop), and
/// why this is a separate action from "Suggest a look" rather than
/// folded into it.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn generate_caption(
    vision_model: &[u8],
    embed_model: &[u8],
    decoder_model: &[u8],
    tokenizer: &[u8],
    photo: &[u8],
) -> JsValue {
    to_js(&match postcard_calc::generate_caption(
        vision_model,
        embed_model,
        decoder_model,
        tokenizer,
        photo,
    ) {
        Ok(caption) => GenerateCaptionResult {
            caption: Some(caption),
            error: None,
            error_message: None,
        },
        Err(e) => {
            let message = Message::from(&e);
            GenerateCaptionResult {
                error: Some(message.text.clone()),
                error_message: Some(message),
                ..Default::default()
            }
        }
    })
}
