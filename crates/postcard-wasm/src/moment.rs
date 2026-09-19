//! When-was-this-taken bindings. Bridge only -- every rule about
//! seasons, hemispheres and hour boundaries lives in
//! `postcard_calc::moment`.

use wasm_bindgen::prelude::*;

use crate::convert::to_js;
use crate::dto::MomentDto;

/// Reads the photo's own EXIF date and reports it as a season and a time
/// of day, or **`null`** when the photo carries no usable date.
///
/// `null` is an ordinary answer here, not a failure -- screenshots,
/// downloaded images, anything that has been through a chat app, and
/// photos taken with this app's own in-page camera all arrive with no
/// EXIF date at all. That is why this returns `null` rather than
/// throwing a `Message` the way the geometry bindings do: there is
/// nothing for a toast to say and nothing the user could act on.
///
/// `timezone` is the browser's IANA zone name (`Intl.DateTimeFormat()
/// .resolvedOptions().timeZone`), used only to guess a hemisphere when
/// the photo carries no GPS of its own -- the same permission-free,
/// request-free trick `location.js` uses for the postmark. An
/// unrecognised zone is not an error; it guesses northern, and the
/// photo's own GPS overrides it regardless. So there is no argument
/// this function can reject, and therefore no `Result`.
#[wasm_bindgen]
pub fn read_photo_moment(bytes: &[u8], timezone: &str) -> JsValue {
    let belt = postcard_calc::moment::belt_for_timezone(timezone);
    match postcard_calc::read_moment(bytes, belt) {
        Some(moment) => to_js(&MomentDto::from(moment)),
        None => JsValue::NULL,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[wasm_bindgen_test::wasm_bindgen_test]
    fn a_photo_with_no_date_is_null_rather_than_a_thrown_error() {
        assert!(read_photo_moment(b"not an image", "Europe/London").is_null());
        assert!(read_photo_moment(&[], "Europe/London").is_null());
    }

    #[wasm_bindgen_test::wasm_bindgen_test]
    fn an_unknown_timezone_is_survivable() {
        assert!(read_photo_moment(&[], "").is_null());
    }
}
