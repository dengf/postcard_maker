import { describe, expect, it } from 'vitest';
import { buildCandidates, looksFor } from './vibeSuggestions';

describe('buildCandidates', () => {
  it('orders every matched vibe\'s primary look before any alternates', () => {
    const matches = [
      { vibe: 'beach', confidence: 0.7 },
      { vibe: 'pet', confidence: 0.3 },
    ];
    const candidates = buildCandidates(matches);
    const beachLooks = looksFor('beach');
    const petLooks = looksFor('pet');

    expect(candidates.length).toBe(beachLooks.length + petLooks.length);
    expect(candidates[0]).toMatchObject({ vibe: 'beach', labelKey: beachLooks[0].labelKey });
    expect(candidates[1]).toMatchObject({ vibe: 'pet', labelKey: petLooks[0].labelKey });
    // Both primaries come before either alternate.
    const alternateIndices = candidates
      .map((c, i) => (c.labelKey.endsWith('.alt') ? i : -1))
      .filter((i) => i >= 0);
    expect(Math.min(...alternateIndices)).toBeGreaterThanOrEqual(2);
  });

  it('carries the matched confidence onto every look from that vibe', () => {
    const candidates = buildCandidates([{ vibe: 'water', confidence: 0.42 }]);
    expect(candidates.every((c) => c.confidence === 0.42)).toBe(true);
  });

  it('returns an empty list for no matches', () => {
    expect(buildCandidates([])).toEqual([]);
  });

  it('skips an unrecognized vibe name rather than throwing', () => {
    expect(buildCandidates([{ vibe: 'nonexistent', confidence: 0.9 }])).toEqual([]);
  });
});

describe('looksFor', () => {
  it('returns at least a primary and an alternate for every known vibe', () => {
    for (const vibe of ['beach', 'mountain', 'water', 'architecture', 'winter', 'food', 'pet']) {
      expect(looksFor(vibe).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns an empty array for an unknown vibe', () => {
    expect(looksFor('nonexistent')).toEqual([]);
  });
});
