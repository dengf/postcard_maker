import { describe, expect, it } from 'vitest';
import { postcardReducer, initialState, DEFAULT_ADJUSTMENTS } from './postcardReducer';

const photo = { bytes: new Uint8Array([1]), url: 'blob:x', naturalW: 100, naturalH: 50, mimeType: 'image/jpeg' };
const base = { x: 0, y: 0, w: 100, h: 50 };
const geo = { safeMargin: 0.04, stampBox: {}, messageArea: {} };

describe('postcardReducer', () => {
  it('OPEN_PHOTO resets to a fresh state carrying the new photo', () => {
    const state = postcardReducer(initialState('landscape'), {
      type: 'OPEN_PHOTO',
      photo,
      aspect: 'landscape',
      base,
      geometry: geo,
    });
    expect(state.photo).toBe(photo);
    expect(state.crop).toBe(base);
    expect(state.zoom).toBe(1);
    expect(state.stickers).toEqual([]);
    expect(state.strokes).toEqual([]);
  });

  it('OPEN_PHOTO restores prior settings when resuming a draft', () => {
    const restored = {
      crop: { x: 1, y: 2, w: 3, h: 4 },
      zoom: 2,
      filter: 'sepia',
      message: 'hi',
      stickers: [{ key: 's1', id: 'heart', x: 0.5, y: 0.5, scale: 1 }],
    };
    const state = postcardReducer(initialState('landscape'), {
      type: 'OPEN_PHOTO',
      photo,
      aspect: 'square',
      base,
      geometry: geo,
      restored,
    });
    expect(state.crop).toBe(restored.crop);
    expect(state.zoom).toBe(2);
    expect(state.filter).toBe('sepia');
    expect(state.message).toBe('hi');
    expect(state.stickers).toEqual(restored.stickers);
  });

  it('CHANGE_ASPECT resets zoom and crop to the new base', () => {
    let state = postcardReducer(initialState('landscape'), {
      type: 'OPEN_PHOTO',
      photo,
      aspect: 'landscape',
      base,
      geometry: geo,
    });
    state = postcardReducer(state, { type: 'CHANGE_ZOOM', crop: { x: 5, y: 5, w: 50, h: 25 }, zoom: 2 });
    const newBase = { x: 0, y: 0, w: 60, h: 60 };
    state = postcardReducer(state, { type: 'CHANGE_ASPECT', aspect: 'square', base: newBase, geometry: geo });
    expect(state.aspectId).toBe('square');
    expect(state.crop).toBe(newBase);
    expect(state.zoom).toBe(1);
  });

  it('ADD_STICKER appends with the caller-supplied key', () => {
    const state = postcardReducer(initialState('landscape'), {
      type: 'ADD_STICKER',
      id: 'star',
      key: 'k1',
      x: 0.3,
      y: 0.4,
    });
    expect(state.stickers).toEqual([{ key: 'k1', id: 'star', x: 0.3, y: 0.4, scale: 1 }]);
  });

  it('MOVE_STICKER updates only the targeted sticker', () => {
    let state = postcardReducer(initialState('landscape'), {
      type: 'ADD_STICKER',
      id: 'star',
      key: 'k1',
      x: 0.3,
      y: 0.4,
    });
    state = postcardReducer(state, { type: 'ADD_STICKER', id: 'heart', key: 'k2', x: 0.1, y: 0.1 });
    state = postcardReducer(state, { type: 'MOVE_STICKER', index: 1, x: 0.9, y: 0.9 });
    expect(state.stickers[0]).toEqual({ key: 'k1', id: 'star', x: 0.3, y: 0.4, scale: 1 });
    expect(state.stickers[1]).toEqual({ key: 'k2', id: 'heart', x: 0.9, y: 0.9, scale: 1 });
  });

  it('REMOVE_STICKER removes only the targeted index', () => {
    let state = postcardReducer(initialState('landscape'), { type: 'ADD_STICKER', id: 'a', key: 'k1', x: 0, y: 0 });
    state = postcardReducer(state, { type: 'ADD_STICKER', id: 'b', key: 'k2', x: 0, y: 0 });
    state = postcardReducer(state, { type: 'REMOVE_STICKER', index: 0 });
    expect(state.stickers.map((s) => s.id)).toEqual(['b']);
  });

  it('APPLY_VIBE sets the filter and adds a sticker in one step', () => {
    const state = postcardReducer(initialState('landscape'), {
      type: 'APPLY_VIBE',
      filter: 'vintage',
      stickerId: 'wave',
      key: 'k1',
    });
    expect(state.filter).toBe('vintage');
    expect(state.stickers).toEqual([{ key: 'k1', id: 'wave', x: 0.5, y: 0.5, scale: 1 }]);
  });

  it('APPLY_VIBE with no sticker only changes the filter', () => {
    const state = postcardReducer(initialState('landscape'), {
      type: 'APPLY_VIBE',
      filter: 'grayscale',
      stickerId: null,
    });
    expect(state.filter).toBe('grayscale');
    expect(state.stickers).toEqual([]);
  });

  it('ADD_STROKE/UNDO_STROKE/CLEAR_STROKES manage the doodle list', () => {
    let state = initialState('landscape');
    state = postcardReducer(state, { type: 'ADD_STROKE', stroke: { color: '#000', width: 4, points: [] } });
    state = postcardReducer(state, { type: 'ADD_STROKE', stroke: { color: '#fff', width: 2, points: [] } });
    expect(state.strokes).toHaveLength(2);
    state = postcardReducer(state, { type: 'UNDO_STROKE' });
    expect(state.strokes).toHaveLength(1);
    state = postcardReducer(state, { type: 'CLEAR_STROKES' });
    expect(state.strokes).toEqual([]);
  });

  it('RESET_ADJUSTMENTS returns to the default identity adjustments', () => {
    let state = initialState('landscape');
    state = postcardReducer(state, { type: 'SET_ADJUSTMENTS', adjustments: { brightness: 0.5, contrast: 1.2, saturation: 0.8 } });
    state = postcardReducer(state, { type: 'RESET_ADJUSTMENTS' });
    expect(state.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it('SET_BACK_SIDE_ENABLED and SET_BACK_SIDE_LOCATION only touch backSide', () => {
    let state = initialState('landscape');
    state = postcardReducer(state, { type: 'SET_BACK_SIDE_ENABLED', enabled: true });
    state = postcardReducer(state, { type: 'SET_BACK_SIDE_LOCATION', location: 'Singapore' });
    expect(state.backSide).toEqual({ enabled: true, location: 'Singapore' });
  });

  it('RESET returns to a clean initial state', () => {
    let state = postcardReducer(initialState('landscape'), { type: 'OPEN_PHOTO', photo, aspect: 'landscape', base, geometry: geo });
    state = postcardReducer(state, { type: 'RESET', defaultAspect: 'landscape' });
    expect(state.photo).toBeNull();
    expect(state.crop).toBeNull();
  });

  it('an unknown action type returns the same state unchanged', () => {
    const state = initialState('landscape');
    expect(postcardReducer(state, { type: 'NOPE' })).toBe(state);
  });
});
