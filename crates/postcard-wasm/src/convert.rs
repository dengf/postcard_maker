//! Conversions across the JS/Rust boundary.

use wasm_bindgen::prelude::*;

use postcard_core::{Aspect, ExportFormat, Filter, PhotoCoverage, PhotoSide};

/// Serializes a result for JavaScript, JSON-compatible so a Rust map
/// becomes a plain JS object rather than a `Map`. Not used for the
/// photo-bytes path -- `process_photo` returns `Vec<u8>` directly, which
/// wasm-bindgen already converts to a `Uint8Array` far more cheaply than
/// routing megabytes of pixel data through JSON.
pub fn to_js<T: serde::Serialize + ?Sized>(value: &T) -> JsValue {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap_or(JsValue::NULL)
}

pub fn parse_aspect(value: &str) -> Option<Aspect> {
    match value {
        "landscape" => Some(Aspect::Landscape),
        "square" => Some(Aspect::Square),
        "portrait" => Some(Aspect::Portrait),
        _ => None,
    }
}

pub fn parse_photo_coverage(value: &str) -> Option<PhotoCoverage> {
    match value {
        "full" => Some(PhotoCoverage::Full),
        "half" => Some(PhotoCoverage::Half),
        "big_small" => Some(PhotoCoverage::BigSmall),
        _ => None,
    }
}

pub fn parse_photo_side(value: &str) -> Option<PhotoSide> {
    match value {
        "first" => Some(PhotoSide::First),
        "second" => Some(PhotoSide::Second),
        _ => None,
    }
}

pub fn parse_filter(value: &str) -> Option<Filter> {
    match value {
        "none" => Some(Filter::None),
        "grayscale" => Some(Filter::Grayscale),
        "sepia" => Some(Filter::Sepia),
        "vintage" => Some(Filter::Vintage),
        _ => None,
    }
}

/// `"jpeg"` carries `quality` (1-100, clamped); `"png"` ignores it.
pub fn parse_format(value: &str, quality: u8) -> Option<ExportFormat> {
    match value {
        "jpeg" => Some(ExportFormat::Jpeg {
            quality: quality.clamp(1, 100),
        }),
        "png" => Some(ExportFormat::Png),
        _ => None,
    }
}
