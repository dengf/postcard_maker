use image::RgbaImage;
use postcard_core::{Adjustments, Filter};

/// Applies the continuous brightness/contrast/saturation adjustment and
/// then the named stylistic filter, in place. This order is deliberate:
/// a named filter is a "look" laid on top of whatever the user already
/// tuned, not a replacement for it, so it runs last.
pub fn apply(img: &mut RgbaImage, adjustments: Adjustments, filter: Filter) {
    adjust(img, adjustments);
    match filter {
        Filter::None => {}
        Filter::Grayscale => grayscale(img),
        Filter::Sepia => sepia(img),
        Filter::Vintage => vintage(img),
    }
}

fn clamp_u8(v: f32) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

fn luma(r: f32, g: f32, b: f32) -> f32 {
    0.299 * r + 0.587 * g + 0.114 * b
}

/// Brightness (additive), contrast (multiplicative around mid-gray) and
/// saturation (lerp toward the pixel's own luma) -- the three sliders
/// every photo carries regardless of which named filter is chosen.
/// `Adjustments::default()` is the identity: this is a no-op on it.
fn adjust(img: &mut RgbaImage, a: Adjustments) {
    if a.brightness == 0.0 && a.contrast == 1.0 && a.saturation == 1.0 {
        return;
    }
    let brightness = a.brightness * 255.0;
    for px in img.pixels_mut() {
        let [r, g, b, alpha] = px.0;
        let mut r = f32::from(r);
        let mut g = f32::from(g);
        let mut b = f32::from(b);

        // Contrast around mid-gray, then brightness, matching the order a
        // photo editor's sliders are conventionally understood to apply.
        r = (r - 128.0) * a.contrast + 128.0 + brightness;
        g = (g - 128.0) * a.contrast + 128.0 + brightness;
        b = (b - 128.0) * a.contrast + 128.0 + brightness;

        if a.saturation != 1.0 {
            let gray = luma(r, g, b);
            r = gray + (r - gray) * a.saturation;
            g = gray + (g - gray) * a.saturation;
            b = gray + (b - gray) * a.saturation;
        }

        px.0 = [clamp_u8(r), clamp_u8(g), clamp_u8(b), alpha];
    }
}

fn grayscale(img: &mut RgbaImage) {
    for px in img.pixels_mut() {
        let [r, g, b, alpha] = px.0;
        let v = clamp_u8(luma(f32::from(r), f32::from(g), f32::from(b)));
        px.0 = [v, v, v, alpha];
    }
}

/// The standard sepia transform matrix.
fn sepia(img: &mut RgbaImage) {
    for px in img.pixels_mut() {
        let [r, g, b, alpha] = px.0;
        let (r, g, b) = (f32::from(r), f32::from(g), f32::from(b));
        let sr = 0.393 * r + 0.769 * g + 0.189 * b;
        let sg = 0.349 * r + 0.686 * g + 0.168 * b;
        let sb = 0.272 * r + 0.534 * g + 0.131 * b;
        px.0 = [clamp_u8(sr), clamp_u8(sg), clamp_u8(sb), alpha];
    }
}

/// Faded tone curve (lifted shadows, rolled-off highlights), a light
/// desaturation, and a radial vignette -- the "old photograph" look.
fn vintage(img: &mut RgbaImage) {
    let (w, h) = img.dimensions();
    let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
    let max_dist = (cx * cx + cy * cy).sqrt().max(1.0);

    for (x, y, px) in img.enumerate_pixels_mut() {
        let [r, g, b, alpha] = px.0;
        let (mut r, mut g, mut b) = (f32::from(r), f32::from(g), f32::from(b));

        // Lift shadows, compress highlights: a gentle S-curve inverse.
        r = 20.0 + r * 0.82;
        g = 15.0 + g * 0.80;
        b = 10.0 + b * 0.75;

        // Light desaturation toward the pixel's own luma.
        let gray = luma(r, g, b);
        let mix = 0.75;
        r = gray + (r - gray) * mix;
        g = gray + (g - gray) * mix;
        b = gray + (b - gray) * mix;

        // Radial vignette: up to ~35% darker at the corners.
        let dx = x as f32 - cx;
        let dy = y as f32 - cy;
        let dist = (dx * dx + dy * dy).sqrt() / max_dist;
        let vignette = 1.0 - 0.35 * dist.powf(2.0);

        px.0 = [
            clamp_u8(r * vignette),
            clamp_u8(g * vignette),
            clamp_u8(b * vignette),
            alpha,
        ];
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn solid(w: u32, h: u32, color: [u8; 4]) -> RgbaImage {
        RgbaImage::from_pixel(w, h, Rgba(color))
    }

    #[test]
    fn default_adjustments_are_the_identity() {
        let mut img = solid(4, 4, [10, 120, 230, 255]);
        let before = img.clone();
        apply(&mut img, Adjustments::default(), Filter::None);
        assert_eq!(img, before);
    }

    #[test]
    fn grayscale_makes_every_channel_equal() {
        let mut img = solid(2, 2, [10, 120, 230, 255]);
        apply(&mut img, Adjustments::default(), Filter::Grayscale);
        for px in img.pixels() {
            assert_eq!(px.0[0], px.0[1]);
            assert_eq!(px.0[1], px.0[2]);
        }
    }

    #[test]
    fn zero_saturation_matches_grayscale() {
        let mut img = solid(2, 2, [10, 120, 230, 255]);
        let adjustments = Adjustments {
            saturation: 0.0,
            ..Adjustments::default()
        };
        apply(&mut img, adjustments, Filter::None);
        for px in img.pixels() {
            assert_eq!(px.0[0], px.0[1]);
            assert_eq!(px.0[1], px.0[2]);
        }
    }

    #[test]
    fn alpha_channel_is_never_touched() {
        let mut img = solid(2, 2, [200, 50, 50, 137]);
        apply(&mut img, Adjustments::default(), Filter::Vintage);
        for px in img.pixels() {
            assert_eq!(px.0[3], 137);
        }
    }

    #[test]
    fn brightness_raises_every_channel() {
        let mut img = solid(2, 2, [50, 50, 50, 255]);
        let adjustments = Adjustments {
            brightness: 0.2,
            ..Adjustments::default()
        };
        apply(&mut img, adjustments, Filter::None);
        for px in img.pixels() {
            assert!(px.0[0] > 50);
        }
    }

    #[test]
    fn vignette_darkens_a_corner_more_than_the_center() {
        let mut img = solid(20, 20, [200, 200, 200, 255]);
        apply(&mut img, Adjustments::default(), Filter::Vintage);
        let center = img.get_pixel(10, 10).0[0];
        let corner = img.get_pixel(0, 0).0[0];
        assert!(
            corner < center,
            "corner {corner} should be darker than center {center}"
        );
    }
}
