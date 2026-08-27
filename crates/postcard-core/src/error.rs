use thiserror::Error;

/// Every failure `postcard-calc` can produce.
///
/// One flat enum, matching the other meifio tools' `MortgageError`/
/// `BudgetError`: every variant crosses the wasm boundary through
/// `postcard-wasm`'s `Message` type, which needs one place to match on.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum PostcardError {
    #[error("the photo has no bytes to read")]
    EmptyImage,

    #[error("could not read this photo: {0}")]
    UnreadableImage(String),

    #[error("the crop rectangle ({0}) falls outside the photo")]
    CropOutOfBounds(String),

    #[error("could not encode the finished postcard: {0}")]
    EncodeFailed(String),
}
