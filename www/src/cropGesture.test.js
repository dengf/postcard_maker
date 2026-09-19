import { describe, expect, it } from 'vitest';
import {
  FILL_ZOOM,
  MAX_ZOOM,
  SNAP_WINDOW,
  normalizeRotation,
  panCrop,
  pinchAnchor,
  pinchRotation,
  pinchZoom,
  rebaseCrop,
  snapRotation,
  twistAngle,
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

  // Below 1x the rectangle asked for is bigger than the photo. What
  // comes back is still a rectangle of real pixels -- the letterbox is
  // measured from the shortfall, never taken out of bounds.
  it('stops growing at the photo’s edge when zoomed out past 1x', () => {
    // A 3:2 zoom-1 crop on a 1000x1000 photo: at 0.8x the crop wants to
    // be 1125 wide, which the photo cannot supply, and 750 tall, which
    // it can.
    const wide = { x: 50, y: 200, w: 900, h: 600 };
    const zoomed = zoomedCrop({ x: 350, y: 400, w: 300, h: 200 }, wide, 1000, 1000, 0.8);
    expect(zoomed).toEqual({ x: 0, y: 125, w: 1000, h: 750 });
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
    expect(pinchZoom(2, 100, 1)).toBe(FILL_ZOOM);
  });

  // The bottom end belongs to the photo, not to this module -- a photo
  // the card's shape cuts into can be pinched below 1x, down to the
  // point where the whole of it is on the card.
  it('pinches down to the photo’s own floor when one is given', () => {
    expect(pinchZoom(1, 100, 10, 0.8)).toBe(0.8);
    expect(pinchZoom(1, 100, 90, 0.8)).toBeCloseTo(0.9);
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

describe('normalizeRotation', () => {
  it('folds any angle into one turn', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(725)).toBe(5);
  });

  it('treats a degenerate angle as no rotation', () => {
    // A twist between two pointers at the same point produces NaN, and a
    // NaN reaching the wasm boundary is a thrown binding, not a tilt.
    expect(normalizeRotation(NaN)).toBe(0);
    expect(normalizeRotation(Infinity)).toBe(0);
  });
});

describe('snapRotation', () => {
  it('pulls a near-level angle exactly level', () => {
    // Level is what people want and the hardest angle to hit with two
    // fingers on glass -- an almost-straight photo reads as a mistake.
    expect(snapRotation(2)).toBe(0);
    expect(snapRotation(-2)).toBe(0);
    expect(snapRotation(88)).toBe(90);
    expect(snapRotation(358)).toBe(0);
  });

  it('leaves a deliberate tilt alone', () => {
    expect(snapRotation(SNAP_WINDOW + 3)).toBe(SNAP_WINDOW + 3);
    expect(snapRotation(45)).toBe(45);
  });
});

describe('twistAngle and pinchRotation', () => {
  it('reads the angle of the line between two fingers', () => {
    expect(twistAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
    expect(twistAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
  });

  it('adds however far the fingers turned to where the photo started', () => {
    expect(pinchRotation(0, 0, 30)).toBeCloseTo(30);
    expect(pinchRotation(100, 10, 40)).toBeCloseTo(130);
  });

  it('measures from the gesture start, so a twist out and back returns', () => {
    // Frame-to-frame deltas would accumulate rounding and leave the photo
    // slightly off from where it began -- the same reason `pinchZoom`
    // works off `startDist`.
    const start = 40;
    let angle = 12;
    for (const step of [20, 55, 90, 55, 20, 12]) angle = step;
    expect(pinchRotation(start, 12, angle)).toBeCloseTo(start);
  });

  it('does not read a turn across the atan2 seam as a full spin', () => {
    // atan2 jumps from 180 to -180; unfolded, a 10-degree nudge there
    // would register as a 350-degree jolt.
    expect(pinchRotation(0, 175, -175)).toBeCloseTo(10);
    expect(pinchRotation(0, -175, 175)).toBeCloseTo(350);
  });
});

describe('rebaseCrop', () => {
  it('keeps a crop in the same relative place in a new box', () => {
    // Turning the photo resizes the box the crop lives in. Holding the
    // fractional centre is what makes a twist continuous instead of
    // snapping a panned-into-a-corner framing back to the middle.
    const crop = { x: 0, y: 0, w: 100, h: 100 };
    const next = rebaseCrop(crop, { w: 400, h: 400 }, { w: 800, h: 800 });
    expect(next.x).toBe(50); // centre was at 1/8; 1/8 of 800 is 100
    expect(next.y).toBe(50);
    expect(next.w).toBe(100);
  });

  it('is a no-op when the box did not change', () => {
    const crop = { x: 30, y: 40, w: 100, h: 80 };
    expect(rebaseCrop(crop, { w: 500, h: 500 }, { w: 500, h: 500 })).toEqual(crop);
  });

  it('survives a degenerate box rather than producing NaN', () => {
    const crop = { x: 0, y: 0, w: 10, h: 10 };
    const next = rebaseCrop(crop, { w: 0, h: 0 }, { w: 100, h: 100 });
    expect(Number.isFinite(next.x)).toBe(true);
    expect(Number.isFinite(next.y)).toBe(true);
  });
});
