//! "Suggest a look": classifies a photo against a MobileNetV3-Small
//! ImageNet-1000 model (BSD-3-Clause, torchvision lineage; see the repo's
//! CLAUDE.md for the full sourcing/licensing note) via `rten` -- the same
//! pure-Rust ONNX runtime `budget_planner` already proved out for OCR,
//! reused here for a plain classifier instead. Gated behind the `vibe`
//! Cargo feature so `rten` never reaches the main `postcard-wasm`
//! bundle; only the lazily-loaded `postcard-wasm-vibe` crate enables it.
//!
//! **A real finding from building this, not assumed going in**: ImageNet
//! is an *object* dataset, not a *scene* dataset -- it has no "sunset" or
//! "night" class at all, and almost no signal for a person's portrait.
//! What it has in abundance is animal breeds (120+ dog breeds alone) and
//! a modest set of landscape/architecture/food classes. The category set
//! below (`Vibe`) reflects what this specific model can actually see, not
//! the aspirational scene list from the original research pass -- see
//! `IMAGENET_CLASS_TO_VIBE`'s own doc comment for the curation.
//!
//! Split into two functions on purpose: [`run_inference`] is the only
//! part that touches `rten`/the photo decoder and needs a real model file
//! to test; [`classify_vibe`] is plain arithmetic over a logits slice and
//! is fully testable with synthetic data, no model or wasm required.

#[cfg(feature = "vibe")]
use image::imageops::FilterType;
#[cfg(feature = "vibe")]
use postcard_core::{PostcardError, PostcardResult};

#[cfg(feature = "vibe")]
const INPUT_SIZE: u32 = 224;
#[cfg(feature = "vibe")]
const IMAGENET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
#[cfg(feature = "vibe")]
const IMAGENET_STD: [f32; 3] = [0.229, 0.224, 0.225];

/// Below this softmax confidence, the top class isn't worth surfacing as
/// a suggestion -- a low-confidence guess reads as the app being wrong,
/// not smart. Not tuned against a labeled postcard-photo test set (none
/// exists); a starting point to revisit once this ships and gets used.
const CONFIDENCE_FLOOR: f32 = 0.15;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Vibe {
    Beach,
    Mountain,
    Water,
    Architecture,
    Winter,
    Food,
    Pet,
}

impl Vibe {
    /// Stable string form for the wasm boundary -- see
    /// `postcard-wasm-vibe::convert`, which mirrors this by hand rather
    /// than deriving `serde::Serialize` here, so `postcard-calc` itself
    /// never needs a `serde` dependency for this feature-gated module
    /// alone.
    pub fn name(self) -> &'static str {
        match self {
            Vibe::Beach => "beach",
            Vibe::Mountain => "mountain",
            Vibe::Water => "water",
            Vibe::Architecture => "architecture",
            Vibe::Winter => "winter",
            Vibe::Food => "food",
            Vibe::Pet => "pet",
        }
    }
}

