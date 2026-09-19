//! Collage layouts generated from a seed, rather than picked from a
//! fixed table.
//!
//! The picker used to offer three curated layouts per shape -- a 50/50
//! split, a 70/30 split, and equal thirds -- which are all the *same*
//! idea (parallel strips) and are the same three every session. Here a
//! layout is built instead: start from the whole card and split it
//! repeatedly, choosing the axis and the proportion from a seeded
//! sequence, until there are as many slots as wanted.
//!
//! This is business logic in the sense CLAUDE.md means -- a second
//! implementation would give different rectangles for the same seed, and
//! "the same seed" is load-bearing: a saved collage stores only its
//! layout's id, and [`layout_for_id`] has to rebuild exactly the
//! arrangement the photos were cropped for. So the generator is
//! deliberately *not* `Math.random()` in the host layer; it is an
//! arithmetic function of (aspect, seed, slot count) living next to the
//! rest of the layout facts.
//!
//! Randomness alone is not the goal -- a uniformly random guillotine cut
//! produces slivers no one would put a photo in. Every candidate split is
//! checked against the guardrails below and redrawn if it fails, so what
//! varies is arrangement, never usability.

use postcard_core::{Aspect, CollageLayout, CollageSlot, NormRect};

use crate::template::collage_layouts;

/// How many photos a generated collage can ask for. Two is the smallest
/// thing that is a collage at all; four is where a slot on a 375px phone
/// is still around 150px across -- wide enough to pan a photo inside with
/// a fingertip, and enough photo detail to survive the export. See
/// CLAUDE.md's phone-first rules for why the ceiling is a real constraint
/// and not a shrug.
pub const MIN_SLOTS: usize = 2;
pub const MAX_SLOTS: usize = 4;

/// A slot's own on-card pixel ratio (width/height *in pixels*, i.e. its
/// share of the card scaled by the card's own ratio) must stay inside
/// this band. Outside it a slot is a letterbox strip: a portrait photo
/// dropped into a 3:1 slot shows a band across someone's eyes and
/// nothing else, whatever crop is suggested for it.
const MIN_SLOT_RATIO: f32 = 0.45;
const MAX_SLOT_RATIO: f32 = 2.2;

/// No slot may be thinner than this fraction of the card along either
/// axis, whatever its ratio works out to. This is the phone-first floor
/// rather than an aesthetic one: on a 375px-wide card a 0.22 slot is
/// ~82px, already small for a drag surface, and it also bounds how far
/// the recursion can subdivide.
const MIN_SLOT_SIDE: f32 = 0.22;

/// Proportions a split may use, before jitter. Weighted by repetition
/// rather than by a parallel weight table: an even cut is the most common
/// draw (it always looks deliberate), the golden-section pair next, and
/// the lopsided thirds least often. Without this the layouts read as
/// arbitrary rather than composed -- the point is variety among
/// proportions that each look chosen, not uniform noise on [0,1].
const SPLIT_FRACTIONS: &[f32] = &[0.5, 0.5, 0.5, 0.382, 0.618, 0.45, 0.55, 0.34, 0.66];

/// How far a drawn fraction may wander, so two layouts built from the
/// same fraction still differ. Small on purpose: past a few percent the
/// "chosen" proportions stop reading as chosen.
const JITTER: f32 = 0.03;

/// Redraws before a split gives up and takes the safe cut. Eight is well
/// past what the guardrails need in practice (most rects pass on the
/// first or second draw); it exists so a deeply-subdivided rect with
/// almost no legal cut left can't spin.
const MAX_DRAWS: u32 = 8;

/// A tiny deterministic PRNG -- xorshift32 over a SplitMix-style seeded
/// state. Deliberately hand-rolled rather than pulled from `rand`: this
/// needs about twenty lines of arithmetic, it has to produce identical
/// numbers on every platform and every future build (a saved collage's
/// layout is only recoverable if it does), and `rand`'s own generators
/// carry no such cross-version guarantee -- on top of the wasm weight,
/// which CLAUDE.md's own measured-bundle notes make worth avoiding.
struct Rng(u32);

