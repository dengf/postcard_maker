//! Photo-processing bindings.
//!
//! `process_photo` deliberately returns `Result<Vec<u8>, JsValue>` rather
//! than this codebase's usual `{ error, error_message }` JSON-envelope
//! convention (see `mortgage-wasm`/`budget-wasm`): the success payload is
//! several megabytes of pixel data, and `Vec<u8>` is where wasm-bindgen's
//! own fast path (a `Uint8Array` view, no JSON) applies. Wrapping it in an
//! envelope object would force it through `serde_wasm_bindgen`'s
//! JSON-compatible serializer instead, turning every byte into a JSON
//! number. On failure this throws a `Message`, exactly like every other
//! binding's `error_message` field, just via `catch` instead of a field.

use wasm_bindgen::prelude::*;

use postcard_core::Rect;

use crate::convert::{parse_aspect, parse_filter, parse_format, to_js};
use crate::dto::{ProcessPhotoParams, RectDto};
use crate::message::Message;

#[wasm_bindgen]
pub fn process_photo(bytes: &[u8], params: JsValue) -> Result<Vec<u8>, JsValue> {
    let params: ProcessPhotoParams =
        serde_wasm_bindgen::from_value(params).map_err(|_| to_js(&Message::bad_request()))?;

    let Some(filter) = parse_filter(&params.filter) else {
        return Err(to_js(&Message::bad_request()));
    };
    let Some(format) = parse_format(&params.format, params.quality) else {
        return Err(to_js(&Message::bad_request()));
    };

    let crop = Rect {
        x: params.crop_x,
        y: params.crop_y,
        w: params.crop_w,
        h: params.crop_h,
    };
    let adjustments = postcard_core::Adjustments {
        brightness: params.brightness,
        contrast: params.contrast,
        saturation: params.saturation,
    };

    postcard_calc::process_photo(
        bytes,
        crop,
        adjustments,
        filter,
        params.max_dimension,
        format,
    )
    .map_err(|e| to_js(&Message::from(e)))
}

/// The largest centered crop of `(image_w, image_h)` matching `aspect`
/// (`"landscape"` / `"square"` / `"portrait"`) -- the editor's starting
/// point before the user drags the crop handles.
#[wasm_bindgen]
pub fn suggest_crop(image_w: u32, image_h: u32, aspect: &str) -> Result<JsValue, JsValue> {
    let Some(aspect) = parse_aspect(aspect) else {
        return Err(to_js(&Message::bad_request()));
    };
    let rect = postcard_calc::crop::suggest(image_w, image_h, aspect);
    Ok(to_js(&RectDto::from(rect)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[wasm_bindgen_test::wasm_bindgen_test]
    fn bad_json_is_reported_as_bad_request_not_a_panic() {
        let err = process_photo(&[], JsValue::UNDEFINED);
        assert!(err.is_err());
    }
}
