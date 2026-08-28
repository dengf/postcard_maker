use postcard_core::{Aspect, CollageLayout, CollageSlot, NormRect};

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

const fn slot(x: f32, y: f32, w: f32, h: f32) -> CollageSlot {
    CollageSlot {
        area: NormRect { x, y, w, h },
    }
}

const THIRD: f32 = 1.0 / 3.0;
const TWO_THIRDS: f32 = 2.0 / 3.0;

// Two 2-photo layouts (a 50/50 split and a 70/30 big-plus-small split)
// and one 3-photo layout (equal thirds), per `Aspect` -- landscape splits
// left/right, square and portrait split top/bottom. A single-photo
// postcard is deliberately NOT modeled as "a collage of one": see
// CLAUDE.md for why that unification was rejected as a regression risk
// on the already-shipped single-photo flow.
const LANDSCAPE_SIDE_BY_SIDE: CollageLayout = CollageLayout {
    id: "landscape-side-by-side",
    aspect: Aspect::Landscape,
    slots: &[slot(0.0, 0.0, 0.5, 1.0), slot(0.5, 0.0, 0.5, 1.0)],
};
const LANDSCAPE_BIG_SMALL: CollageLayout = CollageLayout {
    id: "landscape-big-small",
    aspect: Aspect::Landscape,
    slots: &[slot(0.0, 0.0, 0.7, 1.0), slot(0.7, 0.0, 0.3, 1.0)],
};
const LANDSCAPE_THIRDS: CollageLayout = CollageLayout {
    id: "landscape-thirds",
    aspect: Aspect::Landscape,
    slots: &[
        slot(0.0, 0.0, THIRD, 1.0),
        slot(THIRD, 0.0, THIRD, 1.0),
        slot(TWO_THIRDS, 0.0, THIRD, 1.0),
    ],
};

const SQUARE_STACKED: CollageLayout = CollageLayout {
    id: "square-stacked",
    aspect: Aspect::Square,
    slots: &[slot(0.0, 0.0, 1.0, 0.5), slot(0.0, 0.5, 1.0, 0.5)],
};
const SQUARE_BIG_SMALL: CollageLayout = CollageLayout {
    id: "square-big-small",
    aspect: Aspect::Square,
    slots: &[slot(0.0, 0.0, 1.0, 0.7), slot(0.0, 0.7, 1.0, 0.3)],
};
const SQUARE_THIRDS: CollageLayout = CollageLayout {
    id: "square-thirds",
    aspect: Aspect::Square,
    slots: &[
        slot(0.0, 0.0, 1.0, THIRD),
        slot(0.0, THIRD, 1.0, THIRD),
        slot(0.0, TWO_THIRDS, 1.0, THIRD),
    ],
};

const PORTRAIT_STACKED: CollageLayout = CollageLayout {
    id: "portrait-stacked",
    aspect: Aspect::Portrait,
    slots: &[slot(0.0, 0.0, 1.0, 0.5), slot(0.0, 0.5, 1.0, 0.5)],
};
const PORTRAIT_BIG_SMALL: CollageLayout = CollageLayout {
    id: "portrait-big-small",
    aspect: Aspect::Portrait,
    slots: &[slot(0.0, 0.0, 1.0, 0.7), slot(0.0, 0.7, 1.0, 0.3)],
};
const PORTRAIT_THIRDS: CollageLayout = CollageLayout {
    id: "portrait-thirds",
    aspect: Aspect::Portrait,
    slots: &[
        slot(0.0, 0.0, 1.0, THIRD),
        slot(0.0, THIRD, 1.0, THIRD),
        slot(0.0, TWO_THIRDS, 1.0, THIRD),
    ],
};

/// The curated collage layouts for one `Aspect` -- always 2 two-photo
/// layouts followed by 1 three-photo layout.
pub fn collage_layouts(aspect: Aspect) -> &'static [CollageLayout] {
    match aspect {
        Aspect::Landscape => &[
            LANDSCAPE_SIDE_BY_SIDE,
            LANDSCAPE_BIG_SMALL,
            LANDSCAPE_THIRDS,
        ],
        Aspect::Square => &[SQUARE_STACKED, SQUARE_BIG_SMALL, SQUARE_THIRDS],
        Aspect::Portrait => &[PORTRAIT_STACKED, PORTRAIT_BIG_SMALL, PORTRAIT_THIRDS],
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

    #[test]
    fn every_aspect_offers_two_pair_layouts_then_one_triple() {
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            let layouts = collage_layouts(aspect);
            assert_eq!(layouts.len(), 3, "{aspect:?}");
            assert_eq!(layouts[0].slots.len(), 2, "{aspect:?}");
            assert_eq!(layouts[1].slots.len(), 2, "{aspect:?}");
            assert_eq!(layouts[2].slots.len(), 3, "{aspect:?}");
        }
    }

    #[test]
    fn every_layout_is_tagged_with_the_aspect_it_was_looked_up_by() {
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            for layout in collage_layouts(aspect) {
                assert_eq!(layout.aspect, aspect);
            }
        }
    }

    #[test]
    fn every_layout_ids_are_unique() {
        let mut ids = std::collections::BTreeSet::new();
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            for layout in collage_layouts(aspect) {
                assert!(ids.insert(layout.id), "duplicate layout id {}", layout.id);
            }
        }
    }

    #[test]
    fn every_slot_stays_within_the_unit_square() {
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            for layout in collage_layouts(aspect) {
                for s in layout.slots {
                    let a = s.area;
                    assert!(a.x >= 0.0 && a.y >= 0.0, "{}", layout.id);
                    assert!(a.x + a.w <= 1.0001 && a.y + a.h <= 1.0001, "{}", layout.id);
                }
            }
        }
    }

    #[test]
    fn no_two_slots_in_a_layout_overlap() {
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            for layout in collage_layouts(aspect) {
                for i in 0..layout.slots.len() {
                    for j in (i + 1)..layout.slots.len() {
                        assert!(
                            !overlaps(layout.slots[i].area, layout.slots[j].area),
                            "{} slots {i} and {j} overlap",
                            layout.id
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn every_layouts_slots_fully_tile_the_card() {
        // Sum of slot areas should account for the whole unit square (up
        // to floating-point rounding on the thirds layouts).
        for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
            for layout in collage_layouts(aspect) {
                let total: f32 = layout.slots.iter().map(|s| s.area.w * s.area.h).sum();
                assert!(
                    (total - 1.0).abs() < 0.001,
                    "{} slots covered {total}, not 1.0",
                    layout.id
                );
            }
        }
    }
}
