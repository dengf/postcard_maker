use wasm_bindgen::prelude::*;

use crate::convert::{parse_aspect, parse_photo_coverage, parse_photo_side, to_js};
use crate::dto::TemplateGeometryDto;
use crate::message::Message;

/// The photo/blank-area split plus the stamp-corner and message-area
/// layout facts for a template (`"landscape"` / `"square"` / `"portrait"`),
/// so the editor can draw guides and keep the user's own placements clear
/// of them. `coverage` is `"full"` / `"half"` / `"big_small"`; `side` is
/// `"first"` (left/top) / `"second"` (right/bottom), ignored when
/// `coverage` is `"full"`.
#[wasm_bindgen]
pub fn template_geometry(aspect: &str, coverage: &str, side: &str) -> Result<JsValue, JsValue> {
    let (Some(aspect), Some(coverage), Some(side)) = (
        parse_aspect(aspect),
        parse_photo_coverage(coverage),
        parse_photo_side(side),
    ) else {
        return Err(to_js(&Message::bad_request()));
    };
    let geometry = postcard_calc::template_geometry(aspect, coverage, side);
    Ok(to_js(&TemplateGeometryDto::from(geometry)))
}
