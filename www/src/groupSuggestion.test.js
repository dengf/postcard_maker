import { describe, expect, it } from 'vitest';
import { suggestGroup, groupCaptionFor } from './groupSuggestion';

describe('suggestGroup', () => {
  it('suggests nothing for zero faces', () => {
    expect(suggestGroup(0)).toBeNull();
  });

  it('suggests a solo look for exactly one face', () => {
    expect(suggestGroup(1)).toMatchObject({ labelKey: 'group.solo', sticker: 'heart' });
  });

  it('suggests a together look for two or more faces', () => {
    expect(suggestGroup(2)).toMatchObject({ labelKey: 'group.together', sticker: 'confetti' });
    expect(suggestGroup(6)).toMatchObject({ labelKey: 'group.together', sticker: 'confetti' });
  });
});

describe('groupCaptionFor', () => {
  it('returns null for zero faces', () => {
    expect(groupCaptionFor(0)).toBeNull();
  });

  it('returns one of the solo caption pool keys for exactly one face', () => {
    expect(groupCaptionFor(1)).toMatch(/^solo\.caption\.\d+$/);
  });

  it('returns one of the together caption pool keys at or above the threshold', () => {
    expect(groupCaptionFor(2)).toMatch(/^group\.caption\.\d+$/);
    expect(groupCaptionFor(6)).toMatch(/^group\.caption\.\d+$/);
  });

  it('draws from more than one caption over many calls, for both solo and together', () => {
    const solo = new Set();
    const together = new Set();
    for (let i = 0; i < 200; i += 1) {
      solo.add(groupCaptionFor(1));
      together.add(groupCaptionFor(2));
    }
    expect(solo.size).toBeGreaterThan(1);
    expect(together.size).toBeGreaterThan(1);
  });
});
