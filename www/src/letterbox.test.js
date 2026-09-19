import { describe, expect, it } from 'vitest';
import { FULL_FIT, coverCrop, fitZoom, isLetterboxed, photoFit } from './letterbox';
import { zoomedCrop } from './cropGesture';

/* A 4000x3000 phone photo on a 3:2 landscape card -- the case the whole
 * module exists for. The zoom-1 crop is as wide as the photo and 667px
 * shorter, so 667px of it were unreachable before this. */
const PHOTO = { w: 4000, h: 3000 };
const BASE = { x: 0, y: 167, w: 4000, h: 2667 };

describe('fitZoom', () => {
  it('is how far out the crop can still grow', () => {
    // 2667/3000 = 0.889, rounded down onto the slider's own 0.01 grid so
    // that grid still lands exactly on 1x.
    expect(fitZoom(BASE, PHOTO)).toBeCloseTo(0.88);
  });

  it('is 1 for a photo already shaped like the card', () => {
    // Nothing is cropped off, so there is nothing to zoom out to and the
    // slider keeps exactly the range it had before any of this.
    expect(fitZoom({ x: 0, y: 0, w: 3000, h: 2000 }, { w: 3000, h: 2000 })).toBe(1);
  });

  it('never offers a zoom-out for a photo it knows nothing about', () => {
    expect(fitZoom(null, PHOTO)).toBe(1);
    expect(fitZoom(BASE, { w: 0, h: 0 })).toBe(1);
  });
});

describe('photoFit', () => {
  it('is the whole frame at 1x and above', () => {
    expect(photoFit(BASE, BASE, 1)).toBe(FULL_FIT);
    expect(photoFit({ x: 0, y: 0, w: 2000, h: 1333 }, BASE, 2)).toBe(FULL_FIT);
    expect(isLetterboxed(photoFit(BASE, BASE, 1))).toBe(false);
  });

  it('leaves a margin exactly as wide as the crop fell short', () => {
    // Half way out: the crop wants 4000/0.94 wide but the photo has only
    // 4000 to give, so the photo covers 94% of the card's width and the
    // bed shows through the 3% at each side. Its height is unclipped, so
    // it still reaches top and bottom.
    const zoom = 0.94;
    const crop = zoomedCrop(BASE, BASE, PHOTO.w, PHOTO.h, zoom);
    const fit = photoFit(crop, BASE, zoom);
    expect(fit.w).toBeCloseTo(0.94);
    // Whole-pixel crops, so "reaches the edge" is 1 to within a rounded
    // pixel, not exactly 1.
    expect(fit.h).toBeCloseTo(1, 3);
    expect(fit.x).toBeCloseTo(0.03);
    expect(fit.y).toBeCloseTo(0, 3);
    expect(isLetterboxed(fit)).toBe(true);
  });

  it('shows the whole photo at the floor', () => {
    const floor = fitZoom(BASE, PHOTO);
    const crop = zoomedCrop(BASE, BASE, PHOTO.w, PHOTO.h, floor);
    // Every pixel of the photo, which is the point: at 1x the crop was
    // 2667 tall on a 3000-tall photo, and 333 rows had no way back.
    expect(crop).toMatchObject({ x: 0, y: 0, w: 4000, h: 3000 });
    const fit = photoFit(crop, BASE, floor);
    expect(fit.w).toBeCloseTo(floor);
    // Not quite 1: the floor was rounded down onto the slider's grid, so
    // the card gives up a further 1% of its height to the bed. That is
    // the price of 1x staying exactly reachable.
    expect(fit.h).toBeCloseTo(0.99, 2);
  });
});

describe('coverCrop', () => {
  it('is the frame-shaped middle of a letterboxed crop', () => {
    // The crop is 4000x3000 (4:3) and the frame is the zoom-1 crop's own
    // 4000x2667, so the bed is the middle 4000x2667 of it -- the photo's
    // proportions kept, never stretched to fill.
    const cover = coverCrop({ x: 0, y: 0, w: 4000, h: 3000 }, BASE);
    expect(cover.w).toBeCloseTo(4000);
    expect(cover.h).toBeCloseTo(2667);
    expect(cover.x).toBeCloseTo(0);
    expect(cover.y).toBeCloseTo(166.5);
  });

  it('gives back a crop that already has the frame’s shape', () => {
    const cover = coverCrop(BASE, BASE);
    expect(cover.w).toBeCloseTo(BASE.w);
    expect(cover.h).toBeCloseTo(BASE.h);
    expect(cover.y).toBeCloseTo(BASE.y);
  });
});
