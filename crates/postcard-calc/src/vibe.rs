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
//! to test; [`classify_top_vibes`]/[`classify_vibe`] are plain arithmetic
//! over a logits slice and are fully testable with synthetic data, no
//! model or wasm required.

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
/// (index order fixed by the dataset, never reordered), verified index by
/// index against the canonical class list rather than assumed from
/// memory. Two dense ranges (dog breeds, cat breeds) cover `Pet` --
/// ImageNet's single best-supported category by far -- everything else
/// is an explicit index because scene/architecture/food classes are
/// scattered individually through the list, not grouped.
///
/// `Food` is by far the largest explicit list here, disproportionate to
/// the other six -- not an oversight, a reflection of the dataset: 1000
/// classes include dozens of individual fruits, vegetables and dishes
/// (this list doesn't even exhaust them), the same reason `Pet`'s two
/// ranges alone dwarf every other category. Widened once already after
/// early real-world use turned up too many "no suggestion" results.
const IMAGENET_CLASS_TO_VIBE: &[(u16, Vibe)] = &[
    // Beach / coast
    (144, Vibe::Beach), // pelican
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
    (107, Vibe::Water), // jellyfish
    (108, Vibe::Water), // sea anemone
    (109, Vibe::Water), // brain coral
    (146, Vibe::Water), // albatross
    (147, Vibe::Water), // grey whale
    (148, Vibe::Water), // killer whale
    (149, Vibe::Water), // dugong
    (150, Vibe::Water), // sea lion
    (392, Vibe::Water), // rock beauty
    (393, Vibe::Water), // anemone fish
    (396, Vibe::Water), // lionfish
    (397, Vibe::Water), // puffer
    (449, Vibe::Water), // boathouse
    (484, Vibe::Water), // catamaran
    (576, Vibe::Water), // gondola
    (801, Vibe::Water), // snorkel
    (814, Vibe::Water), // speedboat
    (973, Vibe::Water), // coral reef
    (975, Vibe::Water), // lakeside
    // Architecture / city
    (415, Vibe::Architecture), // bakery
    (425, Vibe::Architecture), // barn
    (483, Vibe::Architecture), // castle
    (497, Vibe::Architecture), // church
    (498, Vibe::Architecture), // cinema
    (500, Vibe::Architecture), // cliff dwelling
    (538, Vibe::Architecture), // dome
    (562, Vibe::Architecture), // fountain
    (624, Vibe::Architecture), // library
    (649, Vibe::Architecture), // megalith
    (663, Vibe::Architecture), // monastery
    (668, Vibe::Architecture), // mosque
    (698, Vibe::Architecture), // palace
    (821, Vibe::Architecture), // steel arch bridge
    (829, Vibe::Architecture), // streetcar
    (832, Vibe::Architecture), // stupa
    (839, Vibe::Architecture), // suspension bridge
    (873, Vibe::Architecture), // triumphal arch
    (888, Vibe::Architecture), // viaduct
    (900, Vibe::Architecture), // water tower
    (915, Vibe::Architecture), // yurt
    // Winter
    (145, Vibe::Winter), // king penguin
    (296, Vibe::Winter), // ice bear
    (658, Vibe::Winter), // mitten
    (795, Vibe::Winter), // ski
    (796, Vibe::Winter), // ski mask
    (802, Vibe::Winter), // snowmobile
    (803, Vibe::Winter), // snowplow
    // Food
    (532, Vibe::Food), // dining table
    (599, Vibe::Food), // honeycomb
    (809, Vibe::Food), // soup bowl
    (907, Vibe::Food), // wine bottle
    (922, Vibe::Food), // menu
    (923, Vibe::Food), // plate
    (924, Vibe::Food), // guacamole
    (925, Vibe::Food), // consomme
    (926, Vibe::Food), // hot pot
    (927, Vibe::Food), // trifle
    (928, Vibe::Food), // ice cream
    (929, Vibe::Food), // ice lolly
    (930, Vibe::Food), // French loaf
    (931, Vibe::Food), // bagel
    (932, Vibe::Food), // pretzel
    (933, Vibe::Food), // cheeseburger
    (934, Vibe::Food), // hotdog
    (935, Vibe::Food), // mashed potato
    (936, Vibe::Food), // head cabbage
    (937, Vibe::Food), // broccoli
    (938, Vibe::Food), // cauliflower
    (939, Vibe::Food), // zucchini
    (940, Vibe::Food), // spaghetti squash
    (941, Vibe::Food), // acorn squash
    (942, Vibe::Food), // butternut squash
    (943, Vibe::Food), // cucumber
    (944, Vibe::Food), // artichoke
    (947, Vibe::Food), // mushroom
    (948, Vibe::Food), // Granny Smith
    (949, Vibe::Food), // strawberry
    (950, Vibe::Food), // orange
    (951, Vibe::Food), // lemon
    (952, Vibe::Food), // fig
    (953, Vibe::Food), // pineapple
    (954, Vibe::Food), // banana
    (955, Vibe::Food), // jackfruit
    (956, Vibe::Food), // custard apple
    (957, Vibe::Food), // pomegranate
    (959, Vibe::Food), // carbonara
    (960, Vibe::Food), // chocolate sauce
    (962, Vibe::Food), // meat loaf
    (963, Vibe::Food), // pizza
    (964, Vibe::Food), // potpie
    (965, Vibe::Food), // burrito
    (966, Vibe::Food), // red wine
    (967, Vibe::Food), // espresso
    (969, Vibe::Food), // eggnog
    // Pet (beyond the dog/cat ranges below)
    (87, Vibe::Pet),  // African grey
    (88, Vibe::Pet),  // macaw
    (89, Vibe::Pet),  // sulphur-crested cockatoo
    (90, Vibe::Pet),  // lorikeet
    (332, Vibe::Pet), // Angora
    (333, Vibe::Pet), // hamster
    (338, Vibe::Pet), // guinea pig
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

/// Numerically-stable softmax over raw logits, then the top `k` *distinct*
/// mapped vibes by confidence -- pure arithmetic, no model or wasm needed
/// to test. Several ImageNet classes map to the same `Vibe` (e.g. six
/// different beach-adjacent classes), so this walks the full sorted list
/// rather than just taking the top `k` raw classes, keeping only the
/// highest-confidence class per distinct vibe. Stops as soon as
/// confidence drops below [`CONFIDENCE_FLOOR`] (the list is sorted, so
/// nothing after that point would clear it either), meaning it can
/// return fewer than `k` entries, including zero.
pub fn classify_top_vibes(logits: &[f32], k: usize) -> Vec<(Vibe, f32)> {
    if logits.is_empty() || k == 0 {
        return Vec::new();
    }
    let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let exps: Vec<f32> = logits.iter().map(|&v| (v - max).exp()).collect();
    let sum: f32 = exps.iter().sum();
    if sum <= 0.0 {
        return Vec::new();
    }

    let mut scored: Vec<(usize, f32)> = exps
        .iter()
        .enumerate()
        .map(|(i, &e)| (i, e / sum))
        .collect();
    scored.sort_by(|a, b| b.1.total_cmp(&a.1));

    let mut out: Vec<(Vibe, f32)> = Vec::new();
    for (idx, confidence) in scored {
        if confidence < CONFIDENCE_FLOOR {
            break;
        }
        let Ok(class) = u16::try_from(idx) else {
            continue;
        };
        let Some(vibe) = vibe_for_class(class) else {
            continue;
        };
        if out.iter().any(|&(v, _)| v == vibe) {
            continue;
        }
        out.push((vibe, confidence));
        if out.len() >= k {
            break;
        }
    }
    out
}

/// The single best suggestion -- a thin wrapper over
/// [`classify_top_vibes`] for callers that only want one.
pub fn classify_vibe(logits: &[f32]) -> Option<(Vibe, f32)> {
    classify_top_vibes(logits, 1).into_iter().next()
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

    // Same orientation fix as `pipeline::process_photo` -- classifying a
    // sideways photo (because this decode skipped the EXIF rotation a
    // browser would apply) feeds MobileNet an image it was never trained
    // to see upright, undermining "Suggest a look" for the very common
    // case of a photo straight off a phone camera.
    let decoded = crate::pipeline::decode_oriented(photo_bytes)?;
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

    fn logits_favoring_two(class_a: usize, value_a: f32, class_b: usize, value_b: f32) -> Vec<f32> {
        let mut logits = vec![0.0; 1000];
        logits[class_a] = value_a;
        logits[class_b] = value_b;
        logits
    }

    #[test]
    fn top_vibes_returns_multiple_distinct_vibes_ranked_by_confidence() {
        // 978 = seashore (Beach), 200 = a dog breed (Pet); values chosen so
        // both clear CONFIDENCE_FLOOR after softmax.
        let logits = logits_favoring_two(978, 10.0, 200, 9.0);
        let top = classify_top_vibes(&logits, 2);
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].0, Vibe::Beach);
        assert_eq!(top[1].0, Vibe::Pet);
        assert!(top[0].1 > top[1].1);
    }

    #[test]
    fn top_vibes_dedupes_multiple_classes_mapping_to_the_same_vibe() {
        // 978 (seashore) and 977 (sandbar) both map to Beach -- only the
        // higher-confidence one should surface, not two Beach entries.
        let logits = logits_favoring_two(978, 10.0, 977, 9.0);
        let top = classify_top_vibes(&logits, 3);
        assert_eq!(top.len(), 1);
        assert_eq!(top[0].0, Vibe::Beach);
    }

    #[test]
    fn top_vibes_respects_the_k_cap() {
        let logits = logits_favoring_two(978, 10.0, 200, 9.0);
        let top = classify_top_vibes(&logits, 1);
        assert_eq!(top.len(), 1);
        assert_eq!(top[0].0, Vibe::Beach);
    }

    #[test]
    fn top_vibes_stops_at_the_confidence_floor() {
        // A single confident class plus 999 equally-uninformative ones:
        // only the one class should clear CONFIDENCE_FLOOR.
        let logits = logits_favoring(978, 20.0);
        let top = classify_top_vibes(&logits, 5);
        assert_eq!(top.len(), 1);
        assert_eq!(top[0].0, Vibe::Beach);
    }

    #[test]
    fn top_vibes_on_empty_logits_is_empty_not_panicking() {
        assert_eq!(classify_top_vibes(&[], 3), Vec::new());
    }

    #[test]
    fn top_vibes_with_k_zero_is_empty() {
        let logits = logits_favoring(978, 20.0);
        assert_eq!(classify_top_vibes(&logits, 0), Vec::new());
    }

    #[test]
    fn every_curated_index_is_within_imagenet_1000_bounds() {
        for &(idx, _) in IMAGENET_CLASS_TO_VIBE {
            assert!(idx < 1000, "index {idx} out of range");
        }
    }

    #[test]
    fn no_curated_index_appears_twice() {
        // Every entry is a distinct class -- a duplicate would mean one
        // of the two mappings is silently ignored (`vibe_for_class` just
        // returns the first match), most likely a copy-paste mistake
        // rather than an intentional choice. Cheap enough to check
        // outright now that this table has ~120 explicit entries.
        let mut seen = std::collections::HashSet::new();
        for &(idx, _) in IMAGENET_CLASS_TO_VIBE {
            assert!(seen.insert(idx), "index {idx} appears more than once");
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
