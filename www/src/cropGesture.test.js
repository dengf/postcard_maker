import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  panCrop,
  pinchAnchor,
  pinchZoom,
  zoomedCrop,
  zoomedCropAt,
} from './cropGesture';

describe('zoomedCrop', () => {
  const base = { x: 0, y: 0, w: 300, h: 200 };

  it('shrinks the crop window as zoom increases', () => {
    const zoomed = zoomedCrop(base, base, 1000, 1000, 2);
    expect(zoomed.w).toBe(150);
    expect(zoomed.h).toBe(100);
  });

  it('keeps the current crop center, not the base crop center', () => {
    const current = { x: 100, y: 50, w: 300, h: 200 };
    const zoomed = zoomedCrop(current, base, 1000, 1000, 2);
    const currentCx = current.x + current.w / 2;
    const zoomedCx = zoomed.x + zoomed.w / 2;
    expect(Math.abs(zoomedCx - currentCx)).toBeLessThanOrEqual(1);
  });

  it('clamps to the photo bounds instead of going negative', () => {
    const current = { x: 0, y: 0, w: 300, h: 200 };
    const zoomed = zoomedCrop(current, base, 1000, 1000, 0.5);
    expect(zoomed.x).toBeGreaterThanOrEqual(0);
    expect(zoomed.y).toBeGreaterThanOrEqual(0);
    expect(zoomed.x + zoomed.w).toBeLessThanOrEqual(1000);
  });
});

describe('zoomedCropAt', () => {
  const base = { x: 0, y: 0, w: 400, h: 400 };

  it('keeps the source pixel under the anchor in place', () => {
    const current = { x: 200, y: 200, w: 400, h: 400 };
    const anchor = { fx: 0.25, fy: 0.75 };
    // The photo pixel the fingers are on before the pinch...
    const before = { x: current.x + anchor.fx * current.w, y: current.y + anchor.fy * current.h };
    const zoomed = zoomedCropAt(current, base, 1000, 1000, 2, anchor);
    // ...is still under them after it.
    const after = { x: zoomed.x + anchor.fx * zoomed.w, y: zoomed.y + anchor.fy * zoomed.h };
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });

  it('is what zoomedCrop does at the center', () => {
    const current = { x: 120, y: 340, w: 400, h: 400 };
    expect(zoomedCropAt(current, base, 1000, 1000, 1.7, { fx: 0.5, fy: 0.5 })).toEqual(
      zoomedCrop(current, base, 1000, 1000, 1.7),
    );
  });

  it('stays inside the photo when the anchor is at an edge', () => {
    const current = { x: 600, y: 600, w: 400, h: 400 };
    const zoomed = zoomedCropAt(current, base, 1000, 1000, 1.2, { fx: 1, fy: 1 });
    expect(zoomed.x).toBeGreaterThanOrEqual(0);
    expect(zoomed.y).toBeGreaterThanOrEqual(0);
    expect(zoomed.x + zoomed.w).toBeLessThanOrEqual(1000);
    expect(zoomed.y + zoomed.h).toBeLessThanOrEqual(1000);
  });
});

describe('pinchZoom', () => {
  it('scales with how much further apart the fingers moved', () => {
    expect(pinchZoom(1, 100, 200)).toBeCloseTo(2);
    expect(pinchZoom(2, 100, 50)).toBeCloseTo(1);
  });

  it('holds to the zoom slider range at both ends', () => {
    expect(pinchZoom(2, 100, 1000)).toBe(MAX_ZOOM);
    expect(pinchZoom(2, 100, 1)).toBe(MIN_ZOOM);
  });

  it('returns to the starting zoom when the fingers do', () => {
    expect(pinchZoom(1.6, 140, 140)).toBeCloseTo(1.6);
  });

  it('survives two pointers reported at the same spot', () => {
    expect(pinchZoom(1.5, 0, 80)).toBe(1.5);
  });
});

describe('pinchAnchor', () => {
  const rect = { left: 100, top: 50, width: 200, height: 400 };

  it('reports the midpoint as a fraction of the box', () => {
    const anchor = pinchAnchor(rect, { x: 140, y: 150 }, { x: 180, y: 250 });
    expect(anchor.fx).toBeCloseTo(0.3);
    expect(anchor.fy).toBeCloseTo(0.375);
  });

  it('clamps a midpoint dragged outside the box', () => {
    const anchor = pinchAnchor(rect, { x: -400, y: -400 }, { x: -380, y: -380 });
    expect(anchor).toEqual({ fx: 0, fy: 0 });
  });

  it('falls back to the center for a box with no size yet', () => {
    expect(pinchAnchor({ left: 0, top: 0, width: 0, height: 0 }, { x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({
      fx: 0.5,
      fy: 0.5,
    });
  });
});

describe('panCrop', () => {
  it('moves the crop by the given delta', () => {
    const crop = { x: 100, y: 100, w: 200, h: 150 };
    const next = panCrop(crop, 10, -5, 1000, 1000);
    expect(next).toEqual({ x: 90, y: 105, w: 200, h: 150 });
  });

  it('clamps at the left/top edge', () => {
    const crop = { x: 5, y: 5, w: 200, h: 150 };
    const next = panCrop(crop, 50, 50, 1000, 1000);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it('clamps at the right/bottom edge', () => {
    const crop = { x: 750, y: 800, w: 200, h: 150 };
    const next = panCrop(crop, -100, -100, 1000, 1000);
    expect(next.x).toBe(800);
    expect(next.y).toBe(850);
  });
});
