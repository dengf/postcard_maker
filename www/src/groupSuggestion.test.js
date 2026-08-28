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

  it('returns a caption key at or above the threshold', () => {
    expect(groupCaptionFor(2)).toBe('group.caption');
  });
});