/// Hand-curated from the standard torchvision ImageNet-1000 class list
/// (index order fixed by the dataset, never reordered). Two dense ranges
/// (dog breeds, cat breeds) cover `Pet` -- ImageNet's single best-supported
/// category by far -- everything else is an explicit index because
/// scene/architecture/food classes are scattered individually through the
/// list, not grouped.
const IMAGENET_CLASS_TO_VIBE: &[(u16, Vibe)] = &[
    // Beach / coast
    (460, Vibe::Beach), // breakwater
    (536, Vibe::Beach), // dock
    (972, Vibe::Beach), // cliff
    (976, Vibe::Beach), // promontory
    (977, Vibe::Beach), // sandbar
    (978, Vibe::Beach), // seashore
    // Mountain / nature
    (970, Vibe::Mountain), // alp
    (974, Vibe::Mountain), // geyser
    (979, Vibe::Mountain), // valley
    (980, Vibe::Mountain), // volcano
    // Water
    (973, Vibe::Water), // coral reef
    (975, Vibe::Water), // lakeside
    // Architecture / city
    (483, Vibe::Architecture), // castle
    (497, Vibe::Architecture), // church
    (538, Vibe::Architecture), // dome
    (663, Vibe::Architecture), // monastery
    (698, Vibe::Architecture), // palace
    (829, Vibe::Architecture), // streetcar
    (839, Vibe::Architecture), // suspension bridge
    (888, Vibe::Architecture), // viaduct
    (900, Vibe::Architecture), // water tower
    // Winter
    (795, Vibe::Winter), // ski
    (796, Vibe::Winter), // ski mask
    (802, Vibe::Winter), // snowmobile
    // Food
    (532, Vibe::Food), // dining table
    (907, Vibe::Food), // wine bottle
    (922, Vibe::Food), // menu
    (923, Vibe::Food), // plate
    (924, Vibe::Food), // guacamole
    (927, Vibe::Food), // trifle
    (928, Vibe::Food), // ice cream
    (932, Vibe::Food), // pretzel
    (933, Vibe::Food), // cheeseburger
    (934, Vibe::Food), // hotdog
    (963, Vibe::Food), // pizza
    (965, Vibe::Food), // burrito
    (967, Vibe::Food), // espresso
];

/// Dog breeds, Chihuahua through Mexican hairless -- verified against the
/// canonical class list, index 269 (timber wolf) is deliberately excluded,
/// since a wild canid isn't the "cute pet" suggestion this is for.
const DOG_BREEDS: std::ops::RangeInclusive<u16> = 151..=268;
/// Domestic cat breeds: tabby, tiger cat, Persian, Siamese, Egyptian.
const CAT_BREEDS: std::ops::RangeInclusive<u16> = 281..=285;

fn vibe_for_class(class: u16) -> Option<Vibe> {
    if DOG_BREEDS.contains(&class) || CAT_BREEDS.contains(&class) {
        return Some(Vibe::Pet);
    }
    IMAGENET_CLASS_TO_VIBE
        .iter()
        .find(|&&(idx, _)| idx == class)
        .map(|&(_, v)| v)
}

/// Numerically-stable softmax over raw logits, then argmax -- pure
/// arithmetic, no model or wasm needed to test. Returns `None` if the
/// winning class isn't one this app has an opinion about, or the model
/// wasn't confident enough to be worth surfacing.
pub fn classify_vibe(logits: &[f32]) -> Option<(Vibe, f32)> {
    if logits.is_empty() {
        return None;
    }
    let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let exps: Vec<f32> = logits.iter().map(|&v| (v - max).exp()).collect();
    let sum: f32 = exps.iter().sum();
    if sum <= 0.0 {
        return None;
    }

    let (top_idx, &top_exp) = exps.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1))?;
    let confidence = top_exp / sum;
    if confidence < CONFIDENCE_FLOOR {
        return None;
    }

    vibe_for_class(u16::try_from(top_idx).ok()?).map(|vibe| (vibe, confidence))
}

