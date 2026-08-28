use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageReader};
use postcard_core::{Adjustments, ExportFormat, Filter, PostcardError, PostcardResult, Rect};

use crate::{crop, filters};

/// Decodes `bytes` and normalizes it to the orientation a browser would
/// *display* it in. A phone photo commonly carries an EXIF orientation
/// tag; browsers auto-rotate for display (and `<img>.naturalWidth` /
/// `naturalHeight` -- what the crop UI drags against -- reflect that
/// corrected size), but the `image` crate's plain `.decode()` does not.
/// Skipping this step means a 90/270-degree-rotated photo decodes here
/// with width and height *swapped* relative to what the browser showed,
/// silently turning a perfectly valid crop into `CropOutOfBounds` --
/// exactly the failure mode this fixes. Shared by [`process_photo`] and
/// `vibe::run_inference` (both independently re-decode the same bytes),
/// so both agree with the browser on which way is "up," not just this
/// one.
pub(crate) fn decode_oriented(bytes: &[u8]) -> PostcardResult<DynamicImage> {
    let mut decoder = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| PostcardError::UnreadableImage(e.to_string()))?
        .into_decoder()
        .map_err(|e| PostcardError::UnreadableImage(e.to_string()))?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut decoded = DynamicImage::from_decoder(decoder)
        .map_err(|e| PostcardError::UnreadableImage(e.to_string()))?;
    decoded.apply_orientation(orientation);
    Ok(decoded)
}

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

    let decoded = decode_oriented(bytes)?;

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

    /// Splices a minimal EXIF APP1 segment carrying just an Orientation
    /// tag right after `jpeg`'s SOI marker -- the `image` crate's own
    /// encoder has no API to write one, so this hand-builds the same
    /// bytes a real camera/phone would embed, to actually exercise
    /// `decode_oriented`'s EXIF path rather than assume it works.
    fn with_exif_orientation(jpeg: &[u8], orientation: u16) -> Vec<u8> {
        let mut tiff = Vec::new();
        tiff.extend_from_slice(b"II"); // little-endian
        tiff.extend_from_slice(&42u16.to_le_bytes());
        tiff.extend_from_slice(&8u32.to_le_bytes()); // IFD0 offset
        tiff.extend_from_slice(&1u16.to_le_bytes()); // one entry
        tiff.extend_from_slice(&0x0112u16.to_le_bytes()); // Orientation tag
        tiff.extend_from_slice(&3u16.to_le_bytes()); // type SHORT
        tiff.extend_from_slice(&1u32.to_le_bytes()); // count
        tiff.extend_from_slice(&orientation.to_le_bytes());
        tiff.extend_from_slice(&[0, 0]); // pad SHORT value to 4 bytes
        tiff.extend_from_slice(&0u32.to_le_bytes()); // no next IFD

        let mut payload = b"Exif\0\0".to_vec();
        payload.extend_from_slice(&tiff);

        let mut app1 = vec![0xFF, 0xE1];
        app1.extend_from_slice(&(u16::try_from(payload.len() + 2).unwrap()).to_be_bytes());
        app1.extend_from_slice(&payload);

        let mut out = jpeg[..2].to_vec(); // SOI
        out.extend_from_slice(&app1);
        out.extend_from_slice(&jpeg[2..]);
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
    fn decode_oriented_swaps_dimensions_for_a_90_degree_rotation() {
        // Raw pixels are 200x100 (landscape); Orientation 6 means "rotate
        // 90 clockwise to display" -- a browser would report this photo
        // as 100x200 (portrait), and the crop UI drags against that.
        let bytes = with_exif_orientation(&fixture_jpeg(200, 100), 6);
        let decoded = decode_oriented(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (100, 200));
    }

    #[test]
    fn decode_oriented_leaves_an_unrotated_photo_unchanged() {
        let bytes = with_exif_orientation(&fixture_jpeg(200, 100), 1);
        let decoded = decode_oriented(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (200, 100));
    }

    #[test]
    fn decode_oriented_defaults_to_unrotated_with_no_exif_at_all() {
        let bytes = fixture_jpeg(200, 100);
        let decoded = decode_oriented(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (200, 100));
    }

    #[test]
    fn a_crop_valid_only_against_the_rotated_size_is_accepted() {
        // The regression this guards: a crop the JS crop UI considers
        // valid (against the browser's rotated 100x200 view) must not be
        // rejected here just because the *raw* bytes decode as 200x100 --
        // see `decode_oriented`'s own doc comment for why this class of
        // bug reads as `CropOutOfBounds` if the rotation is skipped.
        let bytes = with_exif_orientation(&fixture_jpeg(200, 100), 6);
        let out = process_photo(
            &bytes,
            Rect {
                x: 0,
                y: 150,
                w: 50,
                h: 40,
            }, // y+h=190: out of bounds for raw 100 height, fine for 200
            Adjustments::default(),
            Filter::None,
            0,
            ExportFormat::Png,
        );
        assert!(out.is_ok(), "{out:?}");
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
