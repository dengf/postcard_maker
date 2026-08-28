//! Stable message codes for text the UI has to show a user. An error
//! crosses the wasm boundary as a code plus its parameters, and the UI
//! composes the sentence in whichever language it's running, with the
//! English text carried alongside as a fallback. Mirrors
//! `budget-core::Message` / `mortgage-core::Message` exactly -- see those
//! crates for the fuller rationale.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::PostcardError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Message {
    pub code: String,
    pub params: BTreeMap<String, String>,
    pub text: String,
}

impl Message {
    fn new(code: &str, params: BTreeMap<String, String>, text: String) -> Self {
        Self {
            code: code.to_string(),
            params,
            text,
        }
    }

    pub fn bare(code: &str, text: impl Into<String>) -> Self {
        Self::new(code, BTreeMap::new(), text.into())
    }

    pub fn with_value(code: &str, value: impl Into<String>, text: String) -> Self {
        let mut params = BTreeMap::new();
        params.insert("value".to_string(), value.into());
        Self::new(code, params, text)
    }

    /// The values a caller sent could not be read into the expected shape.
    /// Carries nothing from the underlying `serde_wasm_bindgen::Error` --
    /// it wraps a live JS stack trace, and every caller writes this
    /// straight into the DOM.
    pub fn bad_request() -> Self {
        Message::bare(
            "err.badRequest",
            "Some values are missing or aren't valid. Try again.",
        )
    }
}

impl From<&PostcardError> for Message {
    fn from(error: &PostcardError) -> Self {
        let text = error.to_string();
        match error {
            PostcardError::EmptyImage => Message::bare("err.emptyImage", text),
            PostcardError::UnreadableImage(v) => {
                Message::with_value("err.unreadableImage", v.clone(), text)
            }
            PostcardError::CropOutOfBounds(v) => {
                Message::with_value("err.cropOutOfBounds", v.clone(), text)
            }
            PostcardError::EncodeFailed(v) => {
                Message::with_value("err.encodeFailed", v.clone(), text)
            }
            PostcardError::VibeModelLoadFailed(v) => {
                Message::with_value("err.vibeModelLoadFailed", v.clone(), text)
            }
            PostcardError::VibeClassifyFailed(v) => {
                Message::with_value("err.vibeClassifyFailed", v.clone(), text)
            }
            PostcardError::FaceModelLoadFailed(v) => {
                Message::with_value("err.faceModelLoadFailed", v.clone(), text)
            }
            PostcardError::FaceDetectFailed(v) => {
                Message::with_value("err.faceDetectFailed", v.clone(), text)
            }
            PostcardError::CaptionModelLoadFailed(v) => {
                Message::with_value("err.captionModelLoadFailed", v.clone(), text)
            }
            PostcardError::CaptionGenerateFailed(v) => {
                Message::with_value("err.captionGenerateFailed", v.clone(), text)
            }
        }
    }
}

impl From<PostcardError> for Message {
    fn from(error: PostcardError) -> Self {
        Message::from(&error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn carries_the_offending_value() {
        let msg = Message::from(&PostcardError::UnreadableImage("bad header".into()));
        assert_eq!(msg.code, "err.unreadableImage");
        assert_eq!(msg.params.get("value").unwrap(), "bad header");
    }

    #[test]
    fn every_variant_maps_to_a_distinct_code() {
        let all = [
            PostcardError::EmptyImage,
            PostcardError::UnreadableImage("x".into()),
            PostcardError::CropOutOfBounds("x".into()),
            PostcardError::EncodeFailed("x".into()),
            PostcardError::VibeModelLoadFailed("x".into()),
            PostcardError::VibeClassifyFailed("x".into()),
            PostcardError::FaceModelLoadFailed("x".into()),
            PostcardError::FaceDetectFailed("x".into()),
            PostcardError::CaptionModelLoadFailed("x".into()),
            PostcardError::CaptionGenerateFailed("x".into()),
        ];
        let codes: std::collections::BTreeSet<_> =
            all.iter().map(|e| Message::from(e).code).collect();
        assert_eq!(codes.len(), all.len());
        assert!(codes.iter().all(|c| c.starts_with("err.")));
    }
}
