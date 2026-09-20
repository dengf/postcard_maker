import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `editor.cropHint` has told people to pinch since long before a pinch
// did anything -- one finger panned, two fingers did nothing at all,
// because both photo surfaces tracked a single pointer in one `drag`
// ref. Same source-text guard idiom as `collage-slot-refill.test.js`:
// nothing in this suite renders components, and the failure worth
// catching is a surface quietly going back to one-pointer handling.

const SRC = import.meta.dirname;
const read = (...parts) => fs.readFileSync(path.join(SRC, ...parts), 'utf8');

const canvas = read('components', 'PostcardCanvas.jsx');
const slot = read('components', 'CollagePhotoSlot.jsx');
const collage = read('components', 'CollageEditor.jsx');
const panel = read('components', 'FilterPanel.jsx');
const app = read('App.jsx');

describe('both photo surfaces share one gesture implementation', () => {
  it('the single-photo card', () => {
    expect(canvas).toMatch(/usePhotoGestures\(\{/);
    expect(canvas).not.toMatch(/onPointerDown=\{/);
  });

  it('and a collage slot', () => {
    expect(slot).toMatch(/usePhotoGestures\(\{/);
    expect(slot).not.toMatch(/onPointerDown=\{/);
  });
});

describe('a pinch reaches each editor as one crop-zoom-and-rotation action', () => {
  // Two dispatches would show the intermediate frame where the crop had
  // moved and the zoom number had not. The rotation joined them when the
  // twist did: it comes off the same two fingers as the pinch, so a
  // separate dispatch would put the same seam back in a different place.
  it('on the single-photo card', () => {
    expect(app).toMatch(/onPinchZoom=\{pinchZoomPhoto\}/);
    const fn = app.slice(app.indexOf('const pinchZoomPhoto'), app.indexOf('const rotateTo'));
    expect(fn).toMatch(
      /type: 'CHANGE_ZOOM', crop: nextCrop, zoom: nextZoom, rotation: nextRotation/,
    );
  });

  it('and in a collage slot', () => {
    expect(collage).toMatch(
      /onPinchZoom=\{\(crop, zoom, rotation\) =>\s*dispatch\(\{ type: 'SET_SLOT_ZOOM', index, crop, zoom, rotation \}\)\s*\}/,
    );
  });
});

// The twist rides the pinch's own two pointers, so the hook has to be
// reading an angle between them, not just a distance. A surface that went
// back to distance alone would still pass every pinch test above while
// silently dropping rotation on a phone.
it('the shared hook reads a twist off the same two pointers', () => {
  const hook = read('usePhotoGestures.js');
  expect(hook).toMatch(/twistAngle\(points\[0\], points\[1\]\)/);
  expect(hook).toMatch(/pinchRotation\(/);
});

// The pinch and the slider drive the same stored number, so a pinch that
// could reach 4x would leave the slider pinned at its own maximum while
// the photo kept growing.
it('the zoom slider spans exactly what a pinch can reach', () => {
  // `\s+`, not a literal space: these are two JSX props, and whether the
  // formatter keeps them on one line is not what this test is about.
  expect(panel).toMatch(/min=\{minZoom\}\s+max=\{MAX_ZOOM\}/);
  expect(panel).toMatch(/from '\.\.\/cropGesture'/);
  // The bottom end is the photo's, so both controls have to be handed
  // the same one rather than each falling back to the constant.
  expect(panel).toMatch(/minZoom = FILL_ZOOM/);
  expect(read('usePhotoGestures.js')).toMatch(/fitZoom\(base, bounds\)/);
});
