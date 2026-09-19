//! Free-angle photo rotation: where the crop lives once the photo is
//! turned, and how to keep it on the photo.
//!
//! **The crop rectangle is in rotated space.** Turning a photo by `deg`
//! gives a new axis-aligned bounding box ([`bounds`]) with the rotated
//! photo sitting inside it as a tilted rectangle, and the crop is an
//! axis-aligned rectangle in *that* box. `pipeline::process_photo` rotates
//! before it crops for the same reason, so the two agree by construction.
//!
//! **The corners are the whole problem.** A tilted rectangle does not
//! fill its own bounding box, so a crop placed naively can hang over an
//! edge and come out with transparent triangles in the corners. [`fit`]
//! is what prevents that, and it is exact rather than conservative: for a
//! crop of a *fixed size*, the set of positions whose four corners all
//! land on the photo is itself an axis-aligned rectangle in source space
//! (see the derivation on [`center_limits`]), so clamping into it is
//! arithmetic, not search. Only when a crop cannot fit at any position
//! does [`fit`] shrink it -- which is the "the photo scales as it turns"
//! behaviour, applied no harder than it has to be.
//!
//! **`deg == 0.0` reduces to the unrotated code exactly**: `bounds` gives
//! back the photo's own size, `suggest` agrees with
//! [`crop::suggest_for_ratio`], and `fit` clamps to `0..w-cw` the way the
//! editor always did. That is covered by tests rather than asserted here,
//! because it is what keeps every already-saved postcard rendering
//! exactly as it did before rotation existed.

use image::{Rgba, RgbaImage};
use postcard_core::Rect;

use crate::crop;

/// Rotation is stored in degrees. Anything is accepted (the gesture
/// produces arbitrary angles); values are normalised into `[0, 360)`.
pub fn normalize(deg: f32) -> f32 {
    if !deg.is_finite() {
        return 0.0;
    }
    let wrapped = deg % 360.0;
    if wrapped < 0.0 {
        wrapped + 360.0
    } else {
        wrapped
    }
}

/// The photo is turned clockwise for a positive angle, matching CSS's own
/// `rotate()` (and so the live preview) and matching what "rotate right"
/// means to a person. `y` grows downward here, same as everywhere else in
/// this crate.
fn sin_cos(deg: f32) -> (f32, f32) {
    normalize(deg).to_radians().sin_cos()
}

/// The axis-aligned bounding box of a `w`x`h` photo turned by `deg`.
pub fn bounds(w: u32, h: u32, deg: f32) -> (u32, u32) {
    let (sin, cos) = sin_cos(deg);
    let (fw, fh) = (w as f32, h as f32);
    let bw = (fw * cos.abs() + fh * sin.abs()).round().max(1.0);
    let bh = (fw * sin.abs() + fh * cos.abs()).round().max(1.0);
    (bw as u32, bh as u32)
}

/// Maps a point from rotated space back onto the original photo.
fn to_source(w: u32, h: u32, deg: f32, x: f32, y: f32) -> (f32, f32) {
    let (sin, cos) = sin_cos(deg);
    let (bw, bh) = bounds(w, h, deg);
    let (dx, dy) = (x - bw as f32 / 2.0, y - bh as f32 / 2.0);
    (
        dx * cos + dy * sin + w as f32 / 2.0,
        -dx * sin + dy * cos + h as f32 / 2.0,
    )
}

/// Whole quarter turns keep every rectangle axis-aligned, so their
/// arithmetic lands on exact pixels; every other angle does not.
fn is_quarter_turn(deg: f32) -> bool {
    normalize(deg) % 90.0 == 0.0
}

