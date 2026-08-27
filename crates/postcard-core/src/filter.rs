use serde::{Deserialize, Serialize};

/// A named stylistic treatment, applied on top of the continuous
/// brightness/contrast/saturation adjustment every photo carries
/// regardless of filter -- see `postcard_calc::filters::apply`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Filter {
    None,
    Grayscale,
    Sepia,
    Vintage,
}

/// Continuous per-photo tone adjustment. `1.0` on contrast/saturation and
/// `0.0` on brightness are all no-ops -- the identity adjustment, not a
/// disabled one, so a `Filter::None` photo still round-trips through this
/// struct unchanged.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Adjustments {
    /// Additive, roughly -1.0..=1.0 of full brightness range.
    pub brightness: f32,
    /// Multiplicative, 0.0 = flat gray, 1.0 = unchanged.
    pub contrast: f32,
    /// Multiplicative, 0.0 = grayscale, 1.0 = unchanged.
    pub saturation: f32,
}

impl Default for Adjustments {
    fn default() -> Self {
        Self {
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
        }
    }
}
