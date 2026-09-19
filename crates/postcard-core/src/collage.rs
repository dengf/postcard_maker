use std::borrow::Cow;

use crate::{Aspect, NormRect};

/// One photo's area within a collage -- a normalized region of the whole
/// card, same convention as `NormRect` elsewhere.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CollageSlot {
    pub area: NormRect,
}

/// A named arrangement of photo slots for one `Aspect`.
///
/// Both fields are `Cow` so one type covers both origins: the curated
/// fallbacks in `postcard-calc::template::collage_layouts` stay plain
/// `const`s (every `Cow::Borrowed`, no allocation, the same way
/// `postcard-calc::vibe`'s curated class table is a const), while
/// `postcard-calc::collage_gen` builds owned ones from a seed at runtime.
/// The alternative -- a second, owned layout struct -- would have meant a
/// second DTO conversion and a second everything downstream, for a type
/// the rest of the app only ever reads.
#[derive(Debug, Clone, PartialEq)]
pub struct CollageLayout {
    pub id: Cow<'static, str>,
    pub aspect: Aspect,
    pub slots: Cow<'static, [CollageSlot]>,
}

impl CollageLayout {
    /// A layout built at runtime -- see `postcard-calc::collage_gen`.
    pub fn owned(id: String, aspect: Aspect, slots: Vec<CollageSlot>) -> Self {
        Self {
            id: Cow::Owned(id),
            aspect,
            slots: Cow::Owned(slots),
        }
    }
}
