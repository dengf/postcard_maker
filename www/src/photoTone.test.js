import { describe, expect, it } from 'vitest';
import { toneFromImageData } from './photoTone';

function fakeImageData(pixels) {
  const data = [];
  for (const [r, g, b] of pixels) data.push(r, g, b, 255);
  return { data: new Uint8ClampedArray(data) };
}

describe('toneFromImageData', () => {
  it('reads a uniform bright, saturated red as high brightness and high saturation', () => {
    const { brightness, saturation } = toneFromImageData(fakeImageData([[255, 0, 0]]));
    expect(brightness).toBeCloseTo(255 / 3 / 255, 5);
    expect(saturation).toBeCloseTo(1, 5);
  });

  it('reads a uniform mid-gray as zero saturation', () => {
    const { saturation } = toneFromImageData(fakeImageData([[128, 128, 128]]));
    expect(saturation).toBe(0);
  });

  it('reads pure white as maximum brightness and zero saturation', () => {
    const { brightness, saturation } = toneFromImageData(fakeImageData([[255, 255, 255]]));
    expect(brightness).toBeCloseTo(1, 5);
    expect(saturation).toBe(0);
  });

  it('reads pure black as zero brightness', () => {
    const { brightness } = toneFromImageData(fakeImageData([[0, 0, 0]]));
    expect(brightness).toBe(0);
  });

  it('averages across multiple pixels', () => {
    const { brightness } = toneFromImageData(fakeImageData([[0, 0, 0], [255, 255, 255]]));
    expect(brightness).toBeCloseTo(0.5, 5);
  });
});
