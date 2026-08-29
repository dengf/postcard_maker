use serde::{Deserialize, Serialize};

/// How much of the card the photo covers, when it isn't the full-bleed
/// default -- the other option a single-photo postcard has for sharing
/// the card with the greeting message, alongside overlaying it on the
/// photo the way `Full` already does. Two ratios, same as the two
/// 2-photo `CollageLayout`s per aspect (`postcard-calc::template`'s
/// `*_SIDE_BY_SIDE`/`*_BIG_SMALL`) -- this is a smaller, parallel concept
/// for the single-photo flow, not a reuse of the collage machinery: see
/// the repo's CLAUDE.md for why the single-photo flow is deliberately
/// never modeled as "a collage of one."
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhotoCoverage {
    /// Today's only behavior: photo fills the card, message overlays it.
    Full,
    /// A 50/50 split.
    Half,
    /// A 70/30 split, photo on the larger side.
    BigSmall,
}

/// Which side of the split axis the photo sits on. Named positionally
/// (not "left"/"right") because the axis itself depends on the aspect --
/// `Landscape` splits left/right, `Square`/`Portrait` split top/bottom,
/// the same per-aspect convention `postcard-calc::template::collage_layouts`
/// already uses. `First` is left or top; `Second` is right or bottom.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhotoSide {
    First,
    Second,
}
