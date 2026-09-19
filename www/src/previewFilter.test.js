import { describe, expect, it } from 'vitest';
import { applyFilterToColor, previewFilterCss } from './previewFilter';

const NEUTRAL = { brightness: 0, contrast: 1, saturation: 1 };
const close = (got, want, tol = 1) =>
  got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(tol));

describe('previewFilterCss', () => {
  it('names the adjustments and the filter in one string', () => {
    expect(previewFilterCss(NEUTRAL, 'grayscale')).toBe(
      'brightness(1) contrast(1) saturate(1) grayscale(1)',
    );
  });
});

describe('applyFilterToColor', () => {
  it('leaves a color alone with no filter and with a neutral one', () => {
    close(applyFilterToColor([10, 120, 250], ''), [10, 120, 250]);
    close(applyFilterToColor([10, 120, 250], previewFilterCss(NEUTRAL, 'none')), [10, 120, 250]);
  });

  it('collapses grayscale onto the spec luminance weights', () => {
    // 0.213R + 0.715G + 0.072B, the numbers a browser uses.
    const [r, g, b] = applyFilterToColor([200, 100, 50], 'grayscale(1)');
    const luma = 0.213 * 200 + 0.715 * 100 + 0.072 * 50;
    close([r, g, b], [luma, luma, luma]);
  });

  it('reads a percentage the same as the equivalent number', () => {
    close(applyFilterToColor([200, 100, 50], 'grayscale(50%)'), applyFilterToColor([200, 100, 50], 'grayscale(0.5)'));
  });

  it('scales with brightness and pivots contrast around mid grey', () => {
    close(applyFilterToColor([100, 50, 25], 'brightness(1.5)'), [150, 75, 37.5]);
    close(applyFilterToColor([127.5, 127.5, 127.5], 'contrast(2)'), [127.5, 127.5, 127.5]);
    close(applyFilterToColor([191.25, 0, 0], 'contrast(2)'), [255, 0, 0]);
  });

  it('clamps rather than wrapping past the ends of the range', () => {
    close(applyFilterToColor([250, 250, 250], 'brightness(4)'), [255, 255, 255]);
    close(applyFilterToColor([10, 10, 10], 'brightness(0)'), [0, 0, 0]);
  });

  it('applies a chain left to right, not in some other order', () => {
    // brightness *2 then contrast *2 is not the same as the reverse:
    // contrast pivots around mid grey, so the order is observable.
    const both = applyFilterToColor([60, 60, 60], 'brightness(2) contrast(2)');
    const reversed = applyFilterToColor([60, 60, 60], 'contrast(2) brightness(2)');
    close(both, [(120 - 127.5) * 2 + 127.5, (120 - 127.5) * 2 + 127.5, (120 - 127.5) * 2 + 127.5]);
    expect(Math.round(both[0])).not.toBe(Math.round(reversed[0]));
  });

  it('warms a color with sepia and reduces to identity at zero', () => {
    const [r, , b] = applyFilterToColor([128, 128, 128], 'sepia(1)');
    expect(r).toBeGreaterThan(b);
    close(applyFilterToColor([10, 120, 250], 'sepia(0)'), [10, 120, 250]);
  });

  it('ignores a function it has no affine form for, rather than guessing', () => {
    close(applyFilterToColor([10, 120, 250], 'blur(4px)'), [10, 120, 250]);
  });

  it('runs the app’s own vintage string without losing the photo', () => {
    const out = applyFilterToColor([90, 140, 190], previewFilterCss(NEUTRAL, 'vintage'));
    // Warmer and a little flatter, but still recognisably the same color.
    expect(out[0]).toBeGreaterThan(out[2] - 90);
    out.forEach((v) => expect(v).toBeGreaterThan(0));
    out.forEach((v) => expect(v).toBeLessThan(255));
  });
});
