use wasm_bindgen::prelude::*;

use crate::convert::to_js;
use crate::dto::CountFacesResult;
use crate::message::Message;

/// Counts faces in `photo` against `model` (Ultra-Light-Fast-Generic-
/// Face-Detector-1MB -- see the repo's CLAUDE.md for sourcing/licensing
/// and the real gotcha found building `postcard_calc::face`). `0` covers
/// both "no faces" and a failure; see `CountFacesResult`'s own doc
/// comment for why that's fine here.
#[wasm_bindgen]
pub fn count_faces(model: &[u8], photo: &[u8]) -> JsValue {
    to_js(&match postcard_calc::count_faces(model, photo) {
        Ok(face_count) => CountFacesResult {
            face_count: face_count as u32,
            error: None,
            error_message: None,
        },
        Err(e) => {
            let message = Message::from(&e);
            CountFacesResult {
                error: Some(message.text.clone()),
                error_message: Some(message),
                ..Default::default()
            }
        }
    })
}
