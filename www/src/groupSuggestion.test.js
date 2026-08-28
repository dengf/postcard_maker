import { describe, expect, it } from 'vitest';
import { suggestGroup, groupCaptionFor } from './groupSuggestion';

describe('suggestGroup', () => {
  it('suggests nothing for zero or one face', () => {
    expect(suggestGroup(0)).toBeNull();
    expect(suggestGroup(1)).toBeNull();
  });

  it('suggests a together look for two or more faces', () => {
    expect(suggestGroup(2)).toMatchObject({ labelKey: 'group.together' });
    expect(suggestGroup(6)).toMatchObject({ labelKey: 'group.together' });
  });
});

describe('groupCaptionFor', () => {
  it('returns null below the threshold', () => {
    expect(groupCaptionFor(0)).toBeNull();
    expect(groupCaptionFor(1)).toBeNull();
  });

  it('returns one of the caption pool keys at or above the threshold', () => {
    expect(groupCaptionFor(2)).toMatch(/^group\.caption\.\d+$/);
    expect(groupCaptionFor(6)).toMatch(/^group\.caption\.\d+$/);
  });

  it('draws from more than one caption over many calls', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(groupCaptionFor(2));
    expect(seen.size).toBeGreaterThan(1);
  });
});
