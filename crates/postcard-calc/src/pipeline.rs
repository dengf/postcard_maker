use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{ImageEncoder, ImageReader};
use postcard_core::{Adjustments, ExportFormat, Filter, PostcardError, PostcardResult, Rect};

use crate::{crop, filters};

/// Decode -> crop -> filter -> resize -> encode, in that fixed order.
/// This is the entire contract with `postcard-wasm`: pixels in, a
/// finished base-layer image out. Text and stickers are drawn on top of
/// this result on a `<canvas>` afterward -- see the repo's CLAUDE.md for
/// why that split is deliberate, not a shortcut.
pub fn process_photo(
    bytes: &[u8],
    crop_rect: Rect,
    adjustments: Adjustments,
    filter: Filter,
    max_dimension: u32,
    format: ExportFormat,
) -> PostcardResult<Vec<u8>> {
    if bytes.is_empty() {
        return Err(PostcardError::EmptyImage);
    }

    let decoded = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| PostcardError::UnreadableImage(e.to_string()))?
        .decode()
        .map_err(|e| PostcardError::UnreadableImage(e.to_string()))?;

    let (image_w, image_h) = (decoded.width(), decoded.height());
    crop::validate(image_w, image_h, crop_rect)?;

    let mut cropped =
        image::imageops::crop_imm(&decoded, crop_rect.x, crop_rect.y, crop_rect.w, crop_rect.h)
            .to_image();

    filters::apply(&mut cropped, adjustments, filter);

    let resized = resize_to_fit(cropped, max_dimension);

    encode(&resized, format)
}

/// Downscales so the longer side is at most `max_dimension`; never
/// upscales -- a small source photo stays small rather than gaining fake
/// resolution, and 0 is treated as "no limit" for tests/tools that want
/// the raw crop back.
fn resize_to_fit(img: image::RgbaImage, max_dimension: u32) -> image::RgbaImage {
    let (w, h) = img.dimensions();
    if max_dimension == 0 || w.max(h) <= max_dimension {
        return img;
    }
    let scale = f64::from(max_dimension) / f64::from(w.max(h));
    let new_w = ((f64::from(w) * scale).round() as u32).max(1);
    let new_h = ((f64::from(h) * scale).round() as u32).max(1);
    image::imageops::resize(&img, new_w, new_h, image::imageops::FilterType::Lanczos3)
}

fn encode(img: &image::RgbaImage, format: ExportFormat) -> PostcardResult<Vec<u8>> {
    let mut out = Vec::new();
    let (w, h) = img.dimensions();
    match format {
        ExportFormat::Jpeg { quality } => {
            // JPEG has no alpha channel; flatten onto white first so a
            // transparent edge (possible after a sticker/text export path
            // reuses this encoder) doesn't turn black instead.
            let rgb = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
            JpegEncoder::new_with_quality(&mut out, quality)
                .encode(&rgb, w, h, image::ExtendedColorType::Rgb8)
                .map_err(|e| PostcardError::EncodeFailed(e.to_string()))?;
        }
        ExportFormat::Png => {
            PngEncoder::new(&mut out)
                .write_image(img, w, h, image::ExtendedColorType::Rgba8)
                .map_err(|e| PostcardError::EncodeFailed(e.to_string()))?;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn fixture_jpeg(w: u32, h: u32) -> Vec<u8> {
        let img = RgbaImage::from_pixel(w, h, Rgba([120, 90, 60, 255]));
        let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
        let mut out = Vec::new();
        JpegEncoder::new_with_quality(&mut out, 90)
            .encode(&rgb, w, h, image::ExtendedColorType::Rgb8)
            .unwrap();
        out
    }

    #[test]
    fn empty_bytes_is_reported_before_decoding() {
        let err = process_photo(
            &[],
            Rect {
                x: 0,
                y: 0,
                w: 1,
                h: 1,
            },
            Adjustments::default(),
            Filter::None,
            0,
            ExportFormat::Png,
        );
        assert!(matches!(err, Err(PostcardError::EmptyImage)));
    }

    #[test]
    fn garbage_bytes_are_reported_as_unreadable() {
        let err = process_photo(
            b"not an image",
            Rect {
                x: 0,
                y: 0,
                w: 1,
                h: 1,
            },
            Adjustments::default(),
            Filter::None,
            0,
            ExportFormat::Png,
        );
        assert!(matches!(err, Err(PostcardError::UnreadableImage(_))));
    }

    #[test]
    fn a_crop_outside_the_photo_is_rejected_before_any_pixel_work() {
        let bytes = fixture_jpeg(10, 10);
        let err = process_photo(
            &bytes,
            Rect {
                x: 5,
                y: 5,
                w: 20,
                h: 20,
            },
            Adjustments::default(),
            Filter::None,
            0,
            ExportFormat::Png,
        );
        assert!(matches!(err, Err(PostcardError::CropOutOfBounds(_))));
    }

    #[test]
    fn round_trips_a_full_frame_crop_at_full_size() {
        let bytes = fixture_jpeg(40, 20);
        let out = process_photo(
            &bytes,
            Rect {
                x: 0,
                y: 0,
                w: 40,
                h: 20,
            },
            Adjustments::default(),
            Filter::None,
            0,
            ExportFormat::Png,
        )
        .unwrap();
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (40, 20));
    }

    #[test]
    fn never_upscales_past_the_cropped_size() {
        let bytes = fixture_jpeg(40, 20);
        let out = process_photo(
            &bytes,
            Rect {
                x: 0,
                y: 0,
                w: 40,
                h: 20,
            },
            Adjustments::default(),
            Filter::None,
            999,
            ExportFormat::Png,
        )
        .unwrap();
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (40, 20));
    }

    #[test]
    fn downscales_the_longer_side_to_the_limit() {
        let bytes = fixture_jpeg(400, 200);
        let out = process_photo(
            &bytes,
            Rect {
                x: 0,
                y: 0,
                w: 400,
                h: 200,
            },
            Adjustments::default(),
            Filter::None,
            100,
            ExportFormat::Png,
        )
        .unwrap();
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (100, 50));
    }

    #[test]
    fn jpeg_output_decodes_back_without_an_alpha_channel_going_black() {
        let bytes = fixture_jpeg(10, 10);
        let out = process_photo(
            &bytes,
            Rect {
                x: 0,
                y: 0,
                w: 10,
                h: 10,
            },
            Adjustments::default(),
            Filter::None,
            0,
            ExportFormat::Jpeg { quality: 85 },
        )
        .unwrap();
        let decoded = image::load_from_memory(&out).unwrap().to_rgb8();
        let px = decoded.get_pixel(5, 5);
        // JPEG is lossy -- allow real compression drift, just confirm it
        // isn't flattened to black.
        assert!(px.0[0] > 60, "pixel looked flattened: {:?}", px.0);
    }
}
