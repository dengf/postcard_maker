//! Writes an actual caption for a photo -- not a pick from a curated
//! phrase bank (that's `www/src/vibeCaptions.js`'s job), a real sentence
//! generated on-device by looking at the photo itself. Deliberately kept
//! as a separate, explicitly-triggered action from "Suggest a look"
//! (see `CLAUDE.md`): this is a genuinely large download (~139MB across
//! three ONNX models plus a tokenizer, next to "Suggest a look"'s
//! combined ~11MB), and nobody should get it without asking for it by
//! name.
//!
//! Model: [SmolVLM-256M-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct)
//! (Apache-2.0), the most aggressively quantized ONNX export of each of
//! its three components (`vision_encoder_q4f16`, `embed_tokens_quantized`,
//! `decoder_model_merged_q4f16`). Tokenization uses the real
//! `tokenizers` crate (Apache-2.0, the same Rust crate powering
//! HuggingFace's own Python library) against the model's own
//! `tokenizer.json` -- ported by hand once via a throwaway spike to get
//! the prompt format and generation loop right, not guessed.
//!
//! **Real findings from that spike, not assumed going in**:
//! - The vision encoder, embed-tokens, and decoder are three *separate*
//!   ONNX graphs requiring genuine multi-step autoregressive generation
//!   (run the decoder once per output word, feeding its own growing
//!   key/value cache back into itself) -- a fundamentally different, far
//!   more involved inference shape than "Suggest a look"'s single
//!   forward pass. Verified this actually runs through `rten` (which
//!   only supports *most* standard ONNX operators, not all of them)
//!   before writing any of this module.
//! - The ONNX export does not include chat-template or image-token-
//!   placement logic. The prompt has to be hand-assembled exactly the
//!   way `transformers`' own `SmolVLMProcessor` does it for a single,
//!   unsplit image: `<fake_token_around_image><global-img>` + the image
//!   placeholder token repeated once per vision-encoder output patch +
//!   `<fake_token_around_image>`, wrapped in the model's own chat
//!   template. Got this from the actual `transformers` source, not
//!   guessed -- an incorrect token layout doesn't error, it just quietly
//!   produces garbage.
//! - A 256M-parameter model's *tone* instruction-following is limited:
//!   it reliably describes what's actually in the photo, but doesn't
//!   reliably sound like a postcard just because the prompt asks it to.
//!   Not something more prompt tuning fully solves at this model size --
//!   a known, accepted limitation, not a bug to chase.

#[cfg(feature = "caption")]
use postcard_core::{PostcardError, PostcardResult};

/// The image resolution this build's vision encoder was exported for.
/// Not a general "pick any size" constant -- the model's own weights are
/// specific to this input shape.
#[cfg(feature = "caption")]
const IMG_SIZE: u32 = 512;

/// SmolLM2-135M's decoder: 30 transformer layers, 3 KV heads (grouped-
/// query attention), 64-dim heads -- the shapes needed to build each
/// step's empty-then-growing key/value cache tensors. Read directly off
/// the real decoder ONNX graph's own input shapes during the spike, not
/// derived from a spec sheet.
#[cfg(feature = "caption")]
const NUM_KV_LAYERS: usize = 30;
#[cfg(feature = "caption")]
const NUM_KV_HEADS: usize = 3;
#[cfg(feature = "caption")]
const HEAD_DIM: usize = 64;

/// This tokenizer's id for the image placeholder token -- where the
/// vision encoder's own patch embeddings get spliced into the text
/// embedding sequence. From the model's own `config.json`
/// (`image_token_id`), not guessed.
const IMAGE_TOKEN_ID: u32 = 49190;
const FAKE_TOKEN_AROUND_IMAGE: &str = "<fake_token_around_image>";
const GLOBAL_IMG_TOKEN: &str = "<global-img>";
const IMAGE_TOKEN: &str = "<image>";

/// Both are genuine stop signals this model can emit -- `<|im_end|>`
/// (the base chat template's own end-of-turn token, `config.json`'s
/// `eos_token_id`) and `<end_of_utterance>` (SmolVLM's own fine-tuned
/// turn marker, observed ending generation during the spike). Treating
/// only one as EOS risks running to `MAX_NEW_TOKENS` instead of stopping
/// naturally.
#[cfg(feature = "caption")]
const EOS_IDS: [u32; 2] = [2, 49279];

/// A caption this size does not need dozens of words; this is a safety
/// cap against a degenerate non-stopping generation, not a target length.
#[cfg(feature = "caption")]
const MAX_NEW_TOKENS: usize = 40;

