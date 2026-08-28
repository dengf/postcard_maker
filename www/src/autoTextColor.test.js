import { describe, expect, it } from 'vitest';
import { averageColor, bestContrastColor } from './autoTextColor';

function fakeImageData(rgb, count = 4) {
  const data = [];
  for (let i = 0; i < count; i += 1) data.push(rgb[0], rgb[1], rgb[2], 255);
  return { data: new Uint8ClampedArray(data) };
}

describe('averageColor', () => {
  it('averages a uniform block of pixels back to the same color', () => {
    expect(averageColor(fakeImageData([200, 100, 50]))).toEqual([200, 100, 50]);
  });

  it('averages a mix of pixels', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(averageColor({ data })).toEqual([127.5, 127.5, 127.5]);
  });
});

describe('bestContrastColor', () => {
  it('picks the dark ink color against a near-white background', () => {
    expect(bestContrastColor([245, 245, 240])).toBe('#241a1e');
  });

  it('picks white against a near-black background', () => {
    expect(bestContrastColor([10, 10, 15])).toBe('#ffffff');
  });

  it('picks white against a mid-dark background rather than a low-contrast swatch', () => {
    // A dim, warm evening-photo tone -- dark enough that white should
    // beat both the maroon and gold candidates on contrast.
    expect(bestContrastColor([60, 45, 40])).toBe('#ffffff');
  });

  it('only ever returns one of the supplied candidates', () => {
    const candidates = ['#ffffff', '#241a1e'];
    const result = bestContrastColor([128, 128, 128], candidates);
    expect(candidates).toContain(result);
  });
});
