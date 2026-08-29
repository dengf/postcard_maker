import { describe, expect, it } from 'vitest';
import { suggestExposure } from './exposureSuggestion';

describe('suggestExposure', () => {
  it('suggests brightening a dark photo', () => {
    const result = suggestExposure({ brightness: 0.2, contrast: 0.3, saturation: 0.2 });
    expect(result).toMatchObject({ labelKey: 'exposure.brighten' });
    expect(result.adjustments.brightness).toBeGreaterThan(0);
  });

  it('suggests dimming an overexposed photo', () => {
    const result = suggestExposure({ brightness: 0.85, contrast: 0.3, saturation: 0.2 });
    expect(result).toMatchObject({ labelKey: 'exposure.dim' });
    expect(result.adjustments.brightness).toBeLessThan(0);
  });

  it('suggests more contrast for a flat photo that is otherwise well-exposed', () => {
    const result = suggestExposure({ brightness: 0.5, contrast: 0.05, saturation: 0.2 });
    expect(result).toMatchObject({ labelKey: 'exposure.contrast' });
    expect(result.adjustments.contrast).toBeGreaterThan(1);
  });

  it('suggests more saturation for a muted photo that is otherwise fine', () => {
    const result = suggestExposure({ brightness: 0.5, contrast: 0.3, saturation: 0.02 });
    expect(result).toMatchObject({ labelKey: 'exposure.saturate' });
    expect(result.adjustments.saturation).toBeGreaterThan(1);
  });

  it('suggests nothing for an already well-balanced photo', () => {
    expect(suggestExposure({ brightness: 0.5, contrast: 0.3, saturation: 0.2 })).toBeNull();
  });

  it('prioritizes brightness over contrast/saturation when several apply', () => {
    // Dark AND flat AND muted -- brightness should win since it's checked first.
    const result = suggestExposure({ brightness: 0.1, contrast: 0.01, saturation: 0.01 });
    expect(result.labelKey).toBe('exposure.brighten');
  });

  it('returns null rather than throwing when tone is missing', () => {
    expect(suggestExposure(null)).toBeNull();
    expect(suggestExposure(undefined)).toBeNull();
  });

  it('carries a fixed, safe font/color starting point -- no layout variety, since this fires on photos the vibe classifier cannot help', () => {
    const result = suggestExposure({ brightness: 0.2, contrast: 0.3, saturation: 0.2 });
    expect(result).toMatchObject({ fontChoice: 'system', fontScale: 1, textColor: 'auto' });
    expect(result.photoCoverage).toBeUndefined();
  });
});
