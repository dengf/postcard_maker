use postcard_core::{Aspect, CollageLayout, CollageSlot, NormRect, PhotoCoverage, PhotoSide};

/// The facts about "what a postcard layout is" -- proportions of the
/// finished card, not pixels of any one photo, so they hold regardless of
/// export resolution. The editor uses these to keep the message and
/// sticker layer off the printable safe margin and out of the stamp
/// corner; nothing here depends on the photo itself.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TemplateGeometry {
    /// Uniform inset from every edge, as a fraction of the shorter side.
    pub safe_margin: f32,
    /// Where the photo sits -- the whole card for [`PhotoCoverage::Full`],
    /// a half or 70/30 slice otherwise. `blank_area` is its exact
    /// complement (equal to `photo_area`, i.e. the whole card, for
    /// `Full` -- the message overlays the photo there, same as always).
    pub photo_area: NormRect,
    pub blank_area: NormRect,
    /// Reserved for a stamp graphic -- top-right corner of `blank_area`,
    /// by convention.
    pub stamp_box: NormRect,
    /// Where the greeting message defaults to -- a band along the bottom
    /// of `blank_area`, clear of the stamp corner.
    pub message_area: NormRect,
}

const SAFE_MARGIN: f32 = 0.04;
const HALF_SHARE: f32 = 0.5;
const BIG_SHARE: f32 = 0.7;

/// `photo_area`/`blank_area` for one aspect+coverage+side. `Landscape`
/// splits along x (left/right); `Square`/`Portrait` split along y
/// (top/bottom) -- the same per-aspect axis convention
/// [`collage_layouts`] already uses. `Full` ignores `side` and returns
/// the whole card for both, since there's nothing to split.
fn photo_and_blank_area(aspect: Aspect, coverage: PhotoCoverage, side: PhotoSide) -> (NormRect, NormRect) {
    let whole = NormRect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };
    let photo_share = match coverage {
        PhotoCoverage::Full => return (whole, whole),
        PhotoCoverage::Half => HALF_SHARE,
        PhotoCoverage::BigSmall => BIG_SHARE,
    };
    let blank_share = 1.0 - photo_share;
    let splits_x = matches!(aspect, Aspect::Landscape);

    let (photo_origin, blank_origin) = match side {
        PhotoSide::First => (0.0, photo_share),
        PhotoSide::Second => (blank_share, 0.0),
    };

    if splits_x {
        (
            NormRect { x: photo_origin, y: 0.0, w: photo_share, h: 1.0 },
            NormRect { x: blank_origin, y: 0.0, w: blank_share, h: 1.0 },
        )
    } else {
        (
            NormRect { x: 0.0, y: photo_origin, w: 1.0, h: photo_share },
            NormRect { x: 0.0, y: blank_origin, w: 1.0, h: blank_share },
        )
    }
}

/// The stamp box and message band, scaled into `container`'s own local
/// coordinate frame. With `container` equal to the whole card (`Full`
/// coverage's `blank_area`) this reduces to exactly the single fixed
/// formula this function used to be -- same constants, same numbers --
/// which is what keeps that default path provably unchanged.
fn layout_within(container: NormRect) -> (NormRect, NormRect) {
    let stamp_box = NormRect {
        x: container.x + container.w * (1.0 - SAFE_MARGIN - 0.16),
        y: container.y + container.h * SAFE_MARGIN,
        w: container.w * 0.16,
        h: container.h * 0.16,
    };
    let message_area = NormRect {
        x: container.x + container.w * SAFE_MARGIN,
        y: container.y + container.h * (1.0 - SAFE_MARGIN - 0.28),
        w: container.w * (1.0 - 2.0 * SAFE_MARGIN),
        h: container.h * 0.28,
    };
    (stamp_box, message_area)
}

