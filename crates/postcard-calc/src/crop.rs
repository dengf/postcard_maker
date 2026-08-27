use postcard_core::{Aspect, PostcardError, PostcardResult, Rect};

/// The largest centered crop of `(image_w, image_h)` matching `aspect`.
/// This is a suggestion, not a requirement -- the editor lets the user
/// drag the crop afterward, and `validate` is what actually gets enforced.
pub fn suggest(image_w: u32, image_h: u32, aspect: Aspect) -> Rect {
    let target = aspect.ratio_f64();
    let image_ratio = f64::from(image_w) / f64::from(image_h);

    let (w, h) = if image_ratio > target {
        // Image is relatively wider than the target: height is the
        // limiting dimension.
        let h = image_h;
        let w = ((f64::from(h) * target).round() as u32).min(image_w).max(1);
        (w, h)
    } else {
        let w = image_w;
        let h = ((f64::from(w) / target).round() as u32).min(image_h).max(1);
        (w, h)
    };

    Rect {
        x: (image_w - w) / 2,
        y: (image_h - h) / 2,
        w,
        h,
    }
}

/// Confirms a (possibly user-adjusted) crop rectangle actually fits inside
/// the source photo. The editor's drag handles are clamped in JS already,
/// so this is a defense against a stale rect surviving a photo swap, not
/// the primary guard.
pub fn validate(image_w: u32, image_h: u32, rect: Rect) -> PostcardResult<()> {
    let fits = rect.w > 0
        && rect.h > 0
        && rect.x.saturating_add(rect.w) <= image_w
        && rect.y.saturating_add(rect.h) <= image_h;

    if fits {
        Ok(())
    } else {
        Err(PostcardError::CropOutOfBounds(format!(
            "{}x{}+{}+{} in a {}x{} photo",
            rect.w, rect.h, rect.x, rect.y, image_w, image_h
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggests_a_centered_crop_for_a_wider_image() {
        // 400x100 image (4:1), landscape target is 3:2 -- height-limited.
        let rect = suggest(400, 100, Aspect::Landscape);
        assert_eq!(rect.h, 100);
        assert_eq!(rect.w, 150);
        assert_eq!(rect.x, (400 - 150) / 2);
        assert_eq!(rect.y, 0);
    }

    #[test]
    fn suggests_a_centered_crop_for_a_taller_image() {
        // 100x400 image (1:4), square target is 1:1 -- width-limited.
        let rect = suggest(100, 400, Aspect::Square);
        assert_eq!(rect.w, 100);
        assert_eq!(rect.h, 100);
        assert_eq!(rect.y, (400 - 100) / 2);
        assert_eq!(rect.x, 0);
    }

    #[test]
    fn suggested_crop_always_validates() {
        for (w, h) in [(4000, 3000), (300, 300), (200, 1000), (7, 5000)] {
            for aspect in [Aspect::Landscape, Aspect::Square, Aspect::Portrait] {
                let rect = suggest(w, h, aspect);
                assert!(validate(w, h, rect).is_ok(), "{aspect:?} on {w}x{h}");
            }
        }
    }

    #[test]
    fn rejects_a_rect_hanging_off_the_edge() {
        let err = validate(
            100,
            100,
            Rect {
                x: 50,
                y: 50,
                w: 60,
                h: 10,
            },
        );
        assert!(matches!(err, Err(PostcardError::CropOutOfBounds(_))));
    }

    #[test]
    fn rejects_a_zero_sized_rect() {
        assert!(validate(
            100,
            100,
            Rect {
                x: 0,
                y: 0,
                w: 0,
                h: 10
            }
        )
        .is_err());
    }
}
