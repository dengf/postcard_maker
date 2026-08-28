//! Foundational types shared by `postcard_calc` and `postcard_wasm`.
//!
//! Deliberately small: the vocabulary every layer above needs to agree on
//! (aspect, filter kind, geometry, errors), and nothing else. No
//! dependency on the calculation logic itself -- see `postcard-calc`.

mod aspect;
mod collage;
mod error;
mod export;
mod filter;
mod geometry;
mod message;

pub use aspect::Aspect;
pub use collage::{CollageLayout, CollageSlot};
pub use error::PostcardError;
pub use export::ExportFormat;
pub use filter::{Adjustments, Filter};
pub use geometry::{NormRect, Rect};
pub use message::Message;

pub type PostcardResult<T> = Result<T, PostcardError>;
