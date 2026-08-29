import { describe, expect, it, vi } from 'vitest';
import { templateGeometry, photoAreaRatio, suggestCropForLayout } from './photoLayout';

describe('templateGeometry', () => {
  it('maps camelCase coverage to the snake_case string the wasm binding expects', () => {
    const wasmModule = { template_geometry: vi.fn() };
    templateGeometry(wasmModule, 'landscape', 'bigSmall', 'second');
    expect(wasmModule.template_geometry).toHaveBeenCalledWith('landscape', 'big_small', 'second');
  });

  it('passes full/half through unchanged', () => {
    const wasmModule = { template_geometry: vi.fn() };
    templateGeometry(wasmModule, 'square', 'full', 'first');
    expect(wasmModule.template_geometry).toHaveBeenCalledWith('square', 'full', 'first');
    templateGeometry(wasmModule, 'square', 'half', 'first');
    expect(wasmModule.template_geometry).toHaveBeenCalledWith('square', 'half', 'first');
  });
});

describe('photoAreaRatio', () => {
  it('is the card ratio itself when the photo covers the whole card', () => {
    expect(photoAreaRatio({ w: 1, h: 1 }, 1.5)).toBeCloseTo(1.5);
  });

  it('halves for a half-width landscape split', () => {
    // Half the width, full height of a 1.5 (3:2) card -> 0.75.
    expect(photoAreaRatio({ w: 0.5, h: 1 }, 1.5)).toBeCloseTo(0.75);
  });

  it('accounts for both dimensions on a top/bottom split', () => {
    // Full width, 70% height of a 1:1 card -> 1/0.7.
    expect(photoAreaRatio({ w: 1, h: 0.7 }, 1)).toBeCloseTo(1 / 0.7);
  });
});

describe('suggestCropForLayout', () => {
  it('calls the plain named-aspect suggestion for full coverage', () => {
    const wasmModule = { suggest_crop: vi.fn(() => 'full-crop'), suggest_crop_ratio: vi.fn() };
    const result = suggestCropForLayout(wasmModule, 800, 600, 'landscape', 'full', { w: 1, h: 1 }, 1.5);
    expect(wasmModule.suggest_crop).toHaveBeenCalledWith(800, 600, 'landscape');
    expect(wasmModule.suggest_crop_ratio).not.toHaveBeenCalled();
    expect(result).toBe('full-crop');
  });

  it('calls suggest_crop_ratio with the photo box\'s own ratio for a split coverage', () => {
    const wasmModule = { suggest_crop: vi.fn(), suggest_crop_ratio: vi.fn(() => 'ratio-crop') };
    const result = suggestCropForLayout(wasmModule, 800, 600, 'landscape', 'half', { w: 0.5, h: 1 }, 1.5);
    expect(wasmModule.suggest_crop).not.toHaveBeenCalled();
    expect(wasmModule.suggest_crop_ratio).toHaveBeenCalledWith(800, 600, 0.75);
    expect(result).toBe('ratio-crop');
  });
});
