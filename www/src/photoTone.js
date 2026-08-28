/**
 * A cheap overall brightness/contrast/saturation read of a photo -- not
 * a filter preview, not per-pixel-precise, just enough of a signal for
 * two different jobs: breaking `vibeSuggestions.js`'s tie so two very
 * different-looking photos of the same `Vibe` (a blown-out noon beach
 * shot vs. a hazy overcast one) don't always get the exact same canned
 * suggestion, and -- since object classification alone has nothing to
 * offer a photo of *people*, which ImageNet has almost no classes for --
 * driving `exposureSuggestion.js`'s brightness/contrast/saturation nudge,
 * which works on any photo regardless of what's in it. Sampled from the
 * *original* photo bytes, independent of whatever crop/filter the editor
 * currently has applied -- "what does this photo actually look like" is
 * the more honest signal than whatever the user already happens to have
 * picked.
 */
export async function photoTone(photoBytes) {
  const bitmap = await createImageBitmap(new Blob([photoBytes]), {
    resizeWidth: 32,
    resizeHeight: 32,
    resizeQuality: 'low',
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return toneFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } finally {
    bitmap.close();
  }
}

/**
 * The pure math half, split out so it's testable without a real
 * `createImageBitmap`/canvas (unavailable in this repo's jsdom test
 * environment -- see `autoTextColor.js` for the same split).
 */
export function toneFromImageData(imageData) {
  const { data } = imageData;
  const pixels = data.length / 4;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let chromaSum = 0;
  let lumaSum = 0;
  let lumaSqSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
    const luma = (r + g + b) / 3;
    lumaSum += luma;
    lumaSqSum += luma * luma;
  }
  const lumaMean = lumaSum / pixels;
  // Population variance via E[X^2] - E[X]^2 -- one pass, no need to
  // revisit every pixel a second time now that the mean is known.
  const lumaVariance = Math.max(0, lumaSqSum / pixels - lumaMean * lumaMean);
  return {
    brightness: (rSum + gSum + bSum) / (3 * pixels) / 255,
    saturation: chromaSum / pixels / 255,
    // A flat, hazy photo has most pixels clustered near the same
    // brightness (low spread); a punchy, well-lit one spans a wide
    // range. Standard deviation of per-pixel luminance, normalized to
    // roughly 0..1 -- not a perceptual contrast metric, just a cheap
    // proxy for "how much tonal range does this photo actually use."
    contrast: Math.sqrt(lumaVariance) / 128,
  };
}