/// SigLIP-style preprocessing (the vision encoder's own training
/// normalization) -- resize to the model's fixed input size, RGB,
/// `(x/255 - 0.5) / 0.5` per channel, CHW. A different formula from
/// `vibe::preprocess`'s ImageNet mean/std or `face::preprocess`'s
/// `(x-127)/128`; three different models, three different training
/// recipes, not one that should be shared.
#[cfg(feature = "caption")]
fn preprocess_image(photo: &image::DynamicImage) -> Vec<f32> {
    let resized = photo.resize_exact(IMG_SIZE, IMG_SIZE, image::imageops::FilterType::Triangle);
    let rgb = resized.to_rgb8();
    let mut chw = vec![0f32; 3 * (IMG_SIZE as usize) * (IMG_SIZE as usize)];
    let plane = (IMG_SIZE * IMG_SIZE) as usize;
    for (x, y, pixel) in rgb.enumerate_pixels() {
        let offset = (y * IMG_SIZE + x) as usize;
        for c in 0..3 {
            chw[c * plane + offset] = (f32::from(pixel.0[c]) / 255.0 - 0.5) / 0.5;
        }
    }
    chw
}

/// Builds the exact prompt SmolVLM's own processor builds for a single,
/// unsplit image (no multi-tile splitting -- see this module's own doc
/// comment): the image placeholder expansion, wrapped in the model's own
/// chat template for a one-turn user request. Pure string assembly, no
/// model or wasm needed to test -- see this module's tests.
pub fn build_prompt(image_seq_len: usize) -> String {
    let image_placeholder = format!(
        "{FAKE_TOKEN_AROUND_IMAGE}{GLOBAL_IMG_TOKEN}{}{FAKE_TOKEN_AROUND_IMAGE}",
        IMAGE_TOKEN.repeat(image_seq_len)
    );
    format!(
        "<|im_start|>User:{image_placeholder}Describe this image in one short, warm sentence suitable for a postcard.<end_of_utterance>\nAssistant:"
    )
}

/// The index of the highest-scoring logit -- greedy decoding's entire
/// decision rule. No temperature/sampling: a deterministic pick is
/// simpler, reproducible, and plenty for a one-sentence caption.
pub fn argmax(logits: &[f32]) -> u32 {
    let mut best_id = 0u32;
    let mut best_score = f32::NEG_INFINITY;
    for (i, &score) in logits.iter().enumerate() {
        if score > best_score {
            best_score = score;
            best_id = i as u32;
        }
    }
    best_id
}

/// Overwrites the text-embedding row at every position where `input_ids`
/// holds `image_token_id` with the corresponding row from
/// `image_embeds`, in order -- the standard "merge image features into
/// the token embedding sequence" step every one of these vision-language
/// models does before the decoder ever sees them. Both `embeds` and
/// `image_embeds` are flat, row-major `[num_rows * embed_dim]` buffers.
/// Returns how many rows were spliced, so a caller can sanity-check it
/// against the vision encoder's own output row count.
pub fn splice_image_embeddings(
    embeds: &mut [f32],
    input_ids: &[u32],
    image_embeds: &[f32],
    embed_dim: usize,
) -> usize {
    let mut image_pos = 0;
    for (i, &id) in input_ids.iter().enumerate() {
        if id != IMAGE_TOKEN_ID {
            continue;
        }
        let dst_start = i * embed_dim;
        let src_start = image_pos * embed_dim;
        if dst_start + embed_dim > embeds.len() || src_start + embed_dim > image_embeds.len() {
            break; // malformed input -- stop rather than panic on a slice bound
        }
        embeds[dst_start..dst_start + embed_dim]
            .copy_from_slice(&image_embeds[src_start..src_start + embed_dim]);
        image_pos += 1;
    }
    image_pos
}

