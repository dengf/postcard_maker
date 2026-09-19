import { describe, expect, it } from 'vitest';
import { collageReducer, emptySlot, initialCollageState } from './collageReducer';

const photoA = { bytes: new Uint8Array([1]), url: 'blob:a', naturalW: 100, naturalH: 100, mimeType: 'image/jpeg' };
const photoB = { bytes: new Uint8Array([2]), url: 'blob:b', naturalW: 200, naturalH: 100, mimeType: 'image/jpeg' };
const base = { x: 0, y: 0, w: 100, h: 100 };

describe('collageReducer', () => {
  // Kept in step with postcardReducer's own default -- the two flows are
  // parallel by design, and a collage's greeting has the same contrast
  // problem over a photo that a single-photo card does.
  it('defaults the greeting colour to auto, matching the single-photo flow', () => {
    expect(initialCollageState('x', 2).textColor).toBe('auto');
  });

  it('SET_LAYOUT takes the layout and the slots built for it', () => {
    const state = collageReducer(initialCollageState('x', 2), {
      type: 'SET_LAYOUT',
      layoutId: 'g4812-3',
      slots: [emptySlot(), emptySlot(), emptySlot()],
    });
    expect(state.layoutId).toBe('g4812-3');
    expect(state.slots).toHaveLength(3);
    expect(state.slots.every((s) => s.photo === null)).toBe(true);
  });

  describe('SET_LAYOUT keeps the collage', () => {
    // It used to return a fresh `initialCollageState`, so changing layout
    // emptied the card. Harmless while the layout was a one-time pick
    // among three; with a Shuffle button inviting repeated taps, it would
    // mean every swatch is a "throw this away" button.
    const decorated = () => {
      let state = initialCollageState('g1-2', 2);
      state = collageReducer(state, { type: 'OPEN_SLOT_PHOTO', index: 0, photo: photoA, base });
      state = collageReducer(state, { type: 'OPEN_SLOT_PHOTO', index: 1, photo: photoB, base });
      state = collageReducer(state, { type: 'SET_MESSAGE', message: 'Wish you were here' });
      state = collageReducer(state, { type: 'ADD_STICKER', id: 'heart', key: 'k1', x: 0.5, y: 0.5 });
      state = collageReducer(state, { type: 'ADD_STROKE', stroke: { points: [] } });
      state = collageReducer(state, { type: 'SET_BACK_SIDE_LOCATION', location: 'Lisbon' });
      return state;
    };

    it('keeps the message, stickers, strokes and back side', () => {
      const before = decorated();
      const after = collageReducer(before, {
        type: 'SET_LAYOUT',
        layoutId: 'g99-3',
        slots: [before.slots[0], before.slots[1], emptySlot()],
      });
      expect(after.message).toBe('Wish you were here');
      expect(after.stickers).toHaveLength(1);
      expect(after.strokes).toHaveLength(1);
      expect(after.backSide.location).toBe('Lisbon');
    });

    it('keeps the photos it is handed', () => {
      const before = decorated();
      const after = collageReducer(before, {
        type: 'SET_LAYOUT',
        layoutId: 'g99-3',
        slots: [before.slots[0], before.slots[1], emptySlot()],
      });
      expect(after.slots.map((s) => s.photo)).toEqual([photoA, photoB, null]);
    });

    it('pulls the selection back in range when the new layout has fewer slots', () => {
      // Every per-slot control reads `slots[activeSlotIndex]`; left at 2,
      // a 2-slot layout would give them all `undefined`.
      let before = decorated();
      before = collageReducer(before, { type: 'SET_ACTIVE_SLOT', index: 1 });
      const after = collageReducer(before, {
        type: 'SET_LAYOUT',
        layoutId: 'g7-2',
        slots: [before.slots[0]],
      });
      expect(after.activeSlotIndex).toBe(0);
      expect(after.slots[after.activeSlotIndex]).toBeDefined();
    });
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

  describe('RESTORE_DRAFT', () => {
    // SET_LAYOUT always runs first -- the layout decides how many slots
    // there are, so it's what gives the restored photos somewhere to land.
    const restored = (draft, slots) => {
      const empty = collageReducer(initialCollageState('x', 1), {
        type: 'SET_LAYOUT',
        layoutId: 'landscape-side-by-side',
        slots: [emptySlot(), emptySlot()],
      });
      return collageReducer(empty, { type: 'RESTORE_DRAFT', draft, slots });
    };

    const filled = [
      { photo: photoA, baseCrop: base, crop: base, zoom: 1, adjustments: {}, filter: 'sepia' },
      { photo: null, baseCrop: null, crop: null, zoom: 1, adjustments: {}, filter: 'none' },
    ];

    it('brings back the photos and everything shared across the card', () => {
      const state = restored(
        {
          message: 'Greetings',
          stickers: [{ key: 's1', id: 'heart', x: 0.5, y: 0.5, scale: 1 }],
          strokes: [{ points: [], color: '#fff', width: 4 }],
          textAlign: 'left',
          backSide: { enabled: true, location: 'Lisbon' },
        },
        filled,
      );
      expect(state.slots[0].photo).toBe(photoA);
      expect(state.slots[0].filter).toBe('sepia');
      expect(state.slots[1].photo).toBeNull();
      expect(state.message).toBe('Greetings');
      expect(state.stickers).toHaveLength(1);
      expect(state.strokes).toHaveLength(1);
      expect(state.textAlign).toBe('left');
      expect(state.layoutId).toBe('landscape-side-by-side');
    });

    // A record written before a field existed must restore as a new
    // collage would, never as `undefined` -- BackSidePanel's textarea
    // turns uncontrolled the moment `address` goes missing.
    it('falls back to the fresh defaults for anything the record lacks', () => {
      const state = restored({ message: 'Greetings', backSide: { enabled: true } }, filled);
      expect(state.textColor).toBe('auto');
      expect(state.textAlign).toBe('center');
      expect(state.stickers).toEqual([]);
      expect(state.strokes).toEqual([]);
      expect(state.backSide.address).toBe('');
      expect(state.backSide.location).toBe('');
      expect(state.backSide.enabled).toBe(true);
    });
  });

  it('an unknown action returns the same state unchanged', () => {
    const state = initialCollageState('x', 2);
    expect(collageReducer(state, { type: 'NOPE' })).toBe(state);
  });
});