impl Rng {
    fn new(seed: u32) -> Self {
        // Mix first, so neighbouring seeds (which is exactly what a row
        // of swatches uses) don't produce neighbouring layouts, and so a
        // seed of 0 isn't the degenerate all-zero xorshift state.
        let mut x = seed ^ 0x9e37_79b9;
        x ^= x >> 16;
        x = x.wrapping_mul(0x21f0_aaad);
        x ^= x >> 15;
        x = x.wrapping_mul(0x735a_2d97);
        x ^= x >> 15;
        Self(if x == 0 { 0x6d2b_79f5 } else { x })
    }

    fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }

    /// A float in [0, 1).
    fn next_f32(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / (1u32 << 24) as f32
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next_u32() as usize) % n.max(1)
    }
}

/// A rect's width-to-height ratio in real pixels once it is placed on a
/// card of ratio `card_ratio` -- the same conversion `CollageEditor`'s
/// `slotPixelRatio` does before asking for a crop suggestion, which is
/// why the guardrails above are written in these units and not in
/// fractions of the card.
fn pixel_ratio(r: NormRect, card_ratio: f32) -> f32 {
    (r.w / r.h) * card_ratio
}

fn acceptable(r: NormRect, card_ratio: f32) -> bool {
    if r.w < MIN_SLOT_SIDE || r.h < MIN_SLOT_SIDE {
        return false;
    }
    let ratio = pixel_ratio(r, card_ratio);
    (MIN_SLOT_RATIO..=MAX_SLOT_RATIO).contains(&ratio)
}

/// Cuts `r` in two at fraction `f`, vertically (left/right) or not
/// (top/bottom).
fn cut(r: NormRect, vertical: bool, f: f32) -> (NormRect, NormRect) {
    if vertical {
        let w = r.w * f;
        (
            NormRect {
                x: r.x,
                y: r.y,
                w,
                h: r.h,
            },
            NormRect {
                x: r.x + w,
                y: r.y,
                w: r.w - w,
                h: r.h,
            },
        )
    } else {
        let h = r.h * f;
        (
            NormRect {
                x: r.x,
                y: r.y,
                w: r.w,
                h,
            },
            NormRect {
                x: r.x,
                y: r.y + h,
                w: r.w,
                h: r.h - h,
            },
        )
    }
}

/// Splits one rect into two that both pass [`acceptable`], or returns
/// `None` if this rect has no legal cut left in it at all (which is what
/// stops the recursion from producing slivers rather than a length check
/// on the slot list).
///
/// The axis is not chosen freely: cutting a rect across its *long* side
/// is what keeps both halves near square, so that is the default, and the
/// short-side cut is only taken when a draw asks for it *and* the result
/// still passes. That asymmetry is the whole reason the output looks
/// composed -- free choice of axis produces a run of parallel strips,
/// which is exactly the sameness this module exists to get away from.
fn split(r: NormRect, card_ratio: f32, rng: &mut Rng) -> Option<(NormRect, NormRect)> {
    let long_side_is_horizontal = pixel_ratio(r, card_ratio) >= 1.0;

    for _ in 0..MAX_DRAWS {
        // Mostly cut the long side; sometimes try the other way, and let
        // the guardrails decide whether that was allowed.
        let vertical = if rng.next_f32() < 0.8 {
            long_side_is_horizontal
        } else {
            !long_side_is_horizontal
        };
        let base = SPLIT_FRACTIONS[rng.below(SPLIT_FRACTIONS.len())];
        let f = (base + (rng.next_f32() * 2.0 - 1.0) * JITTER).clamp(0.2, 0.8);
        let (a, b) = cut(r, vertical, f);
        if acceptable(a, card_ratio) && acceptable(b, card_ratio) {
            return Some((a, b));
        }
    }

    // Nothing drawn worked. An even cut across the long side is the most
    // permissive split there is, so if that fails this rect genuinely has
    // no room left and the caller has to split a different one.
    let (a, b) = cut(r, long_side_is_horizontal, 0.5);
    (acceptable(a, card_ratio) && acceptable(b, card_ratio)).then_some((a, b))
}

/// The id a generated layout carries, and the only thing a saved draft
/// stores about it. `g` distinguishes it from a curated id at a glance
/// and in [`layout_for_id`].
fn generated_id(seed: u32, slot_count: usize) -> String {
    format!("g{seed}-{slot_count}")
}

