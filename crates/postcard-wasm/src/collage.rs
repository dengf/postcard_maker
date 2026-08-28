use wasm_bindgen::prelude::*;

use crate::convert::{parse_aspect, to_js};
use crate::dto::CollageLayoutDto;
use crate::message::Message;

/// The curated 2-and-3-photo layouts for a template (`"landscape"` /
/// `"square"` / `"portrait"`), always 2 two-photo layouts followed by 1
/// three-photo layout -- see `postcard_calc::template::collage_layouts`.
#[wasm_bindgen]
pub fn collage_layouts(aspect: &str) -> Result<JsValue, JsValue> {
    let Some(aspect) = parse_aspect(aspect) else {
        return Err(to_js(&Message::bad_request()));
    };
    let layouts: Vec<CollageLayoutDto> = postcard_calc::collage_layouts(aspect)
        .iter()
        .map(CollageLayoutDto::from)
        .collect();
    Ok(to_js(&layouts))
}
