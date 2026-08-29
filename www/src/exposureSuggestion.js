/**
 * A brightness/contrast/saturation nudge, based purely on `photoTone.js`'s
 * pixel-statistics read of the photo -- no object classification, so it
 * works on *any* photo, including the case "Suggest a look"'s vibe
 * classifier structurally can't help with: a photo of people. ImageNet
 * (the classifier's training data) has almost no "person" classes, so a
 * portrait or a group photo will rarely match any `Vibe` no matter how
 * wide `postcard_calc::vibe`'s curated table gets -- this suggestion
 * exists specifically to give that photo something useful too.
 *
 * `toneAdjustments` is the shared core: one nudge at a time, not a stack
 * of small tweaks -- checked in priority order (an under/overexposed
 * photo is the most visually obvious problem to fix; a merely flat or
 * muted one is more subtle). `vibeSuggestions.js` calls this same
 * function to fold a real corrective nudge into *every* vibe-based look
 * it generates too (not just this standalone suggestion), so a look
 * suggested for a too-dark or washed-out photo still corrects it rather
 * than just laying a filter over an uncorrected exposure problem.
 * Thresholds and adjustment amounts are a reasoned starting point, not
 * tuned against a labeled photo set (none exists, same honesty this
 * repo already applies to `postcard_calc::vibe::CONFIDENCE_FLOOR`) --
 * revisit them once this ships and gets real use.
 */
export function toneAdjustments(tone) {
  if (!tone) return null;
  const { brightness, contrast, saturation } = tone;

  if (brightness < 0.35) return { brightness: 0.18 };
  if (brightness > 0.72) return { brightness: -0.15 };
  if (contrast < 0.12) return { contrast: 1.25 };
  if (saturation < 0.06) return { saturation: 1.4 };
  return null;
}

function labelFor(adjustments) {
  if (adjustments.brightness > 0) return "exposure.brighten";
  if (adjustments.brightness < 0) return "exposure.dim";
  if (adjustments.contrast) return "exposure.contrast";
  return "exposure.saturate";
}

// A fixed, simple starting point for the fields "Suggest a look" now also
// offers (layout, font, color) -- this candidate is the always-safe
// fallback for a photo the vibe classifier can't help with (see the
// module doc comment), so it deliberately doesn't vary these the way
// `vibeSuggestions.js`'s own candidates occasionally do: no layout
// variety, just full-bleed, system font, auto text color.
export function suggestExposure(tone) {
  const adjustments = toneAdjustments(tone);
  return adjustments
    ? { labelKey: labelFor(adjustments), adjustments, fontChoice: 'system', fontScale: 1, textColor: 'auto' }
    : null;
}
