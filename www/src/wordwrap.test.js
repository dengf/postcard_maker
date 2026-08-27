import { describe, expect, it } from 'vitest';
import { wrapText } from './wordwrap';

function fakeCtx(charWidth) {
  return { measureText: (s) => ({ width: s.length * charWidth }) };
}

describe('wrapText', () => {
  it('wraps Latin text on word boundaries', () => {
    const ctx = fakeCtx(10);
    const lines = wrapText(ctx, 'wish you were here today', 100);
    expect(lines.every((l) => ctx.measureText(l).width <= 100)).toBe(true);
    expect(lines.join(' ')).toBe('wish you were here today');
  });

  it('wraps CJK text by character, not by word', () => {
    const ctx = fakeCtx(10);
    const lines = wrapText(ctx, '祝你生日快乐万事如意', 50);
    expect(lines.every((l) => ctx.measureText(l).width <= 50)).toBe(true);
    expect(lines.join('')).toBe('祝你生日快乐万事如意');
  });

  it('keeps an explicit newline as a line break', () => {
    const ctx = fakeCtx(5);
    const lines = wrapText(ctx, 'line one\nline two', 1000);
    expect(lines).toEqual(['line one', 'line two']);
  });

  it('never produces a line wider than maxWidth when a single unit fits', () => {
    const ctx = fakeCtx(8);
    const lines = wrapText(ctx, 'a b c d e f g', 20);
    for (const line of lines) {
      expect(ctx.measureText(line).width).toBeLessThanOrEqual(20);
    }
  });

  it('still returns the oversized unit on its own line rather than dropping it', () => {
    const ctx = fakeCtx(10);
    const lines = wrapText(ctx, 'supercalifragilistic short', 30);
    expect(lines[0]).toBe('supercalifragilistic');
  });
});