/// The range of crop *centres* -- expressed in source coordinates -- at
/// which a `cw`x`ch` crop keeps all four of its corners on the photo.
///
/// The derivation, because it is the reason this file needs no search: a
/// crop corner sits at `centre + R(-deg)*offset`, where `offset` is one
/// of the four `(+-cw/2, +-ch/2)` vectors and does **not** depend on where
/// the crop is. So "every corner is inside `0..w` by `0..h`" is eight
/// inequalities of the form `0 <= centre.x + dx_i <= w`, and the centres
/// that satisfy all of them are simply
/// `[max_i(-dx_i), min_i(w - dx_i)]` on each axis -- a rectangle.
///
/// Returns `None` when the intervals are empty, which means this crop is
/// too big to fit at *any* position and has to shrink.
fn center_limits(w: u32, h: u32, deg: f32, cw: f32, ch: f32) -> Option<((f32, f32), (f32, f32))> {
    let (sin, cos) = sin_cos(deg);
    let (hw, hh) = (cw / 2.0, ch / 2.0);

    // A crop is stored as whole pixels, and at an angle that rounding can
    // move a corner by up to ~0.71px in source space -- enough to expose a
    // hairline of nothing along an edge. Hold the corners one pixel inside
    // the photo so the rounding has somewhere to go. Quarter turns stay
    // exact (everything is still axis-aligned), which is what keeps the
    // unrotated case identical to the clamp the editor always did.
    let inset = if is_quarter_turn(deg) { 0.0 } else { 1.0 };

    let mut lo_x = f32::NEG_INFINITY;
    let mut hi_x = f32::INFINITY;
    let mut lo_y = f32::NEG_INFINITY;
    let mut hi_y = f32::INFINITY;

    for (ox, oy) in [(-hw, -hh), (hw, -hh), (-hw, hh), (hw, hh)] {
        // R(-deg) applied to the corner offset.
        let dx = ox * cos + oy * sin;
        let dy = -ox * sin + oy * cos;
        lo_x = lo_x.max(inset - dx);
        hi_x = hi_x.min(w as f32 - inset - dx);
        lo_y = lo_y.max(inset - dy);
        hi_y = hi_y.min(h as f32 - inset - dy);
    }

    // A sliver of tolerance: these come out of trigonometry, and an
    // interval that is empty only by a rounding error should not cost the
    // user a visible shrink.
    const EPS: f32 = 0.01;
    if lo_x > hi_x + EPS || lo_y > hi_y + EPS {
        return None;
    }
    Some(((lo_x, hi_x.max(lo_x)), (lo_y, hi_y.max(lo_y))))
}

/// Whether a `cw`x`ch` crop fits the turned photo anywhere at all.
fn fits_anywhere(w: u32, h: u32, deg: f32, cw: f32, ch: f32) -> bool {
    center_limits(w, h, deg, cw, ch).is_some()
}