/// Builds the layout for one (aspect, seed, slot count). Pure and total:
/// the same three arguments always give the same rectangles, which is
/// what makes a generated layout storable by id alone.
///
/// `slot_count` is clamped to [`MIN_SLOTS`]..=[`MAX_SLOTS`] rather than
/// rejected -- the id is parsed from a stored string, and a collage whose
/// count reads as garbage is better opened with a sane layout than not
/// opened.
pub fn generate(aspect: Aspect, seed: u32, slot_count: usize) -> CollageLayout {
    let wanted = slot_count.clamp(MIN_SLOTS, MAX_SLOTS);
    let card_ratio = aspect.ratio_f64() as f32;
    let mut rng = Rng::new(seed ^ ((wanted as u32) << 24));

    let mut rects = vec![NormRect {
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
    }];

    while rects.len() < wanted {
        // Which rect to cut next is itself part of the variety, but it
        // is biased towards the largest: splitting an already-small rect
        // is how a layout ends up with one big photo and a scatter of
        // stamps. Two random candidates, cut the bigger -- "tournament"
        // selection, which keeps the bias without always picking the
        // same rect and collapsing the whole thing into one shape.
        let i = rng.below(rects.len());
        let j = rng.below(rects.len());
        let area = |r: NormRect| r.w * r.h;
        let first = if area(rects[i]) >= area(rects[j]) {
            i
        } else {
            j
        };

        // Then the fallback order: the chosen rect, and if it has no
        // legal cut left, every other rect largest-first. Only when none
        // of them can be split does the layout stop short of `wanted` --
        // possible in principle at the guardrails' limits, and handled
        // rather than asserted away.
        let mut order: Vec<usize> = (0..rects.len()).filter(|&k| k != first).collect();
        order.sort_by(|&a, &b| area(rects[b]).total_cmp(&area(rects[a])));
        order.insert(0, first);

        let mut done = false;
        for k in order {
            if let Some((a, b)) = split(rects[k], card_ratio, &mut rng) {
                rects[k] = a;
                rects.push(b);
                done = true;
                break;
            }
        }
        if !done {
            break;
        }
    }

    // Reading order: top-to-bottom, then left-to-right. Slot 0 has to be
    // the top-left one for every layout, because the slot *index* is what
    // a draft stores its photos against and what carrying photos across a
    // layout change lines up -- if index 0 were wherever the recursion
    // happened to leave it, shuffling would scatter someone's photos.
    rects.sort_by(|a, b| a.y.total_cmp(&b.y).then(a.x.total_cmp(&b.x)));

    CollageLayout::owned(
        generated_id(seed, rects.len()),
        aspect,
        rects.into_iter().map(|area| CollageSlot { area }).collect(),
    )
}

/// How many layouts one shuffle offers.
pub const SHUFFLE_SIZE: usize = 6;

/// A row of layouts for the picker: [`SHUFFLE_SIZE`] of them, two each of
/// 2, 3 and 4 photos, in that order.
///
/// The counts are fixed rather than drawn so that every shuffle offers
/// each of them -- someone with exactly two photos must never have to
/// shuffle repeatedly to find somewhere to put them. What varies is the
/// arrangement within each count, which is the part worth shuffling.
pub fn shuffle(aspect: Aspect, seed: u32) -> Vec<CollageLayout> {
    (0..SHUFFLE_SIZE)
        .map(|i| {
            let count = MIN_SLOTS + i / 2;
            // Each swatch gets its own seed derived from the row's, mixed
            // rather than offset, so the six are unrelated to each other
            // instead of six variations on one arrangement.
            let mixed = seed
                .wrapping_mul(0x9e37_79b1)
                .wrapping_add((i as u32).wrapping_mul(0x85eb_ca6b));
            generate(aspect, mixed, count)
        })
        .collect()
}

