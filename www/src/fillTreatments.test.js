import { describe, expect, it } from 'vitest';
import { bestContrastColor } from './autoTextColor';
import { FILL_COLORS, FILL_COLOR_NAMES, FILL_SHAPES, fillSurfaceColor } from './fillTreatments';

describe('fillSurfaceColor', () => {
  it('leaves a solid fill alone -- the base is what gets painted', () => {
    expect(fillSurfaceColor('solid', [40, 30, 34])).toEqual([40, 30, 34]);
  });

  it('answers with the light interior for the shapes that paint one', () => {
    // The live preview used to contrast text against this base directly,
    // which picked white ink for a near-white airmail interior while the
    // export -- sampling the real pixels -- picked dark. These are the
    // shapes where the base and the painted surface genuinely differ.
    const dark = [20, 30, 40];
    for (const shape of ['airmail', 'lines', 'dots']) {
      const surface = fillSurfaceColor(shape, dark);
      expect(bestContrastColor(surface)).toBe('#241a1e');
    }
    expect(bestContrastColor(dark)).toBe('#ffffff');
  });

  it('keeps a pale base pale for every shape', () => {
    const pale = [244, 237, 224];
    for (const shape of FILL_SHAPES) {
      if (shape === 'blur') continue; // its surface is the photo, not a shade
      const [r, g, b] = fillSurfaceColor(shape, pale);
      expect(Math.min(r, g, b)).toBeGreaterThan(90);
    }
  });

  it('returns three whole channels in 0..255 for every shape', () => {
    for (const shape of FILL_SHAPES) {
      const surface = fillSurfaceColor(shape, [0, 128, 255]);
      expect(surface).toHaveLength(3);
      for (const c of surface) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('FILL_COLOR_NAMES', () => {
  // A swatch button's only content is its background color, so the name
  // is the whole accessible label -- `aria-label={hex}` was not one.
  it('names every swatch exactly once', () => {
    for (const hex of FILL_COLORS) {
      expect(FILL_COLOR_NAMES[hex], `no name for ${hex}`).toBeTruthy();
    }
    expect(Object.keys(FILL_COLOR_NAMES)).toHaveLength(FILL_COLORS.length);
    expect(new Set(Object.values(FILL_COLOR_NAMES)).size).toBe(FILL_COLORS.length);
  });
});
