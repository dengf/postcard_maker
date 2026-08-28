//! Every calculation and pixel algorithm the postcard editor needs:
//! crop geometry, filter math, template layout facts, and the decode ->
//! crop -> filter -> resize -> encode pipeline. Nothing here touches the
//! DOM, a canvas, or a font -- see the repo's CLAUDE.md for the Rust/JS
//! boundary this crate sits on.

pub mod caption;
pub mod crop;
pub mod face;
pub mod filters;
pub mod pipeline;
pub mod template;
pub mod vibe;

pub use pipeline::process_photo;
pub use template::{collage_layouts, geometry as template_geometry, TemplateGeometry};
pub use vibe::{classify_top_vibes, classify_vibe, Vibe};

#[cfg(feature = "vibe")]
pub use face::count_faces;
#[cfg(feature = "vibe")]
pub use vibe::run_inference;

#[cfg(feature = "caption")]
pub use caption::generate_caption;
