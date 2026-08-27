import { describe, expect, it } from 'vitest';
import { containsCjk, effectiveFont } from './fonts';

describe('containsCjk', () => {
  it('detects Simplified and Traditional characters', () => {
    expect(containsCjk('谢谢')).toBe(true);
    expect(containsCjk('謝謝')).toBe(true);
  });

  it('is false for plain Latin text', () => {
    expect(containsCjk('Happy birthday!')).toBe(false);
  });

  it('is false for empty or missing input', () => {
    expect(containsCjk('')).toBe(false);
    expect(containsCjk(undefined)).toBe(false);
  });
});

describe('effectiveFont', () => {
  it('keeps the decorative choice for Latin-only text', () => {
    expect(effectiveFont('decorative', 'Wish you were here')).toBe('decorative');
  });

  it('forces system once the message contains CJK', () => {
    expect(effectiveFont('decorative', '祝你生日快乐')).toBe('system');
  });

  it('leaves the system choice alone either way', () => {
    expect(effectiveFont('system', '祝你生日快乐')).toBe('system');
    expect(effectiveFont('system', 'hello')).toBe('system');
  });
});
