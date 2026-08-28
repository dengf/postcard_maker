import { describe, expect, it } from 'vitest';
import { collageReducer, initialCollageState } from './collageReducer';

const photoA = { bytes: new Uint8Array([1]), url: 'blob:a', naturalW: 100, naturalH: 100, mimeType: 'image/jpeg' };
const photoB = { bytes: new Uint8Array([2]), url: 'blob:b', naturalW: 200, naturalH: 100, mimeType: 'image/jpeg' };
const base = { x: 0, y: 0, w: 100, h: 100 };

describe('collageReducer', () => {
  it('SET_LAYOUT starts with the right number of empty slots', () => {
    const state = collageReducer(initialCollageState('x', 2), { type: 'SET_LAYOUT', layoutId: 'landscape-thirds', slotCount: 3 });
    expect(state.layoutId).toBe('landscape-thirds');
    expect(state.slots).toHaveLength(3);
    expect(state.slots.every((s) => s.photo === null)).toBe(true);
  });

  it('OPEN_SLOT_PHOTO only changes the targeted slot', () => {
    let state = initialCollageState('landscape-side-by-side', 2);
    state = collageReducer(state, { type: 'OPEN_SLOT_PHOTO', index: 0, photo: photoA, base });
    state = collageReducer(state, { type: 'OPEN_SLOT_PHOTO', index: 1, photo: photoB, base });
    expect(state.slots[0].photo).toBe(photoA);
    expect(state.slots[1].photo).toBe(photoB);
  });

  it('SET_SLOT_CROP/FILTER/ADJUSTMENTS only touch their own slot', () => {
    let state = initialCollageState('landscape-side-by-side', 2);
    state = collageReducer(state, { type: 'OPEN_SLOT_PHOTO', index: 0, photo: photoA, base });
    state = collageReducer(state, { type: 'OPEN_SLOT_PHOTO', index: 1, photo: photoB, base });
    state = collageReducer(state, { type: 'SET_SLOT_FILTER', index: 1, filter: 'vintage' });
    state = collageReducer(state, { type: 'SET_SLOT_CROP', index: 0, crop: { x: 1, y: 1, w: 10, h: 10 } });
    expect(state.slots[0].filter).toBe('none');
    expect(state.slots[1].filter).toBe('vintage');
    expect(state.slots[0].crop).toEqual({ x: 1, y: 1, w: 10, h: 10 });
    expect(state.slots[1].crop).toBe(base);
  });

  it('decoration state (message, stickers, strokes) is shared, not per-slot', () => {
    let state = initialCollageState('landscape-side-by-side', 2);
    state = collageReducer(state, { type: 'SET_MESSAGE', message: 'Hello!' });
    state = collageReducer(state, { type: 'ADD_STICKER', id: 'heart', key: 'k1', x: 0.5, y: 0.5 });
    expect(state.message).toBe('Hello!');
    expect(state.stickers).toHaveLength(1);
  });

  it('an unknown action returns the same state unchanged', () => {
    const state = initialCollageState('x', 2);
    expect(collageReducer(state, { type: 'NOPE' })).toBe(state);
  });
});
