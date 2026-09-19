use wasm_bindgen::prelude::*;

use crate::convert::{parse_aspect, to_js};
use crate::dto::CollageLayoutDto;
use crate::message::Message;

/// A row of collage layouts for a template (`"landscape"` / `"square"` /
/// `"portrait"`), built from `seed` -- two 2-photo, two 3-photo and two
/// 4-photo arrangements. A different seed gives a different row, which is
/// what the picker's Shuffle spends: see
/// `postcard_calc::collage_gen::shuffle`.
#[wasm_bindgen]
pub fn collage_shuffle(aspect: &str, seed: u32) -> Result<JsValue, JsValue> {
    let Some(aspect) = parse_aspect(aspect) else {
        return Err(to_js(&Message::bad_request()));
    };
    let layouts: Vec<CollageLayoutDto> = postcard_calc::collage_shuffle(aspect, seed)
        .iter()
        .map(CollageLayoutDto::from)
        .collect();
    Ok(to_js(&layouts))
}

/// The layout a stored `layoutId` refers to -- a generated one rebuilt
/// from the seed in its id, or one of the curated layouts a draft saved
/// before generated layouts existed. Returns JS `null` for an id that is
/// neither, so a restore can fall back to a fresh layout instead of
/// placing photos against slots it cannot reconstruct.
#[wasm_bindgen]
pub fn collage_layout(aspect: &str, id: &str) -> Result<JsValue, JsValue> {
    let Some(aspect) = parse_aspect(aspect) else {
        return Err(to_js(&Message::bad_request()));
    };
    Ok(match postcard_calc::collage_layout_for_id(aspect, id) {
        Some(layout) => to_js(&CollageLayoutDto::from(&layout)),
        None => JsValue::NULL,
    })
}
