use serde::{Deserialize, Serialize};

/// A pixel-space crop rectangle in the *source* photo's own coordinates
/// (not the template's), so a crop survives re-deriving the preview at a
/// different screen size.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// A normalized (0.0..=1.0) area within the finished postcard -- used for
/// template facts like the reserved stamp corner or the message area,
/// which are proportions of the card, not pixels of any one photo.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct NormRect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}
