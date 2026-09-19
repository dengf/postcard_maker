import { describe, expect, it } from 'vitest';
import { boxBlur } from './blurBed';

/** An RGBA buffer of `w`x`h`, all black and opaque. */
function field(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
}

const at = (data, w, x, y) => data[(y * w + x) * 4];

describe('boxBlur', () => {
  it('spreads a single bright pixel over its neighbours', () => {
    const w = 21;
    const h = 21;
    const data = field(w, h);
    data[(10 * w + 10) * 4] = 255;

    boxBlur(data, w, h, 3);

    // Dimmer at the centre, brighter than nothing around it, and dark
    // again well outside the radius -- i.e. an actual blur, not a copy
    // and not a wash over the whole image.
    expect(at(data, w, 10, 10)).toBeGreaterThan(0);
    expect(at(data, w, 10, 10)).toBeLessThan(255);
    expect(at(data, w, 12, 10)).toBeGreaterThan(0);
    expect(at(data, w, 10, 10)).toBeGreaterThan(at(data, w, 12, 10));
    expect(at(data, w, 0, 0)).toBe(0);
  });

  it('leaves a flat field exactly as it was', () => {
    // The edge handling repeats the edge pixel rather than padding with
    // zero, so a solid colour must not darken along its border.
    const w = 12;
    const h = 8;
    const data = field(w, h);
    for (let i = 0; i < data.length; i += 4) data[i] = 200;

    boxBlur(data, w, h, 2);

    for (const [x, y] of [[0, 0], [11, 7], [6, 0], [0, 4], [6, 4]]) {
      expect(at(data, w, x, y)).toBe(200);
    }
  });

  it('is a no-op below a radius of one', () => {
    const w = 4;
    const h = 4;
    const data = field(w, h);
    data[0] = 123;
    boxBlur(data, w, h, 0);
    expect(at(data, w, 0, 0)).toBe(123);
  });
});