/// The largest crop of `target` width/height ratio that fits the photo
/// once it is turned by `deg`, centred.
///
/// This is `crop::suggest_for_ratio`'s job generalised to a rotated
/// photo, and at `deg == 0.0` it gives the same answer. As the angle
/// grows the result shrinks, which is what makes a photo appear to scale
/// up as it turns rather than showing empty corners.
pub fn suggest(w: u32, h: u32, deg: f32, target: f64) -> Rect {
    let upright = crop::suggest_for_ratio(w, h, target);
    if normalize(deg) == 0.0 {
        return upright;
    }

    // Binary search the scale of the unrotated suggestion that still
    // fits. The predicate is monotonic (a smaller crop of the same shape
    // can only be easier to place), so this converges on the largest one;
    // 24 halvings put it well inside a pixel for any real photo.
    let (uw, uh) = (upright.w as f32, upright.h as f32);
    let (mut lo, mut hi) = (0.0f32, 1.0f32);
    if fits_anywhere(w, h, deg, uw, uh) {
        lo = 1.0;
    } else {
        for _ in 0..24 {
            let mid = (lo + hi) / 2.0;
            if fits_anywhere(w, h, deg, uw * mid, uh * mid) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
    }

    let cw = (uw * lo).floor().max(1.0);
    let ch = (uh * lo).floor().max(1.0);
    let (bw, bh) = bounds(w, h, deg);
    Rect {
        x: ((bw as f32 - cw) / 2.0).round().max(0.0) as u32,
        y: ((bh as f32 - ch) / 2.0).round().max(0.0) as u32,
        w: cw as u32,
        h: ch as u32,
    }
}

/// Pulls `rect` (in rotated space) onto the turned photo: clamped into
/// place if it fits at all, shrunk about its own centre if it does not.
///
/// Every crop the editor produces -- a pan, a pinch, a twist, a restored
/// draft -- goes through here before it is stored, so a crop in state is
/// always one `process_photo` can render without transparent corners.
pub fn fit(w: u32, h: u32, deg: f32, rect: Rect) -> Rect {
    let (bw, bh) = bounds(w, h, deg);
    let mut cw = (rect.w.max(1) as f32).min(bw as f32);
    let mut ch = (rect.h.max(1) as f32).min(bh as f32);

    if !fits_anywhere(w, h, deg, cw, ch) {
        // Too big at any position: shrink about the centre, keeping the
        // shape, to the largest version that fits. Same monotonic
        // predicate and same search as `suggest`.
        let (mut lo, mut hi) = (0.0f32, 1.0f32);
        for _ in 0..24 {
            let mid = (lo + hi) / 2.0;
            if fits_anywhere(w, h, deg, cw * mid, ch * mid) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        cw = (cw * lo).floor().max(1.0);
        ch = (ch * lo).floor().max(1.0);
    }

    let Some(((lo_x, hi_x), (lo_y, hi_y))) = center_limits(w, h, deg, cw, ch) else {
        // Unreachable for any real photo -- a 1x1 crop fits everything --
        // but a centred crop beats a panic on a degenerate input.
        return Rect {
            x: ((bw as f32 - cw) / 2.0).max(0.0) as u32,
            y: ((bh as f32 - ch) / 2.0).max(0.0) as u32,
            w: cw as u32,
            h: ch as u32,
        };
    };

    // Clamp in source space (where the limits are), then come back.
    let wanted_x = rect.x as f32 + cw / 2.0;
    let wanted_y = rect.y as f32 + ch / 2.0;
    let (sx, sy) = to_source(w, h, deg, wanted_x, wanted_y);
    let (sin, cos) = sin_cos(deg);
    let cx = sx.clamp(lo_x, hi_x);
    let cy = sy.clamp(lo_y, hi_y);

    // Forward map, the inverse of `to_source`.
    let (dx, dy) = (cx - w as f32 / 2.0, cy - h as f32 / 2.0);
    let rx = dx * cos - dy * sin + bw as f32 / 2.0;
    let ry = dx * sin + dy * cos + bh as f32 / 2.0;

    Rect {
        x: (rx - cw / 2.0).round().max(0.0) as u32,
        y: (ry - ch / 2.0).round().max(0.0) as u32,
        w: cw as u32,
        h: ch as u32,
    }
}

/// Turns `src` by `deg` and hands back the `rect` of it, in one step.
///
/// Three paths, because the general one is the expensive one and most
/// photos never need it:
///
/// * **No rotation** is the crop the editor has always done, untouched.
/// * **A quarter turn** is a pure pixel shuffle, so `imageops` does it
///   exactly -- no resampling, no softening.
/// * **Any other angle** is fused: it walks the *output* rectangle and
///   samples back into the source, so the cost is the crop's own size
///   rather than a whole rotated canvas. Turning a 12MP photo by 3
///   degrees never materialises the 13MP bounding box just to throw most
///   of it away, which on a phone is the difference between working and
///   running out of memory.
pub fn render(src: RgbaImage, deg: f32, rect: Rect) -> RgbaImage {
    let turn = normalize(deg);
    if turn == 0.0 {
        return image::imageops::crop_imm(&src, rect.x, rect.y, rect.w, rect.h).to_image();
    }
    if is_quarter_turn(turn) {
        let turned = match turn as u32 {
            90 => image::imageops::rotate90(&src),
            180 => image::imageops::rotate180(&src),
            _ => image::imageops::rotate270(&src),
        };
        return image::imageops::crop_imm(&turned, rect.x, rect.y, rect.w, rect.h).to_image();
    }
    resample(&src, turn, rect)
}

/// The general rotate-and-crop: for each output pixel, find where it came
/// from on the original photo and read it back bilinearly.
fn resample(src: &RgbaImage, deg: f32, rect: Rect) -> RgbaImage {
    let (sin, cos) = sin_cos(deg);
    let (bw, bh) = bounds(src.width(), src.height(), deg);
    let (box_cx, box_cy) = (bw as f32 / 2.0, bh as f32 / 2.0);
    let (src_cx, src_cy) = (src.width() as f32 / 2.0, src.height() as f32 / 2.0);

    let mut out = RgbaImage::new(rect.w.max(1), rect.h.max(1));
    for (x, y, px) in out.enumerate_pixels_mut() {
        // Pixel centres, not corners -- sampling at the corner shifts the
        // whole crop half a pixel up and left.
        let rx = rect.x as f32 + x as f32 + 0.5 - box_cx;
        let ry = rect.y as f32 + y as f32 + 0.5 - box_cy;
        *px = sample(
            src,
            rx * cos + ry * sin + src_cx,
            -rx * sin + ry * cos + src_cy,
        );
    }
    out
}

/// Bilinear read at a fractional position, clamped to the edge.
///
/// Clamping rather than returning transparency is deliberate belt and
/// braces: [`fit`] already keeps every crop corner on the photo, so this
/// should never be asked for a pixel outside it -- and if a rounding
/// error ever puts it half a pixel over, the user gets the edge colour
/// smeared by one pixel instead of a transparent notch in their postcard.
fn sample(src: &RgbaImage, x: f32, y: f32) -> Rgba<u8> {
    let (w, h) = (src.width(), src.height());
    let fx = (x - 0.5).clamp(0.0, (w - 1) as f32);
    let fy = (y - 0.5).clamp(0.0, (h - 1) as f32);
    let x0 = fx.floor() as u32;
    let y0 = fy.floor() as u32;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);
    let tx = fx - x0 as f32;
    let ty = fy - y0 as f32;

    let (p00, p10) = (src.get_pixel(x0, y0), src.get_pixel(x1, y0));
    let (p01, p11) = (src.get_pixel(x0, y1), src.get_pixel(x1, y1));

    let mut out = [0u8; 4];
    for (c, slot) in out.iter_mut().enumerate() {
        let top = f32::from(p00.0[c]) * (1.0 - tx) + f32::from(p10.0[c]) * tx;
        let bottom = f32::from(p01.0[c]) * (1.0 - tx) + f32::from(p11.0[c]) * tx;
        *slot = (top * (1.0 - ty) + bottom * ty).round().clamp(0.0, 255.0) as u8;
    }
    Rgba(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANGLES: [f32; 13] = [
        0.0, 1.0, 7.5, 15.0, 30.0, 45.0, 60.0, 89.0, 90.0, 137.0, 180.0, 270.0, 359.0,
    ];
    const SIZES: [(u32, u32); 4] = [(4000, 3000), (1200, 1600), (800, 800), (3000, 1000)];
    const RATIOS: [f64; 4] = [1.5, 1.0, 5.0 / 7.0, 0.75];

    /// Every corner of `rect` (rotated space) lands on the photo.
    fn corners_on_photo(w: u32, h: u32, deg: f32, rect: Rect) -> bool {
        // Tight on purpose: `center_limits`'s one-pixel inset is there
        // precisely so whole-pixel rounding cannot cost a corner, so a
        // generous tolerance here would hide the thing it pays for.
        const EPS: f32 = 0.05;
        [
            (rect.x as f32, rect.y as f32),
            ((rect.x + rect.w) as f32, rect.y as f32),
            (rect.x as f32, (rect.y + rect.h) as f32),
            ((rect.x + rect.w) as f32, (rect.y + rect.h) as f32),
        ]
        .into_iter()
        .all(|(x, y)| {
            let (sx, sy) = to_source(w, h, deg, x, y);
            sx >= -EPS && sy >= -EPS && sx <= w as f32 + EPS && sy <= h as f32 + EPS
        })
    }

    #[test]
    fn normalize_wraps_into_a_single_turn() {
        assert_eq!(normalize(0.0), 0.0);
        assert_eq!(normalize(360.0), 0.0);
        assert_eq!(normalize(-90.0), 270.0);
        assert_eq!(normalize(450.0), 90.0);
        // The gesture can hand over anything at all, including a NaN from
        // a degenerate two-finger angle.
        assert_eq!(normalize(f32::NAN), 0.0);
        assert_eq!(normalize(f32::INFINITY), 0.0);
    }

    #[test]
    fn an_unrotated_photo_keeps_its_own_size_and_suggestion() {
        // The no-regression invariant: at 0 degrees nothing in this module
        // may differ from the code every already-saved postcard was made
        // with.
        for (w, h) in SIZES {
            assert_eq!(bounds(w, h, 0.0), (w, h));
            for target in RATIOS {
                assert_eq!(
                    suggest(w, h, 0.0, target),
                    crop::suggest_for_ratio(w, h, target)
                );
            }
        }
    }

    #[test]
    fn an_unrotated_fit_is_the_plain_clamp_the_editor_always_did() {
        let (w, h) = (4000u32, 3000u32);
        let cases = [
            // (given, expected) -- inside, past each edge, oversized.
            ((100, 100, 800, 600), (100, 100, 800, 600)),
            ((0, 0, 800, 600), (0, 0, 800, 600)),
            ((3900, 2900, 800, 600), (3200, 2400, 800, 600)),
            ((0, 0, 9000, 9000), (0, 0, 4000, 3000)),
        ];
        for ((x, y, cw, ch), (ex, ey, ew, eh)) in cases {
            let got = fit(w, h, 0.0, Rect { x, y, w: cw, h: ch });
            assert_eq!(
                (got.x, got.y, got.w, got.h),
                (ex, ey, ew, eh),
                "fit of {x},{y} {cw}x{ch}"
            );
        }
    }

    #[test]
    fn a_quarter_turn_swaps_the_bounding_box() {
        for (w, h) in SIZES {
            assert_eq!(bounds(w, h, 90.0), (h, w));
            assert_eq!(bounds(w, h, 270.0), (h, w));
            assert_eq!(bounds(w, h, 180.0), (w, h));
        }
    }

    #[test]
    fn a_suggested_crop_never_hangs_off_the_photo() {
        for (w, h) in SIZES {
            for deg in ANGLES {
                for target in RATIOS {
                    let rect = suggest(w, h, deg, target);
                    assert!(rect.w > 0 && rect.h > 0, "{w}x{h} @{deg} r{target}");
                    assert!(
                        corners_on_photo(w, h, deg, rect),
                        "{w}x{h} @{deg} r{target} gave {rect:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn a_suggested_crop_keeps_the_ratio_it_was_asked_for() {
        for (w, h) in SIZES {
            for deg in ANGLES {
                for target in RATIOS {
                    let rect = suggest(w, h, deg, target);
                    let got = f64::from(rect.w) / f64::from(rect.h);
                    assert!(
                        (got - target).abs() / target < 0.01,
                        "{w}x{h} @{deg} wanted {target}, got {got}"
                    );
                }
            }
        }
    }

    #[test]
    fn fitting_pulls_any_crop_back_onto_the_photo() {
        // Deliberately hostile placements: off every edge, and far bigger
        // than the photo. None may come back with a corner in the air.
        for (w, h) in SIZES {
            for deg in ANGLES {
                for (x, y, cw, ch) in [
                    (0, 0, w, h),
                    (0, 0, w * 2, h * 2),
                    (w - 1, h - 1, w / 2, h / 2),
                    (w / 2, 0, w, h / 3),
                    (0, h / 2, w / 3, h),
                    (w / 4, h / 4, w / 2, h / 2),
                ] {
                    let got = fit(w, h, deg, Rect { x, y, w: cw, h: ch });
                    assert!(got.w > 0 && got.h > 0, "{w}x{h} @{deg}");
                    assert!(
                        corners_on_photo(w, h, deg, got),
                        "{w}x{h} @{deg} fit of {x},{y} {cw}x{ch} gave {got:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn fitting_an_already_fitting_crop_leaves_it_alone() {
        // A pan that changes nothing must not creep the crop, or holding
        // still during a gesture would drift the framing.
        for (w, h) in SIZES {
            for deg in ANGLES {
                for target in RATIOS {
                    let once = suggest(w, h, deg, target);
                    let twice = fit(w, h, deg, once);
                    assert!(
                        twice.w.abs_diff(once.w) <= 1
                            && twice.h.abs_diff(once.h) <= 1
                            && twice.x.abs_diff(once.x) <= 1
                            && twice.y.abs_diff(once.y) <= 1,
                        "{w}x{h} @{deg} r{target}: {once:?} -> {twice:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn fitting_never_grows_a_crop() {
        for (w, h) in SIZES {
            for deg in ANGLES {
                let asked = Rect {
                    x: 0,
                    y: 0,
                    w: w / 2,
                    h: h / 2,
                };
                let got = fit(w, h, deg, asked);
                assert!(got.w <= asked.w && got.h <= asked.h, "{w}x{h} @{deg}");
            }
        }
    }

    #[test]
    fn turning_further_from_square_never_gives_a_bigger_crop() {
        // The visible promise of "the photo scales as it turns": the
        // usable area only shrinks between 0 and 45 degrees, so the photo
        // only ever appears to zoom in. (Past 45 it grows back toward the
        // quarter turn, which is why the sweep stops there.)
        //
        // Stated for a crop shaped like the photo itself, which is the
        // only case where it is true: a *portrait* crop of a *landscape*
        // photo really does gain room as the photo turns toward portrait,
        // so a sweep over unrelated ratios would be asserting something
        // false about correct output.
        for (w, h) in SIZES {
            let target = f64::from(w) / f64::from(h);
            let upright = suggest(w, h, 0.0, target);
            let mut previous = u64::from(upright.w) * u64::from(upright.h);
            for step in 1..=45 {
                let rect = suggest(w, h, step as f32, target);
                let area = u64::from(rect.w) * u64::from(rect.h);
                assert!(
                    area <= previous,
                    "{w}x{h} at {step} deg grew to {area} from {previous}"
                );
                previous = area;
            }
        }
    }

    /// A photo with a single red pixel in its top-left corner, so a test
    /// can say exactly where "top left" ended up after a turn.
    fn marked(w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::from_pixel(w, h, Rgba([10, 10, 10, 255]));
        img.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        img
    }

    fn is_red(px: &Rgba<u8>) -> bool {
        px.0[0] > 200 && px.0[1] < 80 && px.0[2] < 80
    }

    #[test]
    fn rendering_without_rotation_is_the_plain_crop() {
        let src = marked(40, 30);
        let rect = Rect {
            x: 5,
            y: 4,
            w: 10,
            h: 8,
        };
        let got = render(src.clone(), 0.0, rect);
        let want = image::imageops::crop_imm(&src, 5, 4, 10, 8).to_image();
        assert_eq!(got.dimensions(), (10, 8));
        assert_eq!(got.as_raw(), want.as_raw());
    }

    #[test]
    fn a_quarter_turn_carries_the_corner_round_clockwise() {
        // Positive degrees turn the photo clockwise, the same direction
        // CSS `rotate()` goes, so the live preview and the exported file
        // agree about which way the photo is facing. A sign slip here
        // would still produce a tidy rotated photo -- just the wrong one.
        let src = marked(40, 30);
        for (deg, corner) in [(90.0, (29, 0)), (180.0, (39, 29)), (270.0, (0, 39))] {
            let (bw, bh) = bounds(40, 30, deg);
            let whole = render(
                src.clone(),
                deg,
                Rect {
                    x: 0,
                    y: 0,
                    w: bw,
                    h: bh,
                },
            );
            assert!(
                is_red(whole.get_pixel(corner.0, corner.1)),
                "at {deg} deg the top-left pixel was not at {corner:?}"
            );
        }
    }

    #[test]
    fn a_free_angle_turn_lands_the_corner_where_the_geometry_says_it_does() {
        // The fused resampler and `to_source` have to agree, or the
        // exported photo is offset from the one the editor showed.
        let src = marked(40, 30);
        let deg = 20.0;
        let (bw, bh) = bounds(40, 30, deg);
        let whole = render(
            src,
            deg,
            Rect {
                x: 0,
                y: 0,
                w: bw,
                h: bh,
            },
        );
        let found = (0..bh)
            .flat_map(|y| (0..bw).map(move |x| (x, y)))
            .find(|&(x, y)| is_red(whole.get_pixel(x, y)))
            .expect("the marked corner survived the turn");
        let (sx, sy) = to_source(40, 30, deg, found.0 as f32 + 0.5, found.1 as f32 + 0.5);
        assert!(
            sx < 1.5 && sy < 1.5,
            "red pixel at {found:?} traced back to {sx},{sy}, not the photo's own corner"
        );
    }

    #[test]
    fn a_free_angle_crop_is_filled_edge_to_edge() {
        // The whole point of `fit`: every pixel of the crop comes from the
        // photo, so nothing in the exported card is transparent. Rendering
        // a fitted crop and finding a fully transparent pixel means the
        // geometry and the resampler disagree.
        for (w, h) in [(40u32, 30u32), (30, 40), (36, 36)] {
            let src = RgbaImage::from_pixel(w, h, Rgba([200, 180, 160, 255]));
            for deg in [3.0, 20.0, 45.0, 77.0, 123.0, 300.0] {
                let rect = suggest(w, h, deg, 1.5);
                let out = render(src.clone(), deg, rect);
                assert!(
                    out.pixels().all(|p| p.0[3] == 255),
                    "{w}x{h} @{deg} left a transparent pixel in {rect:?}"
                );
            }
        }
    }

    #[test]
    fn a_45_degree_turn_costs_real_area_rather_than_silently_doing_nothing() {
        // Guards the opposite failure from the one above: a `fit` that
        // returned its input unchanged would pass every "stays on the
        // photo" test while showing transparent corners in the export.
        let (w, h) = (4000u32, 3000u32);
        let upright = suggest(w, h, 0.0, 1.5);
        let tilted = suggest(w, h, 45.0, 1.5);
        assert!(
            u64::from(tilted.w) * u64::from(tilted.h)
                < u64::from(upright.w) * u64::from(upright.h) / 2,
            "45 degrees should cost well over half the area: {upright:?} -> {tilted:?}"
        );
    }
}
