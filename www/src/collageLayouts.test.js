import { describe, expect, it, vi } from 'vitest';
import {
  carrySlots,
  randomSeed,
  slotInDirection,
  slotPixelRatio,
  withSelected,
} from './collageLayouts';
import { emptySlot } from './collageReducer';

const layout = (id, areas) => ({ id, slots: areas.map((area) => ({ area })) });
const HALVES = [
  { x: 0, y: 0, w: 0.5, h: 1 },
  { x: 0.5, y: 0, w: 0.5, h: 1 },
];

const photo = (naturalW, naturalH) => ({
  bytes: new Uint8Array([1]),
  url: 'blob:a',
  naturalW,
  naturalH,
  mimeType: 'image/jpeg',
});

/** Stands in for the wasm module: records what it was asked to fit a
 * photo into, and hands back a recognisable crop. */
function fakeWasm() {
  return {
    suggest_crop_ratio: vi.fn((w, h, ratio) => ({ x: 0, y: 0, w, h, ratio })),
    suggest_crop_rotated: vi.fn((w, h, rotation, ratio) => ({ x: 0, y: 0, w, h, ratio, rotation })),
  };
}

describe('slotPixelRatio', () => {
  it('scales a slot by the card it sits on', () => {
    // Half of a 3:2 card, split down the middle, is a 3:4 slot -- the
    // number `suggest_crop_ratio` needs, and the units `collage_gen`'s
    // own slot guardrails are written in.
    expect(slotPixelRatio({ x: 0, y: 0, w: 0.5, h: 1 }, 1.5)).toBeCloseTo(0.75);
    expect(slotPixelRatio({ x: 0, y: 0, w: 1, h: 0.5 }, 1.5)).toBeCloseTo(3);
  });
});

describe('randomSeed', () => {
  it('stays inside the u32 the wasm binding takes', () => {
    // wasm-bindgen takes a `u32`; anything wider silently wraps, which
    // would quietly make two different seeds the same row.
    for (let i = 0; i < 500; i += 1) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffff_ffff);
    }
  });
});

describe('withSelected', () => {
  const row = [layout('g1-2', HALVES), layout('g2-3', HALVES)];

  it('leaves the row alone when the selected layout is already in it', () => {
    expect(withSelected(row, row[1])).toBe(row);
  });

  it('keeps the selected layout on screen after a shuffle moved past it', () => {
    // Otherwise the card is still drawn with a layout that no swatch
    // shows: nothing is highlighted, and the shuffle reads as having
    // changed the card behind your back.
    const selected = layout('g9-4', HALVES);
    const shown = withSelected(row, selected);
    expect(shown[0]).toBe(selected);
    expect(shown).toHaveLength(3);
  });

  it('never grows past one extra, however many times it runs', () => {
    const selected = layout('g9-4', HALVES);
    const once = withSelected(row, selected);
    expect(withSelected(once, selected)).toHaveLength(3);
  });

  it('tolerates having no selection yet', () => {
    expect(withSelected(row, null)).toBe(row);
  });
});

describe('carrySlots', () => {
  const filled = (naturalW, naturalH, patch = {}) => ({
    ...emptySlot(),
    photo: photo(naturalW, naturalH),
    baseCrop: { x: 0, y: 0, w: naturalW, h: naturalH },
    crop: { x: 5, y: 5, w: 10, h: 10 },
    zoom: 2.5,
    ...patch,
  });

  it('moves each photo onto the slot with the same index', () => {
    const slots = [filled(100, 100), filled(200, 100)];
    const carried = carrySlots(fakeWasm(), slots, layout('g1-2', HALVES), 1.5, emptySlot);
    expect(carried.map((s) => s.photo.naturalW)).toEqual([100, 200]);
  });

  it('re-fits every photo to its new slot shape', () => {
    // The stored crop was framed against different proportions -- kept as
    // it was, it would be the wrong window on the photo, and can fall
    // outside the new slot entirely.
    const wasm = fakeWasm();
    const slots = [filled(100, 100)];
    const carried = carrySlots(wasm, slots, layout('g1-2', HALVES), 1.5, emptySlot);
    expect(wasm.suggest_crop_rotated).toHaveBeenCalledWith(100, 100, 0, 0.75);
    expect(carried[0].crop).toBe(carried[0].baseCrop);
    expect(carried[0].zoom).toBe(1);
  });

  it('keeps the look chosen for the photo itself', () => {
    // Crop and zoom belonged to the old *shape*; the filter and the
    // adjustments belong to the *photo*, which has not changed. Same line
    // REPLACE_PHOTO draws in the other direction.
    const slots = [filled(100, 100, { filter: 'vintage', adjustments: { brightness: 0.2 } })];
    const carried = carrySlots(fakeWasm(), slots, layout('g1-2', HALVES), 1.5, emptySlot);
    expect(carried[0].filter).toBe('vintage');
    expect(carried[0].adjustments).toEqual({ brightness: 0.2 });
  });

  it('carries the angle a photo was turned to, and re-fits at it', () => {
    // Rotation belongs to the photo, not the slot: a photo someone
    // straightened is straight wherever it lands. The crop that fits at
    // that angle is what depends on the slot, so the new suggestion has
    // to be asked for *at* the angle rather than upright.
    const wasm = fakeWasm();
    const slots = [filled(100, 100, { rotation: 20 })];
    const carried = carrySlots(wasm, slots, layout('g1-2', HALVES), 1.5, emptySlot);
    expect(carried[0].rotation).toBe(20);
    expect(wasm.suggest_crop_rotated).toHaveBeenCalledWith(100, 100, 20, 0.75);
  });

  it('pads with empty slots when the new layout has more of them', () => {
    const carried = carrySlots(
      fakeWasm(),
      [filled(100, 100)],
      layout('g1-3', [...HALVES, { x: 0, y: 0.5, w: 1, h: 0.5 }]),
      1.5,
      emptySlot,
    );
    expect(carried).toHaveLength(3);
    expect(carried[1].photo).toBeNull();
    expect(carried[2].photo).toBeNull();
  });

  it('drops the extras when the new layout has fewer', () => {
    const slots = [filled(100, 100), filled(200, 100), filled(300, 100)];
    const carried = carrySlots(fakeWasm(), slots, layout('g1-2', HALVES), 1.5, emptySlot);
    expect(carried).toHaveLength(2);
    expect(carried.map((s) => s.photo.naturalW)).toEqual([100, 200]);
  });

  it('asks wasm nothing about a slot that has no photo', () => {
    // `suggest_crop_rotated` would be reading `naturalW` off `null`.
    const wasm = fakeWasm();
    carrySlots(wasm, [emptySlot(), emptySlot()], layout('g1-2', HALVES), 1.5, emptySlot);
    expect(wasm.suggest_crop_rotated).not.toHaveBeenCalled();
  });

  it('starts an empty collage off with empty slots', () => {
    const carried = carrySlots(fakeWasm(), [], layout('g1-2', HALVES), 1.5, emptySlot);
    expect(carried).toHaveLength(2);
    expect(carried.every((s) => s.photo === null)).toBe(true);
  });
});

