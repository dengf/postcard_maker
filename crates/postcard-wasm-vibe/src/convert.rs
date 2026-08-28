//! The one JS/Rust boundary conversion this crate's single binding
//! needs. Duplicated from `postcard-wasm::convert` rather than shared --
//! a wasm-bindgen crate compiles to its own standalone `cdylib` and can't
//! depend on a sibling wasm-bindgen crate as a library. See
//! `budget-wasm-ocr::convert` for the identical precedent.

use wasm_bindgen::JsValue;

pub fn to_js<T: serde::Serialize + ?Sized>(value: &T) -> JsValue {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap_or(JsValue::NULL)
}