#[cfg(feature = "caption")]
/// Loads all three model components plus the tokenizer, runs the vision
/// encoder once on `photo_bytes`, then greedily decodes a caption token
/// by token through the growing key/value cache -- see this module's own
/// doc comment for the real findings behind this shape. The only part of
/// this module that touches `rten`, `tokenizers`, or the photo decoder;
/// [`build_prompt`]/[`argmax`]/[`splice_image_embeddings`] above are the
/// pure decision logic, tested separately with synthetic data.
pub fn generate_caption(
    vision_model_bytes: &[u8],
    embed_model_bytes: &[u8],
    decoder_model_bytes: &[u8],
    tokenizer_bytes: &[u8],
    photo_bytes: &[u8],
) -> PostcardResult<String> {
    use rten::Model;
    use rten_tensor::prelude::*;
    use rten_tensor::{NdTensor, Tensor};
    use tokenizers::Tokenizer;

    if photo_bytes.is_empty() {
        return Err(PostcardError::EmptyImage);
    }

    let load_err = |e: rten::LoadError| PostcardError::CaptionModelLoadFailed(e.to_string());
    let vision_model = Model::load(vision_model_bytes.to_vec()).map_err(load_err)?;
    let embed_model = Model::load(embed_model_bytes.to_vec()).map_err(load_err)?;
    let decoder_model = Model::load(decoder_model_bytes.to_vec()).map_err(load_err)?;
    let tokenizer = Tokenizer::from_bytes(tokenizer_bytes)
        .map_err(|e| PostcardError::CaptionModelLoadFailed(e.to_string()))?;

    let run_err = |e: rten::RunError| PostcardError::CaptionGenerateFailed(e.to_string());
    let shape_err = || PostcardError::CaptionGenerateFailed("unexpected model output shape".into());

    // --- Vision encoder, once, on the whole photo ---
    let decoded = crate::pipeline::decode_oriented(photo_bytes)?;
    let chw = preprocess_image(&decoded);
    let pixel_values: Tensor<f32> =
        Tensor::from_data(&[1, 1, 3, IMG_SIZE as usize, IMG_SIZE as usize], chw);
    let pixel_mask: Tensor<i32> = Tensor::from_data(
        &[1, 1, IMG_SIZE as usize, IMG_SIZE as usize],
        vec![1i32; (IMG_SIZE * IMG_SIZE) as usize],
    );
    let vision_out = vision_model
        .run(
            vec![
                (vision_model.input_ids()[0], pixel_values.view().into()),
                (vision_model.input_ids()[1], pixel_mask.view().into()),
            ],
            vision_model.output_ids(),
            None,
        )
        .map_err(run_err)?;
    let image_embeds: NdTensor<f32, 3> = vision_out
        .into_iter()
        .next()
        .ok_or_else(shape_err)?
        .try_into()
        .map_err(|_| shape_err())?;
    let image_seq_len = image_embeds.shape()[1];
    let embed_dim = image_embeds.shape()[2];

    // --- Build and tokenize the real prompt ---
    let prompt = build_prompt(image_seq_len);
    let encoding = tokenizer
        .encode(prompt, false)
        .map_err(|e| PostcardError::CaptionGenerateFailed(e.to_string()))?;
    let input_ids: Vec<u32> = encoding.get_ids().to_vec();
    let ids_i32: Vec<i32> = input_ids.iter().map(|&v| v as i32).collect();
    let seq_len = ids_i32.len();

    // --- Embed the prompt, then splice in the real image patch
    // embeddings at every image-placeholder position ---
    let ids_tensor: Tensor<i32> = Tensor::from_data(&[1, seq_len], ids_i32);
    let embed_out = embed_model
        .run(
            vec![(embed_model.input_ids()[0], ids_tensor.view().into())],
            embed_model.output_ids(),
            None,
        )
        .map_err(run_err)?;
    let mut embeds: NdTensor<f32, 3> = embed_out
        .into_iter()
        .next()
        .ok_or_else(shape_err)?
        .try_into()
        .map_err(|_| shape_err())?;
    let image_embeds_flat: Vec<f32> = image_embeds.iter().copied().collect();
    {
        let embeds_flat = embeds.data_mut().ok_or_else(shape_err)?;
        splice_image_embeddings(embeds_flat, &input_ids, &image_embeds_flat, embed_dim);
    }

    // --- Greedy decode loop with a growing key/value cache ---
    let mut past_kv: Vec<Tensor<f32>> = (0..NUM_KV_LAYERS * 2)
        .map(|_| Tensor::from_data(&[1, NUM_KV_HEADS, 0, HEAD_DIM], Vec::<f32>::new()))
        .collect();
    let mut cur_embeds = embeds;
    let mut total_seq_len = 0usize;
    let mut generated: Vec<u32> = Vec::new();

    for _ in 0..MAX_NEW_TOKENS {
        let step_seq_len = cur_embeds.shape()[1];
        total_seq_len += step_seq_len;
        let attention_mask: Tensor<i32> =
            Tensor::from_data(&[1, total_seq_len], vec![1i32; total_seq_len]);
        let position_ids: Tensor<i32> = Tensor::from_data(
            &[1, step_seq_len],
            ((total_seq_len - step_seq_len)..total_seq_len)
                .map(|v| v as i32)
                .collect::<Vec<i32>>(),
        );

        let mut inputs: Vec<(rten::NodeId, rten::ValueOrView)> = vec![
            (decoder_model.input_ids()[0], cur_embeds.view().into()),
            (decoder_model.input_ids()[1], attention_mask.view().into()),
            (decoder_model.input_ids()[2], position_ids.view().into()),
        ];
        for (i, kv) in past_kv.iter().enumerate() {
            inputs.push((decoder_model.input_ids()[3 + i], kv.view().into()));
        }

        let outputs = decoder_model
            .run(inputs, decoder_model.output_ids(), None)
            .map_err(run_err)?;
        let mut outputs_iter = outputs.into_iter();
        let logits: NdTensor<f32, 3> = outputs_iter
            .next()
            .ok_or_else(shape_err)?
            .try_into()
            .map_err(|_| shape_err())?;
        past_kv = outputs_iter
            .map(|o| o.try_into().map_err(|_| shape_err()))
            .collect::<PostcardResult<Vec<_>>>()?;

        let last = logits.shape()[1] - 1;
        let vocab = logits.shape()[2];
        let logits_row: Vec<f32> = (0..vocab).map(|v| logits[[0, last, v]]).collect();
        let best_id = argmax(&logits_row);

        if EOS_IDS.contains(&best_id) {
            break;
        }
        generated.push(best_id);

        let next_token: Tensor<i32> = Tensor::from_data(&[1, 1], vec![best_id as i32]);
        let next_embed_out = embed_model
            .run(
                vec![(embed_model.input_ids()[0], next_token.view().into())],
                embed_model.output_ids(),
                None,
            )
            .map_err(run_err)?;
        cur_embeds = next_embed_out
            .into_iter()
            .next()
            .ok_or_else(shape_err)?
            .try_into()
            .map_err(|_| shape_err())?;
    }

    tokenizer
        .decode(&generated, true)
        .map_err(|e| PostcardError::CaptionGenerateFailed(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_contains_exactly_one_image_token_per_patch() {
        let prompt = build_prompt(64);
        assert_eq!(prompt.matches(IMAGE_TOKEN).count(), 64);
    }

    #[test]
    fn prompt_wraps_the_image_placeholder_in_fake_tokens_and_a_global_marker() {
        let prompt = build_prompt(4);
        let expected_placeholder = format!("{FAKE_TOKEN_AROUND_IMAGE}{GLOBAL_IMG_TOKEN}<image><image><image><image>{FAKE_TOKEN_AROUND_IMAGE}");
        assert!(prompt.contains(&expected_placeholder), "prompt: {prompt}");
    }

    #[test]
    fn prompt_ends_ready_for_the_assistant_turn() {
        assert!(build_prompt(1).ends_with("Assistant:"));
    }

    #[test]
    fn argmax_finds_the_highest_score() {
        assert_eq!(argmax(&[0.1, 0.9, 0.3]), 1);
        assert_eq!(argmax(&[5.0, 1.0]), 0);
    }

    #[test]
    fn argmax_of_a_single_value_is_index_zero() {
        assert_eq!(argmax(&[42.0]), 0);
    }

    #[test]
    fn splices_image_rows_only_at_image_token_positions_in_order() {
        // embed_dim = 2, three text tokens with the middle one being the
        // image placeholder.
        let mut embeds = vec![9.0, 9.0, 0.0, 0.0, 9.0, 9.0];
        let input_ids = [7u32, IMAGE_TOKEN_ID, 7u32];
        let image_embeds = [1.0, 2.0];
        let spliced = splice_image_embeddings(&mut embeds, &input_ids, &image_embeds, 2);
        assert_eq!(spliced, 1);
        assert_eq!(embeds, vec![9.0, 9.0, 1.0, 2.0, 9.0, 9.0]);
    }

    #[test]
    fn splices_multiple_image_rows_in_order() {
        let mut embeds = vec![0.0; 3 * 2];
        let input_ids = [IMAGE_TOKEN_ID, IMAGE_TOKEN_ID, IMAGE_TOKEN_ID];
        let image_embeds = [1.0, 1.0, 2.0, 2.0, 3.0, 3.0];
        let spliced = splice_image_embeddings(&mut embeds, &input_ids, &image_embeds, 2);
        assert_eq!(spliced, 3);
        assert_eq!(embeds, vec![1.0, 1.0, 2.0, 2.0, 3.0, 3.0]);
    }

    #[test]
    fn splicing_with_no_image_tokens_touches_nothing() {
        let mut embeds = vec![9.0, 9.0];
        let input_ids = [7u32];
        let spliced = splice_image_embeddings(&mut embeds, &input_ids, &[], 2);
        assert_eq!(spliced, 0);
        assert_eq!(embeds, vec![9.0, 9.0]);
    }

    #[test]
    fn splicing_stops_rather_than_panics_on_a_malformed_short_buffer() {
        let mut embeds = vec![0.0; 2]; // room for one row only
        let input_ids = [IMAGE_TOKEN_ID, IMAGE_TOKEN_ID]; // claims two
        let image_embeds = [1.0, 2.0, 3.0, 4.0];
        let spliced = splice_image_embeddings(&mut embeds, &input_ids, &image_embeds, 2);
        assert_eq!(spliced, 1);
    }
}