describe('slotInDirection', () => {
  // The three-up: one tall photo down the left, two stacked on the right.
  const THREE_UP = layout('three', [
    { x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ]);

  it('moves to the slot that lies that way, not the next index', () => {
    expect(slotInDirection(THREE_UP, 0, 1, 0)).toBe(1);
    expect(slotInDirection(THREE_UP, 1, 0, 1)).toBe(2);
    expect(slotInDirection(THREE_UP, 2, 0, -1)).toBe(1);
    expect(slotInDirection(THREE_UP, 1, -1, 0)).toBe(0);
  });

  // Index order would have answered 1 here, and 1 is on the right.
  it('stays put when nothing lies that way', () => {
    expect(slotInDirection(THREE_UP, 0, -1, 0)).toBeNull();
    expect(slotInDirection(THREE_UP, 0, 0, 1)).toBeNull();
    expect(slotInDirection(THREE_UP, 2, 0, 1)).toBeNull();
  });

  // Right out of the tall left slot meets both of the stacked pair
  // equally: same edge, and its centre sits exactly on the line between
  // them. Reading order settles it, and settles it the same way every
  // time -- an arrow key that picked differently on different renders
  // would be worse than one that did nothing.
  it('breaks an exact tie by reading order, every time', () => {
    for (let i = 0; i < 5; i += 1) expect(slotInDirection(THREE_UP, 0, 1, 0)).toBe(1);
  });

  // Ordinal navigation would answer 1 both times here, and 1 is neither
  // to the right of 0 nor below it.
  it('takes the slot it shares an edge with, not the nearest centre', () => {
    const CORNERS = layout('corners', [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    ]);
    expect(slotInDirection(CORNERS, 0, 1, 0)).toBe(2);
    expect(slotInDirection(CORNERS, 0, 0, 1)).toBe(3);
  });

  // The other half of the edge rule: where the pairing is one-to-one, the
  // opposite arrow comes straight back. A rule that allowed diagonals
  // would fail this -- Up out of the bottom-right of a four-up would land
  // somewhere Down did not come from.
  it('is reversible wherever the slots pair off', () => {
    const FOUR_UP = layout('four', [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ]);
    const DIRECTIONS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let from = 0; from < 4; from += 1) {
      for (const [dx, dy] of DIRECTIONS) {
        const to = slotInDirection(FOUR_UP, from, dx, dy);
        if (to === null) continue;
        expect(slotInDirection(FOUR_UP, to, -dx, -dy)).toBe(from);
      }
    }
  });

  // Where they don't, they can't be: one tall slot faces two stacked
  // ones, so Right has to pick one of them and only that one comes back.
  // Worth pinning down rather than leaving as a surprise -- the slot you
  // left is still one Up or Down away from the slot you land on.
  it('cannot come back to a slot that faces two', () => {
    expect(slotInDirection(THREE_UP, 2, -1, 0)).toBe(0);
    expect(slotInDirection(THREE_UP, 0, 1, 0)).toBe(1);
    expect(slotInDirection(THREE_UP, 1, 0, 1)).toBe(2);
  });

  it('has no answer for a layout it was handed nothing of', () => {
    expect(slotInDirection(null, 0, 1, 0)).toBeNull();
    expect(slotInDirection(THREE_UP, 9, 1, 0)).toBeNull();
  });
});
