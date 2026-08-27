//! Every calculation and pixel algorithm the postcard editor needs:
//! crop geometry, filter math, template layout facts, and the decode ->
//! crop -> filter -> resize -> encode pipeline. Nothing here touches the
//! DOM, a canvas, or a font -- see the repo's CLAUDE.md for the Rust/JS
//! boundary this crate sits on.

pub mod crop;
pub mod filters;
pub mod pipeline;
pub mod template;

pub use pipeline::process_photo;
pub use template::{geometry as template_geometry, TemplateGeometry};
