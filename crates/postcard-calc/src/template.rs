use postcard_core::{Aspect, NormRect};

/// The facts about "what a postcard layout is" -- proportions of the
/// finished card, not pixels of any one photo, so they hold regardless of
/// export resolution. The editor uses these to keep the message and
/// sticker layer off the printable safe margin and out of the stamp
/// corner; nothing here depends on the photo itself.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TemplateGeometry {
    /// Uniform inset from every edge, as a fraction of the shorter side.
    pub safe_margin: f32,
    /// Reserved for a stamp graphic -- top-right corner, by convention.
    pub stamp_box: NormRect,
    /// Where the greeting message defaults to -- a band along the bottom,
    /// clear of the stamp corner.
    pub message_area: NormRect,
}

/// Same formula for every aspect: a postcard's stamp corner and message
/// band are proportional conventions, not a fact that varies by shape.
/// Takes `Aspect` anyway (unused today) so a future template that *does*
/// need a different layout -- e.g. a portrait card reserving a side
/// column instead of a bottom band -- has a place to branch without
/// changing this function's signature.
pub fn geometry(_aspect: Aspect) -> TemplateGeometry {
    const SAFE_MARGIN: f32 = 0.04;
    TemplateGeometry {
        safe_margin: SAFE_MARGIN,
        stamp_box: NormRect {
            x: 1.0 - SAFE_MARGIN - 0.16,
            y: SAFE_MARGIN,
            w: 0.16,
            h: 0.16,
        },
        message_area: NormRect {
            x: SAFE_MARGIN,
            y: 1.0 - SAFE_MARGIN - 0.28,
            w: 1.0 - 2.0 * SAFE_MARGIN,
            h: 0.28,
        },
    }
}

#[cfg(test)]
fn overlaps(a: NormRect, b: NormRect) -> bool {
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_box_and_message_area_never_overlap() {
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            let g = geometry(aspect);
            assert!(!overlaps(g.stamp_box, g.message_area), "{aspect:?}");
        }
    }

    #[test]
    fn every_area_stays_within_the_unit_square() {
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            let g = geometry(aspect);
            for area in [g.stamp_box, g.message_area] {
                assert!(area.x >= 0.0 && area.y >= 0.0, "{aspect:?}");
                assert!(
                    area.x + area.w <= 1.0 && area.y + area.h <= 1.0,
                    "{aspect:?}"
                );
            }
        }
    }
}
