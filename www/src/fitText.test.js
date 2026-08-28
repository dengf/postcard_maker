import { describe, expect, it } from 'vitest';
import { fitFontSize } from './fitText';
import { wrapText } from './wordwrap';

// A fake ctx whose measured width scales linearly with font size, same
// technique wordwrap.test.js uses -- no real canvas needed.
function fakeCtx() {
  let size = 16;
  return {
    set font(value) {
      size = parseFloat(value);
    },
    measureText: (s) => ({ width: s.length * size * 0.6 }),
  };
}

describe('fitFontSize', () => {
  it('picks a larger size for a short message than a long one, same box', () => {
    const ctx = fakeCtx();
    const shortSize = fitFontSize(ctx, 'Hi!', 300, 150, { fontFamily: 'sans-serif' });
    const longSize = fitFontSize(
      ctx,
      'Wish you were here, having the most wonderful time exploring the coast!',
      300,
      150,
      { fontFamily: 'sans-serif' },
    );
    expect(shortSize).toBeGreaterThan(longSize);
  });

  it('never returns a size where the wrapped text overflows the box height', () => {
    const ctx = fakeCtx();
    const size = fitFontSize(ctx, 'A reasonably long greeting message for testing', 250, 100, {
      fontFamily: 'sans-serif',
    });
    ctx.font = `${size}px sans-serif`;
    // Re-derive via the same wrap the function itself uses.
    const lines = wrapText(ctx, 'A reasonably long greeting message for testing', 250);
    expect(lines.length * size * 1.3).toBeLessThanOrEqual(100);
  });

  it('falls back to the minimum for empty or blank text', () => {
    const ctx = fakeCtx();
    expect(fitFontSize(ctx, '', 300, 150, { min: 12, fontFamily: 'sans-serif' })).toBe(12);
    expect(fitFontSize(ctx, '   ', 300, 150, { min: 12, fontFamily: 'sans-serif' })).toBe(12);
  });

  it('falls back to the minimum for a zero-sized box', () => {
    const ctx = fakeCtx();
    expect(fitFontSize(ctx, 'hi', 0, 150, { min: 11, fontFamily: 'sans-serif' })).toBe(11);
    expect(fitFontSize(ctx, 'hi', 300, 0, { min: 11, fontFamily: 'sans-serif' })).toBe(11);
  });

  it('never exceeds the given max even for a single short character', () => {
    const ctx = fakeCtx();
    const size = fitFontSize(ctx, 'Hi', 2000, 2000, { max: 40, fontFamily: 'sans-serif' });
    expect(size).toBeLessThanOrEqual(40);
  });
});
