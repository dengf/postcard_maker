use serde::{Deserialize, Serialize};

/// A postcard template's shape. Three to start -- see CLAUDE.md for why
/// the set stays small: each one is a distinct crop ratio a photo has to
/// fit, not a cosmetic choice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Aspect {
    /// Classic postcard, 3:2.
    Landscape,
    /// 1:1.
    Square,
    /// 5:7.
    Portrait,
}

impl Aspect {
    /// Width-to-height ratio as (w, h) in lowest terms.
    pub fn ratio(self) -> (u32, u32) {
        match self {
            Aspect::Landscape => (3, 2),
            Aspect::Square => (1, 1),
            Aspect::Portrait => (5, 7),
        }
    }

    pub fn ratio_f64(self) -> f64 {
        let (w, h) = self.ratio();
        f64::from(w) / f64::from(h)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landscape_is_wider_than_tall() {
        assert!(Aspect::Landscape.ratio_f64() > 1.0);
    }

    #[test]
    fn portrait_is_taller_than_wide() {
        assert!(Aspect::Portrait.ratio_f64() < 1.0);
    }

    #[test]
    fn square_is_one_to_one() {
        assert_eq!(Aspect::Square.ratio_f64(), 1.0);
    }
}
