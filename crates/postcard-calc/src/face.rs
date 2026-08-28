//! Counts faces in a photo -- not who they are, not their identity or
//! expression, just how many face-shaped regions are present. Exists
//! because "Suggest a look" `vibe::classify_top_vibes`'s classifier
//! (trained on ImageNet, an *object* dataset) has almost no signal for a
//! photo of people at all, so a portrait or group photo -- likely the
//! majority of real postcard photos -- would otherwise get nothing.
//! `exposureSuggestion.js` already covers "any photo, no recognition
//! needed"; this covers the other common gap: "there are people in this
//! photo, even though the object classifier found nothing to say about
//! it."
//!
//! Model: Ultra-Light-Fast-Generic-Face-Detector-1MB
//! (`version-slim-320_simplified.onnx`, MIT license, see the repo's
//! CLAUDE.md for the sourcing note), run through `rten` exactly like
//! `vibe::run_inference` runs MobileNet -- same crate, same lazy-loaded
//! `postcard-wasm-vibe`, gated behind the same `vibe` Cargo feature
//! since both need `rten` and are downloaded together on the same
//! "Suggest a look" tap.
//!
//! **A real finding, not assumed going in**: this model's ONNX export
//! does *not* bake in box decoding -- its raw output is SSD-style anchor
//! offsets, not ready-to-use coordinates. Verified with a standalone
//! spike against real photos before writing any of this: a naive
//! "treat the boxes output as normalized coordinates" reading produced
//! nonsense (coordinates far outside the photo, dozens of phantom faces
//! on a 4-person photo). The correct decode -- ported from the
//! reference repo's `box_utils.py`/`fd_config.py`, not guessed --
//! matched ground truth exactly on real test photos (4-for-4, 5-for-5).

#[cfg(feature = "vibe")]
use image::imageops::FilterType;
#[cfg(feature = "vibe")]
use postcard_core::{PostcardError, PostcardResult};

// Everything from here down to `count_faces_from_model_output` is pure
// arithmetic with no `rten`/wasm dependency, gated on `any(test, feature
// = "vibe"))` rather than just `feature = "vibe"`: it needs to compile
// unconditionally for its own unit tests (which run in a plain `cargo
// test`, no feature flags), but is genuinely dead code in a build that
// has neither tests nor the `vibe` feature enabled (e.g. `postcard-wasm`,
// which depends on this crate without that feature) -- this cfg keeps
// both cases warning-free.
#[cfg(any(test, feature = "vibe"))]
const INPUT_W: u32 = 320;
#[cfg(any(test, feature = "vibe"))]
const INPUT_H: u32 = 240;

/// Faces below this confidence aren't counted -- matches the reference
/// implementation's own `prob_threshold`, not a value tuned separately
/// for this app.
#[cfg(any(test, feature = "vibe"))]
const CONFIDENCE_THRESHOLD: f32 = 0.7;
/// Matches the reference implementation's own NMS `iou_threshold`.
#[cfg(any(test, feature = "vibe"))]
const NMS_IOU_THRESHOLD: f32 = 0.3;
#[cfg(any(test, feature = "vibe"))]
const CENTER_VARIANCE: f32 = 0.1;
#[cfg(any(test, feature = "vibe"))]
const SIZE_VARIANCE: f32 = 0.2;

// Ported from the reference repo's `fd_config.py` (`define_img_size(320)`)
// and `box_utils.py`'s `generate_priors` -- the four SSD feature-map
// layers this model was trained with, their box counts per spatial
// location, and the box-size scale each layer is responsible for. Not
// derived from first principles; these are the model's own training
// configuration, wrong if guessed. `shrinkage_list` from the original
// config cancels out algebraically against `image_size` in the prior
// formula, so the feature-map dimensions below double as the scale
// factors directly -- no separate stride list needed.
#[cfg(any(test, feature = "vibe"))]
const FEATURE_MAP_W: [u32; 4] = [40, 20, 10, 5];
#[cfg(any(test, feature = "vibe"))]
const FEATURE_MAP_H: [u32; 4] = [30, 15, 8, 4];
#[cfg(any(test, feature = "vibe"))]
const MIN_BOX_SIZES: [&[f32]; 4] = [
    &[10.0, 16.0, 24.0],
    &[32.0, 48.0],
    &[64.0, 96.0],
    &[128.0, 192.0, 256.0],
];

#[cfg(any(test, feature = "vibe"))]
#[derive(Clone, Copy, Debug, PartialEq)]
struct Prior {
    cx: f32,
    cy: f32,
    w: f32,
    h: f32,
}