/// The full layout for one template: a photo area, its complement, and
/// where the stamp/message sit within that complement. For
/// [`PhotoCoverage::Full`] the complement is the whole card and this is
/// exactly today's single fixed layout; for `Half`/`BigSmall` it's scoped
/// to whichever half/slice the photo doesn't occupy, so the message never
/// has to fight the photo for the same pixels.
pub fn geometry(aspect: Aspect, coverage: PhotoCoverage, side: PhotoSide) -> TemplateGeometry {
    let (photo_area, blank_area) = photo_and_blank_area(aspect, coverage, side);
    let (stamp_box, message_area) = layout_within(blank_area);
    TemplateGeometry {
        safe_margin: SAFE_MARGIN,
        photo_area,
        blank_area,
        stamp_box,
        message_area,
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

    const ALL_ASPECTS: [Aspect; 3] = [Aspect::Landscape, Aspect::Square, Aspect::Portrait];
    const ALL_COVERAGES: [PhotoCoverage; 3] =
        [PhotoCoverage::Full, PhotoCoverage::Half, PhotoCoverage::BigSmall];
    const ALL_SIDES: [PhotoSide; 2] = [PhotoSide::First, PhotoSide::Second];

    #[test]
    fn stamp_box_and_message_area_never_overlap() {
        for aspect in ALL_ASPECTS {
            let g = geometry(aspect, PhotoCoverage::Full, PhotoSide::First);
            assert!(!overlaps(g.stamp_box, g.message_area), "{aspect:?}");
        }
    }

    #[test]
    fn every_area_stays_within_the_unit_square() {
        for aspect in ALL_ASPECTS {
            let g = geometry(aspect, PhotoCoverage::Full, PhotoSide::First);
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
    fn full_coverage_gives_the_photo_the_whole_card_same_as_the_blank_area() {
        // The exact invariant that keeps the default path unchanged: for
        // `Full`, photo_area and blank_area are both the whole card, so
        // stamp_box/message_area come out identical to the single fixed
        // formula this function used to hard-code.
        for aspect in ALL_ASPECTS {
            let g = geometry(aspect, PhotoCoverage::Full, PhotoSide::First);
            let whole = NormRect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };
            assert_eq!(g.photo_area, whole, "{aspect:?}");
            assert_eq!(g.blank_area, whole, "{aspect:?}");
            assert_eq!(g.stamp_box.x, 1.0 - SAFE_MARGIN - 0.16, "{aspect:?}");
            assert_eq!(g.message_area.h, 0.28, "{aspect:?}");
        }
    }

    #[test]
    fn split_coverage_never_overlaps_photo_and_blank() {
        for aspect in ALL_ASPECTS {
            for coverage in [PhotoCoverage::Half, PhotoCoverage::BigSmall] {
                for side in ALL_SIDES {
                    let g = geometry(aspect, coverage, side);
                    assert!(
                        !overlaps(g.photo_area, g.blank_area),
                        "{aspect:?} {coverage:?} {side:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn split_coverage_photo_and_blank_tile_the_card() {
        for aspect in ALL_ASPECTS {
            for coverage in [PhotoCoverage::Half, PhotoCoverage::BigSmall] {
                for side in ALL_SIDES {
                    let g = geometry(aspect, coverage, side);
                    let total = g.photo_area.w * g.photo_area.h + g.blank_area.w * g.blank_area.h;
                    assert!(
                        (total - 1.0).abs() < 0.001,
                        "{aspect:?} {coverage:?} {side:?} covered {total}, not 1.0"
                    );
                }
            }
        }
    }

    #[test]
    fn split_coverage_stamp_and_message_stay_inside_the_blank_area() {
        fn contains(container: NormRect, area: NormRect) -> bool {
            area.x >= container.x - 0.0001
                && area.y >= container.y - 0.0001
                && area.x + area.w <= container.x + container.w + 0.0001
                && area.y + area.h <= container.y + container.h + 0.0001
        }
        for aspect in ALL_ASPECTS {
            for coverage in ALL_COVERAGES {
                for side in ALL_SIDES {
                    let g = geometry(aspect, coverage, side);
                    assert!(
                        contains(g.blank_area, g.stamp_box),
                        "{aspect:?} {coverage:?} {side:?} stamp_box"
                    );
                    assert!(
                        contains(g.blank_area, g.message_area),
                        "{aspect:?} {coverage:?} {side:?} message_area"
                    );
                    assert!(
                        !overlaps(g.stamp_box, g.message_area),
                        "{aspect:?} {coverage:?} {side:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn every_area_stays_within_the_unit_square_for_every_combination() {
        for aspect in ALL_ASPECTS {
            for coverage in ALL_COVERAGES {
                for side in ALL_SIDES {
                    let g = geometry(aspect, coverage, side);
                    for area in [g.photo_area, g.blank_area, g.stamp_box, g.message_area] {
                        assert!(
                            area.x >= -0.0001 && area.y >= -0.0001,
                            "{aspect:?} {coverage:?} {side:?}"
                        );
                        assert!(
                            area.x + area.w <= 1.0001 && area.y + area.h <= 1.0001,
                            "{aspect:?} {coverage:?} {side:?}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn landscape_splits_horizontally_square_and_portrait_split_vertically() {
        let landscape = geometry(Aspect::Landscape, PhotoCoverage::Half, PhotoSide::First);
        assert_eq!(landscape.photo_area.h, 1.0);
        assert_eq!(landscape.photo_area.w, 0.5);

        for aspect in [Aspect::Square, Aspect::Portrait] {
            let g = geometry(aspect, PhotoCoverage::Half, PhotoSide::First);
            assert_eq!(g.photo_area.w, 1.0, "{aspect:?}");
            assert_eq!(g.photo_area.h, 0.5, "{aspect:?}");
        }
    }

    #[test]
    fn first_and_second_side_are_on_opposite_edges() {
        let first = geometry(Aspect::Landscape, PhotoCoverage::BigSmall, PhotoSide::First);
        let second = geometry(Aspect::Landscape, PhotoCoverage::BigSmall, PhotoSide::Second);
        assert_eq!(first.photo_area.x, 0.0);
        assert_eq!(second.photo_area.x, 1.0 - second.photo_area.w);
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