/// Resizes and normalizes a decoded photo into the flat NCHW `f32` buffer
/// a `224x224` ImageNet classifier expects. `Triangle` (not this crate's
/// usual `Lanczos3`) to match the exact preprocessing `rten`'s own
/// reference `imagenet` example uses -- a classifier's accuracy is
/// sensitive to resize-filter mismatch with how it was validated, in a
/// way a postcard export's visual quality is not.
#[cfg(feature = "vibe")]
fn preprocess(photo: &image::DynamicImage) -> Vec<f32> {
    let resized = photo.resize_exact(INPUT_SIZE, INPUT_SIZE, FilterType::Triangle);
    let rgb = resized.to_rgb8();

    let mut chw = vec![0f32; 3 * (INPUT_SIZE as usize) * (INPUT_SIZE as usize)];
    let plane = (INPUT_SIZE * INPUT_SIZE) as usize;
    for (x, y, pixel) in rgb.enumerate_pixels() {
        let offset = (y * INPUT_SIZE + x) as usize;
        for c in 0..3 {
            let normalized = (f32::from(pixel.0[c]) / 255.0 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
            chw[c * plane + offset] = normalized;
        }
    }
    chw
}

#[cfg(feature = "vibe")]
/// Loads the model, decodes and preprocesses the photo, and runs one
/// forward pass, returning the raw 1000-way logits. The only part of
/// this module that touches `rten` or needs a real model file -- kept
/// separate from [`classify_vibe`] so the decision logic stays testable
/// without one.
pub fn run_inference(model_bytes: &[u8], photo_bytes: &[u8]) -> PostcardResult<Vec<f32>> {
    use rten::Model;
    use rten_tensor::prelude::*;
    use rten_tensor::{NdTensor, Tensor};

    if photo_bytes.is_empty() {
        return Err(PostcardError::EmptyImage);
    }

    let model = Model::load(model_bytes.to_vec())
        .map_err(|e| PostcardError::VibeModelLoadFailed(e.to_string()))?;

    let decoded = image::load_from_memory(photo_bytes)
        .map_err(|e| PostcardError::UnreadableImage(e.to_string()))?;
    let chw = preprocess(&decoded);
    let size = INPUT_SIZE as usize;
    let input: Tensor<f32> = Tensor::from_data(&[1, 3, size, size], chw);

    let output = model
        .run_one(input.view().into(), None)
        .map_err(|e| PostcardError::VibeClassifyFailed(e.to_string()))?;
    let logits: NdTensor<f32, 2> = output
        .try_into()
        .map_err(|_| PostcardError::VibeClassifyFailed("unexpected model output shape".into()))?;

    Ok(logits.iter().copied().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn logits_favoring(class: usize, value: f32) -> Vec<f32> {
        let mut logits = vec![0.0; 1000];
        logits[class] = value;
        logits
    }

    #[test]
    fn a_confident_dog_class_suggests_pet() {
        let logits = logits_favoring(200, 20.0); // well inside 151..=268
        let (vibe, confidence) = classify_vibe(&logits).unwrap();
        assert_eq!(vibe, Vibe::Pet);
        assert!(confidence > 0.9);
    }

    #[test]
    fn a_confident_seashore_class_suggests_beach() {
        let logits = logits_favoring(978, 20.0);
        assert_eq!(classify_vibe(&logits).unwrap().0, Vibe::Beach);
    }

    #[test]
    fn a_class_with_no_mapping_suggests_nothing() {
        // Index 0 is "tench" (a fish species) -- not in any curated range.
        let logits = logits_favoring(0, 20.0);
        assert_eq!(classify_vibe(&logits), None);
    }

    #[test]
    fn low_confidence_suggests_nothing_even_if_mapped() {
        // A near-uniform distribution: every class close to equally likely.
        let logits = vec![0.001; 1000];
        assert_eq!(classify_vibe(&logits), None);
    }

    #[test]
    fn empty_logits_suggest_nothing_rather_than_panicking() {
        assert_eq!(classify_vibe(&[]), None);
    }

    #[test]
    fn the_wolf_boundary_is_excluded_from_pet() {
        // Index 269 (timber wolf) is one past the last dog breed (268) --
        // a wild canid must not trigger the "cute pet" suggestion.
        let logits = logits_favoring(269, 20.0);
        assert_eq!(classify_vibe(&logits), None);
    }

    #[test]
    fn every_curated_index_is_within_imagenet_1000_bounds() {
        for &(idx, _) in IMAGENET_CLASS_TO_VIBE {
            assert!(idx < 1000, "index {idx} out of range");
        }
    }

    #[test]
    fn no_curated_index_collides_with_the_pet_ranges() {
        for &(idx, _) in IMAGENET_CLASS_TO_VIBE {
            assert!(
                !DOG_BREEDS.contains(&idx) && !CAT_BREEDS.contains(&idx),
                "index {idx} overlaps the Pet ranges"
            );
        }
    }
}