/// Recovers a layout from a stored id: a generated one rebuilt from its
/// seed, or one of the curated layouts a draft saved before generation
/// existed. `None` for an id belonging to neither -- the caller (a draft
/// restore) then falls back to a fresh layout rather than opening a
/// collage whose slots it cannot place.
pub fn layout_for_id(aspect: Aspect, id: &str) -> Option<CollageLayout> {
    if let Some(rest) = id.strip_prefix('g') {
        let (seed, count) = rest.split_once('-')?;
        return Some(generate(aspect, seed.parse().ok()?, count.parse().ok()?));
    }
    collage_layouts(aspect).iter().find(|l| l.id == id).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    const ALL_ASPECTS: [Aspect; 3] = [Aspect::Landscape, Aspect::Square, Aspect::Portrait];

    /// Every (aspect, seed, count) worth checking an invariant over.
    fn sweep() -> impl Iterator<Item = (Aspect, u32, usize)> {
        ALL_ASPECTS.into_iter().flat_map(|aspect| {
            (0..400u32).flat_map(move |seed| {
                (MIN_SLOTS..=MAX_SLOTS).map(move |count| (aspect, seed, count))
            })
        })
    }

    fn overlaps(a: NormRect, b: NormRect) -> bool {
        // Shared edges are not overlap; a strict comparison on floats
        // that came out of a subtraction would call them one.
        const EPS: f32 = 1e-4;
        a.x + EPS < b.x + b.w
            && b.x + EPS < a.x + a.w
            && a.y + EPS < b.y + b.h
            && b.y + EPS < a.y + a.h
    }

    #[test]
    fn the_same_seed_always_builds_the_same_layout() {
        // The one invariant a saved draft depends on: its id carries the
        // seed and nothing else, so anything that changes this changes
        // where an already-saved collage's photos sit.
        for (aspect, seed, count) in sweep() {
            assert_eq!(
                generate(aspect, seed, count),
                generate(aspect, seed, count),
                "{aspect:?} seed {seed} count {count}"
            );
        }
    }

    #[test]
    fn every_layout_has_the_slots_it_was_asked_for() {
        for (aspect, seed, count) in sweep() {
            let layout = generate(aspect, seed, count);
            assert_eq!(
                layout.slots.len(),
                count,
                "{aspect:?} seed {seed} wanted {count}"
            );
        }
    }

    #[test]
    fn slots_never_overlap() {
        for (aspect, seed, count) in sweep() {
            let layout = generate(aspect, seed, count);
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

    #[test]
    fn slots_tile_the_whole_card() {
        // Guillotine splits can only ever produce a tiling, so the area
        // sum is the cheap proof that no cut lost or double-counted a
        // strip of the card -- the same check the curated table gets.
        for (aspect, seed, count) in sweep() {
            let layout = generate(aspect, seed, count);
            let total: f32 = layout.slots.iter().map(|s| s.area.w * s.area.h).sum();
            assert!(
                (total - 1.0).abs() < 0.001,
                "{} covered {total}, not 1.0",
                layout.id
            );
        }
    }

    #[test]
    fn every_slot_stays_within_the_card() {
        for (aspect, seed, count) in sweep() {
            let layout = generate(aspect, seed, count);
            for s in layout.slots.iter() {
                let a = s.area;
                assert!(a.x >= -0.0001 && a.y >= -0.0001, "{}", layout.id);
                assert!(a.x + a.w <= 1.0001 && a.y + a.h <= 1.0001, "{}", layout.id);
            }
        }
    }

    #[test]
    fn no_slot_is_a_sliver() {
        // The guardrails are the difference between "random" and
        // "usable": a layout nobody would put a photo in is not variety.
        for (aspect, seed, count) in sweep() {
            let layout = generate(aspect, seed, count);
            let card_ratio = aspect.ratio_f64() as f32;
            for s in layout.slots.iter() {
                assert!(
                    acceptable(s.area, card_ratio),
                    "{} has an unusable slot {:?} (pixel ratio {})",
                    layout.id,
                    s.area,
                    pixel_ratio(s.area, card_ratio)
                );
            }
        }
    }

    #[test]
    fn slots_come_back_in_reading_order() {
        for (aspect, seed, count) in sweep() {
            let layout = generate(aspect, seed, count);
            for pair in layout.slots.windows(2) {
                let (a, b) = (pair[0].area, pair[1].area);
                assert!(
                    a.y < b.y || (a.y <= b.y && a.x <= b.x),
                    "{} is not in reading order",
                    layout.id
                );
            }
            // Slot 0 is the top-left one -- what carrying photos across a
            // layout change and restoring a draft both line up against.
            let first = layout.slots[0].area;
            assert!(first.x < 0.0001 && first.y < 0.0001, "{}", layout.id);
        }
    }

    #[test]
    fn different_seeds_really_do_give_different_layouts() {
        // Guards the actual feature, not just its invariants: a generator
        // that returned one safe arrangement for every seed would pass
        // every test above and ship the sameness this replaced.
        for aspect in ALL_ASPECTS {
            for count in MIN_SLOTS..=MAX_SLOTS {
                let distinct: BTreeSet<String> = (0..200u32)
                    .map(|seed| format!("{:?}", generate(aspect, seed, count).slots))
                    .collect();
                assert!(
                    distinct.len() > 50,
                    "{aspect:?} with {count} slots only ever produced {} arrangements over 200 seeds",
                    distinct.len()
                );
            }
        }
    }

    #[test]
    fn a_shuffle_offers_two_each_of_two_three_and_four_photos() {
        for aspect in ALL_ASPECTS {
            for seed in 0..100u32 {
                let row = shuffle(aspect, seed);
                assert_eq!(row.len(), SHUFFLE_SIZE);
                let counts: Vec<usize> = row.iter().map(|l| l.slots.len()).collect();
                assert_eq!(counts, vec![2, 2, 3, 3, 4, 4], "{aspect:?} seed {seed}");
            }
        }
    }

    #[test]
    fn a_shuffle_never_offers_the_same_layout_twice() {
        for aspect in ALL_ASPECTS {
            for seed in 0..200u32 {
                let row = shuffle(aspect, seed);
                let ids: BTreeSet<&str> = row.iter().map(|l| l.id.as_ref()).collect();
                assert_eq!(
                    ids.len(),
                    row.len(),
                    "{aspect:?} seed {seed} repeated an id"
                );
                // The two same-count swatches must differ visibly too,
                // not just by id -- two identical-looking swatches read
                // as a broken shuffle.
                for pair in row.chunks(2) {
                    assert_ne!(pair[0].slots, pair[1].slots, "{aspect:?} seed {seed}");
                }
            }
        }
    }

    #[test]
    fn consecutive_seeds_give_unrelated_rows() {
        // A row is built from one seed; if neighbouring seeds produced
        // neighbouring rows, tapping Shuffle would look like it did
        // nothing. (`Rng::new` mixes for exactly this reason.)
        for aspect in ALL_ASPECTS {
            for seed in 0..200u32 {
                let a = shuffle(aspect, seed);
                let b = shuffle(aspect, seed + 1);
                let shared = a
                    .iter()
                    .zip(b.iter())
                    .filter(|(x, y)| x.slots == y.slots)
                    .count();
                assert!(
                    shared <= 1,
                    "{aspect:?} seeds {seed}/{} shared {shared}",
                    seed + 1
                );
            }
        }
    }

    #[test]
    fn a_generated_id_rebuilds_its_own_layout() {
        // What a draft restore actually does: it has the id and nothing
        // else, and the photos in it were cropped for these exact slots.
        for (aspect, seed, count) in sweep() {
            let layout = generate(aspect, seed, count);
            assert_eq!(
                layout_for_id(aspect, &layout.id).as_ref(),
                Some(&layout),
                "{}",
                layout.id
            );
        }
    }

    #[test]
    fn a_curated_id_still_rebuilds_its_layout() {
        // Drafts saved before generation existed carry these ids, and
        // they have to keep opening.
        for aspect in ALL_ASPECTS {
            for curated in collage_layouts(aspect) {
                assert_eq!(
                    layout_for_id(aspect, &curated.id).as_ref(),
                    Some(curated),
                    "{}",
                    curated.id
                );
            }
        }
    }

    #[test]
    fn an_unknown_or_malformed_id_is_none_rather_than_a_panic() {
        // These come out of IndexedDB, so "trusted input" they are not.
        for id in [
            "",
            "g",
            "g-",
            "gxyz-2",
            "g12-",
            "g12-abc",
            "g99999999999999-2",
            "landscape-nope",
            "square-stacked-2",
        ] {
            assert_eq!(layout_for_id(Aspect::Landscape, id), None, "{id}");
        }
    }

    #[test]
    fn an_out_of_range_slot_count_is_clamped_not_honoured() {
        for count in [0usize, 1, 5, 99] {
            let layout = generate(Aspect::Square, 7, count);
            assert!(
                (MIN_SLOTS..=MAX_SLOTS).contains(&layout.slots.len()),
                "count {count} produced {} slots",
                layout.slots.len()
            );
        }
    }
}