/// The model's fixed anchor-box grid for its 320x240 input -- same for
/// every photo, so callers that only want the count (not the boxes
/// themselves) never need to touch this directly; see
/// [`count_faces_from_model_output`].
#[cfg(any(test, feature = "vibe"))]
fn generate_priors() -> Vec<Prior> {
    let mut priors = Vec::new();
    for layer in 0..FEATURE_MAP_W.len() {
        let fw = FEATURE_MAP_W[layer];
        let fh = FEATURE_MAP_H[layer];
        for j in 0..fh {
            for i in 0..fw {
                let x_center = (i as f32 + 0.5) / fw as f32;
                let y_center = (j as f32 + 0.5) / fh as f32;
                for &min_box in MIN_BOX_SIZES[layer] {
                    priors.push(Prior {
                        cx: x_center,
                        cy: y_center,
                        w: min_box / INPUT_W as f32,
                        h: min_box / INPUT_H as f32,
                    });
                }
            }
        }
    }
    priors
}

#[cfg(any(test, feature = "vibe"))]
fn iou(a: [f32; 4], b: [f32; 4]) -> f32 {
    let ix1 = a[0].max(b[0]);
    let iy1 = a[1].max(b[1]);
    let ix2 = a[2].min(b[2]);
    let iy2 = a[3].min(b[3]);
    let inter = (ix2 - ix1).max(0.0) * (iy2 - iy1).max(0.0);
    let area_a = (a[2] - a[0]).max(0.0) * (a[3] - a[1]).max(0.0);
    let area_b = (b[2] - b[0]).max(0.0) * (b[3] - b[1]).max(0.0);
    let union = area_a + area_b - inter;
    if union <= 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// Decodes the model's raw `confidences`/`locations` outputs into a face
/// count -- pure arithmetic over flat slices, no model or wasm needed to
/// test. `confidences` is the flattened `(num_priors, 2)` output
/// (background, face); `locations` is the flattened `(num_priors, 4)`
/// SSD offset output. Boxes are decoded into normalized 0..1
/// coordinates (an actual photo's aspect ratio doesn't change *how many*
/// survive threshold + NMS, only where they'd sit on screen, which this
/// caller doesn't need).
#[cfg(any(test, feature = "vibe"))]
fn count_faces_from_model_output(
    confidences: &[f32],
    locations: &[f32],
    priors: &[Prior],
) -> usize {
    let mut candidates: Vec<(f32, [f32; 4])> = Vec::new();
    for (i, prior) in priors.iter().enumerate() {
        let score = confidences[i * 2 + 1];
        if score <= CONFIDENCE_THRESHOLD {
            continue;
        }
        let lx = locations[i * 4];
        let ly = locations[i * 4 + 1];
        let lw = locations[i * 4 + 2];
        let lh = locations[i * 4 + 3];

        // SSD-style decode: see this module's own doc comment.
        let cx = lx * CENTER_VARIANCE * prior.w + prior.cx;
        let cy = ly * CENTER_VARIANCE * prior.h + prior.cy;
        let w = (lw * SIZE_VARIANCE).exp() * prior.w;
        let h = (lh * SIZE_VARIANCE).exp() * prior.h;
        candidates.push((
            score,
            [cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0],
        ));
    }
    candidates.sort_by(|a, b| b.0.total_cmp(&a.0));

    let mut kept: Vec<[f32; 4]> = Vec::new();
    for (_, b) in candidates {
        if kept.iter().all(|&kb| iou(kb, b) < NMS_IOU_THRESHOLD) {
            kept.push(b);
        }
    }
    kept.len()
}

#[cfg(feature = "vibe")]
fn preprocess(photo: &image::DynamicImage) -> Vec<f32> {
    let resized = photo.resize_exact(INPUT_W, INPUT_H, FilterType::Triangle);
    let rgb = resized.to_rgb8();

    let mut chw = vec![0f32; 3 * (INPUT_W as usize) * (INPUT_H as usize)];
    let plane = (INPUT_W * INPUT_H) as usize;
    for (x, y, pixel) in rgb.enumerate_pixels() {
        let offset = (y * INPUT_W + x) as usize;
        for c in 0..3 {
            // (pixel - 127) / 128 -- the reference model's own
            // normalization, not the ImageNet mean/std `vibe::preprocess`
            // uses; a different model trained a different way.
            chw[c * plane + offset] = (f32::from(pixel.0[c]) - 127.0) / 128.0;
        }
    }
    chw
}

#[cfg(feature = "vibe")]
/// Loads the face model, decodes and preprocesses the photo, runs one
/// forward pass, and returns the number of faces detected. Mirrors
/// `vibe::run_inference`'s split: this is the only part that touches
/// `rten` or the photo decoder; [`count_faces_from_model_output`] is the
/// pure decision logic, tested separately with synthetic data.
pub fn count_faces(model_bytes: &[u8], photo_bytes: &[u8]) -> PostcardResult<usize> {
    use rten::Model;
    use rten_tensor::prelude::*;
    use rten_tensor::{NdTensor, Tensor};

    if photo_bytes.is_empty() {
        return Err(PostcardError::EmptyImage);
    }

    let model = Model::load(model_bytes.to_vec())
        .map_err(|e| PostcardError::FaceModelLoadFailed(e.to_string()))?;

    let decoded = crate::pipeline::decode_oriented(photo_bytes)?;
    let chw = preprocess(&decoded);
    let input: Tensor<f32> = Tensor::from_data(&[1, 3, INPUT_H as usize, INPUT_W as usize], chw);

    let outputs = model
        .run(
            vec![(model.input_ids()[0], input.view().into())],
            model.output_ids(),
            None,
        )
        .map_err(|e| PostcardError::FaceDetectFailed(e.to_string()))?;

    let mut confidences: Option<NdTensor<f32, 3>> = None;
    let mut locations: Option<NdTensor<f32, 3>> = None;
    for output in outputs {
        let tensor: NdTensor<f32, 3> = output
            .try_into()
            .map_err(|_| PostcardError::FaceDetectFailed("unexpected model output shape".into()))?;
        if tensor.shape()[2] == 4 {
            locations = Some(tensor);
        } else {
            confidences = Some(tensor);
        }
    }
    let confidences = confidences.ok_or_else(|| {
        PostcardError::FaceDetectFailed("model did not return a confidences output".into())
    })?;
    let locations = locations.ok_or_else(|| {
        PostcardError::FaceDetectFailed("model did not return a locations output".into())
    })?;

    let priors = generate_priors();
    if locations.shape()[1] != priors.len() {
        return Err(PostcardError::FaceDetectFailed(format!(
            "expected {} priors, model produced {}",
            priors.len(),
            locations.shape()[1]
        )));
    }

    let confidences_flat: Vec<f32> = confidences.iter().copied().collect();
    let locations_flat: Vec<f32> = locations.iter().copied().collect();
    Ok(count_faces_from_model_output(
        &confidences_flat,
        &locations_flat,
        &priors,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn priors_for_test() -> Vec<Prior> {
        generate_priors()
    }

    fn flat_confidences(scores: &[(usize, f32)], num_priors: usize) -> Vec<f32> {
        let mut out = [1.0, 0.0].repeat(num_priors); // background-confident by default
        for &(i, score) in scores {
            out[i * 2] = 1.0 - score;
            out[i * 2 + 1] = score;
        }
        out
    }

    fn zero_locations(num_priors: usize) -> Vec<f32> {
        vec![0.0; num_priors * 4]
    }

    #[test]
    fn generates_exactly_4420_priors_for_the_320x240_input() {
        // 40*30*3 + 20*15*2 + 10*8*2 + 5*4*3 = 3600 + 600 + 160 + 60 = 4420 --
        // matches the real model's own output shape (verified via a live
        // spike against the actual ONNX file), not just this formula.
        assert_eq!(priors_for_test().len(), 4420);
    }

    #[test]
    fn no_confident_faces_counts_zero() {
        let priors = priors_for_test();
        let confidences = flat_confidences(&[], priors.len());
        let locations = zero_locations(priors.len());
        assert_eq!(
            count_faces_from_model_output(&confidences, &locations, &priors),
            0
        );
    }

    #[test]
    fn one_confident_detection_counts_one() {
        let priors = priors_for_test();
        let confidences = flat_confidences(&[(100, 0.95)], priors.len());
        let locations = zero_locations(priors.len());
        assert_eq!(
            count_faces_from_model_output(&confidences, &locations, &priors),
            1
        );
    }

    #[test]
    fn below_threshold_confidence_is_not_counted() {
        let priors = priors_for_test();
        let confidences = flat_confidences(&[(100, 0.5)], priors.len());
        let locations = zero_locations(priors.len());
        assert_eq!(
            count_faces_from_model_output(&confidences, &locations, &priors),
            0
        );
    }

    #[test]
    fn overlapping_detections_for_the_same_face_are_merged_by_nms() {
        // Two adjacent priors both firing confidently on the same face --
        // real models do this constantly (many anchors overlap the same
        // object) -- should collapse to one via IoU-based suppression,
        // not be double-counted.
        let priors = priors_for_test();
        // Two priors at neighboring grid cells within the same layer/box
        // size will have near-identical, heavily overlapping boxes at
        // zero offset (locations all zero => box == prior box).
        let confidences = flat_confidences(&[(100, 0.95), (101, 0.9)], priors.len());
        let locations = zero_locations(priors.len());
        let count = count_faces_from_model_output(&confidences, &locations, &priors);
        assert_eq!(
            count, 1,
            "adjacent overlapping priors should merge into one face"
        );
    }

    #[test]
    fn two_widely_separated_detections_both_count() {
        let priors = priors_for_test();
        // Index 0 (top-left grid cell) and an index from the last layer
        // (bottom-right area, very different box size/position) --
        // shouldn't overlap enough to be suppressed.
        let last = priors.len() - 1;
        let confidences = flat_confidences(&[(0, 0.95), (last, 0.9)], priors.len());
        let locations = zero_locations(priors.len());
        assert_eq!(
            count_faces_from_model_output(&confidences, &locations, &priors),
            2
        );
    }
}
