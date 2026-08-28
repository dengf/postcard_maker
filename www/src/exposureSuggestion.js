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
 * One suggestion at a time, not a stack of small tweaks -- checked in
 * priority order (an under/overexposed photo is the most visually
 * obvious problem to fix; a merely flat or muted one is more subtle).
 * Thresholds and adjustment amounts are a reasoned starting point, not
 * tuned against a labeled photo set (none exists, same honesty this
 * repo already applies to `postcard_calc::vibe::CONFIDENCE_FLOOR`) --
 * revisit them once this ships and gets real use.
 */
export function suggestExposure(tone) {
  if (!tone) return null;
  const { brightness, contrast, saturation } = tone;

  if (brightness < 0.35) {
    return {
      labelKey: 'exposure.brighten',
      adjustments: { brightness: 0.18 },
    };
  }
  if (brightness > 0.72) {
    return {
      labelKey: 'exposure.dim',
      adjustments: { brightness: -0.15 },
    };
  }
  if (contrast < 0.12) {
    return {
      labelKey: 'exposure.contrast',
      adjustments: { contrast: 1.25 },
    };
  }
  if (saturation < 0.06) {
    return {
      labelKey: 'exposure.saturate',
      adjustments: { saturation: 1.4 },
    };
  }
  return null;
}
