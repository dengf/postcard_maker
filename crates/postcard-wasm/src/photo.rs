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
use crate::dto::{ProcessPhotoParams, RectDto, SizeDto};
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
        params.rotation,
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

/// Same as [`suggest_crop`], for an arbitrary width/height `ratio`
/// instead of one of the three named templates -- what a collage slot's
/// own proportions need, since they rarely match `"landscape"` /
/// `"square"` / `"portrait"`. See `postcard_calc::crop::suggest_for_ratio`.
#[wasm_bindgen]
pub fn suggest_crop_ratio(image_w: u32, image_h: u32, ratio: f64) -> Result<JsValue, JsValue> {
    if !(ratio.is_finite() && ratio > 0.0) {
        return Err(to_js(&Message::bad_request()));
    }
    let rect = postcard_calc::crop::suggest_for_ratio(image_w, image_h, ratio);
    Ok(to_js(&RectDto::from(rect)))
}

/// The size of the box a `(image_w, image_h)` photo fills once it is
/// turned `rotation` degrees clockwise -- the coordinate space every crop
/// on a rotated photo is expressed in, and what the live preview needs to
/// place the photo inside its frame.
///
/// It is one line of trigonometry, and that is exactly why it lives here:
/// if the preview worked it out in JS and `process_photo` worked it out
/// in Rust, the two would only have to disagree in the last decimal for
/// the exported card to sit a pixel off the one on screen.
#[wasm_bindgen]
pub fn rotated_bounds(image_w: u32, image_h: u32, rotation: f32) -> Result<JsValue, JsValue> {
    if image_w == 0 || image_h == 0 {
        return Err(to_js(&Message::bad_request()));
    }
    let (w, h) = postcard_calc::rotate::bounds(image_w, image_h, rotation);
    Ok(to_js(&SizeDto { w, h }))
}

/// The largest centred crop of `ratio` that still fits entirely on the
/// photo once it is turned -- [`suggest_crop_ratio`] for a rotated photo,
/// and the zoom-1 starting point the zoom slider measures against.
///
/// This shrinking as the angle grows is what makes a turning photo appear
/// to scale up instead of showing empty corners.
#[wasm_bindgen]
pub fn suggest_crop_rotated(
    image_w: u32,
    image_h: u32,
    rotation: f32,
    ratio: f64,
) -> Result<JsValue, JsValue> {
    if image_w == 0 || image_h == 0 || !(ratio.is_finite() && ratio > 0.0) {
        return Err(to_js(&Message::bad_request()));
    }
    let rect = postcard_calc::rotate::suggest(image_w, image_h, rotation, ratio);
    Ok(to_js(&RectDto::from(rect)))
}

/// Pulls a crop back onto the turned photo: clamped if it fits somewhere,
/// shrunk about its own centre if it does not.
///
/// Every crop a gesture produces goes through here before it is stored,
/// which is what guarantees `process_photo` is never handed a rectangle
/// that hangs over an edge -- the failure that would show up as
/// transparent triangles in a finished postcard.
#[wasm_bindgen]
pub fn fit_rotated_crop(
    image_w: u32,
    image_h: u32,
    rotation: f32,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<JsValue, JsValue> {
    if image_w == 0 || image_h == 0 || w == 0 || h == 0 {
        return Err(to_js(&Message::bad_request()));
    }
    let rect = postcard_calc::rotate::fit(image_w, image_h, rotation, Rect { x, y, w, h });
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

    #[wasm_bindgen_test::wasm_bindgen_test]
    fn a_photo_with_no_size_is_a_bad_request_rather_than_a_divide_by_zero() {
        assert!(rotated_bounds(0, 100, 0.0).is_err());
        assert!(suggest_crop_rotated(100, 0, 0.0, 1.5).is_err());
        assert!(fit_rotated_crop(100, 100, 0.0, 0, 0, 0, 10).is_err());
    }
}
