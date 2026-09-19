import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_WINDOW_MS,
  TAP_GAP_PX,
  TAP_TRAVEL_PX,
  createTapLog,
  isDoubleTap,
  isTap,
  recordTap,
} from './doubleTap';

const gesture = (over = {}) => ({ x: 100, y: 100, time: 1000, travel: 0, ...over });

describe('isTap', () => {
  it('accepts a pointer that barely moved', () => {
    expect(isTap(gesture({ travel: TAP_TRAVEL_PX }))).toBe(true);
  });

  it('rejects one that travelled far enough to be a pan', () => {
    expect(isTap(gesture({ travel: TAP_TRAVEL_PX + 1 }))).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isTap(null)).toBe(false);
  });
});

describe('isDoubleTap', () => {
  it('fires for two quick taps in the same spot', () => {
    expect(isDoubleTap(gesture(), gesture({ time: 1100 }))).toBe(true);
  });

  it('does not fire when the second tap is too late', () => {
    const late = gesture({ time: 1000 + DOUBLE_TAP_WINDOW_MS + 1 });
    expect(isDoubleTap(gesture(), late)).toBe(false);
  });

  it('does not fire when the two taps land far apart', () => {
    const across = gesture({ x: 100 + TAP_GAP_PX + 1, time: 1100 });
    expect(isDoubleTap(gesture(), across)).toBe(false);
  });

  // The reason this module exists rather than a `dblclick` listener: the
  // pan surfaces capture the pointer, and a drag that ends near where it
  // started must not read as a tap.
  it('does not fire when either gesture was really a drag', () => {
    const panned = gesture({ travel: 80, time: 1100 });
    expect(isDoubleTap(gesture(), panned)).toBe(false);
    expect(isDoubleTap(panned, gesture({ time: 1200 }))).toBe(false);
  });
});

describe('recordTap', () => {
  it('fires on the second of two quick taps', () => {
    const log = createTapLog();
    expect(recordTap(log, gesture())).toBe(false);
    expect(recordTap(log, gesture({ time: 1100 }))).toBe(true);
  });

  it('does not fire again on a third tap', () => {
    const log = createTapLog();
    recordTap(log, gesture());
    recordTap(log, gesture({ time: 1100 }));
    expect(recordTap(log, gesture({ time: 1200 }))).toBe(false);
  });

  it('but a fourth and fifth tap make their own pair', () => {
    const log = createTapLog();
    recordTap(log, gesture());
    recordTap(log, gesture({ time: 1100 }));
    recordTap(log, gesture({ time: 1200 }));
    expect(recordTap(log, gesture({ time: 1300 }))).toBe(true);
  });

  it('starts over after a slow tap', () => {
    const log = createTapLog();
    recordTap(log, gesture());
    expect(recordTap(log, gesture({ time: 9000 }))).toBe(false);
    expect(recordTap(log, gesture({ time: 9100 }))).toBe(true);
  });

  // A pan leaves its own gesture in the log; the next single tap must not
  // pair with it, or a drag followed by a tap would open the picker.
  it('does not pair a tap with the drag before it', () => {
    const log = createTapLog();
    recordTap(log, gesture({ travel: 120 }));
    expect(recordTap(log, gesture({ time: 1100 }))).toBe(false);
  });
});
