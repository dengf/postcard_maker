use crate::{Aspect, NormRect};

/// One photo's area within a collage -- a normalized region of the whole
/// card, same convention as `NormRect` elsewhere.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CollageSlot {
    pub area: NormRect,
}

/// A named arrangement of 2-3 photo slots for one `Aspect`. `slots` is
/// `&'static` so every layout can be a plain `const`, the same way
/// `postcard-calc::vibe`'s curated class table is -- see
/// `postcard-calc::template::collage_layouts` for the actual curated set.
#[derive(Debug, Clone, Copy)]
pub struct CollageLayout {
    pub id: &'static str,
    pub aspect: Aspect,
    pub slots: &'static [CollageSlot],
}
