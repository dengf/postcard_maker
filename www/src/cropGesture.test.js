import { describe, expect, it } from 'vitest';
import { panCrop, zoomedCrop } from './cropGesture';

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
