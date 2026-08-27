use wasm_bindgen::prelude::*;

use crate::convert::{parse_aspect, to_js};
use crate::dto::TemplateGeometryDto;
use crate::message::Message;

/// The stamp-corner and message-area layout facts for a template
/// (`"landscape"` / `"square"` / `"portrait"`), so the editor can draw
/// guides and keep the user's own placements clear of them.
#[wasm_bindgen]
pub fn template_geometry(aspect: &str) -> Result<JsValue, JsValue> {
    let Some(aspect) = parse_aspect(aspect) else {
        return Err(to_js(&Message::bad_request()));
    };
    let geometry = postcard_calc::template_geometry(aspect);
    Ok(to_js(&TemplateGeometryDto::from(geometry)))
}
