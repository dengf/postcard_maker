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

describe('buildCandidates with a tone signal', () => {
  it('promotes a moodier look to primary for an already bright, saturated photo', () => {
    // beach's default primary is vintage -- for a photo already bright
    // and colorful, grayscale should win instead (see scoreForTone).
    const candidates = buildCandidates([{ vibe: 'beach', confidence: 0.8 }], {
      brightness: 0.9,
      saturation: 0.5,
    });
    expect(candidates[0].filter).toBe('grayscale');
  });

  it('promotes sepia to primary for a dim, muted photo', () => {
    const candidates = buildCandidates([{ vibe: 'beach', confidence: 0.8 }], {
      brightness: 0.2,
      saturation: 0.1,
    });
    expect(candidates[0].filter).toBe('sepia');
  });

  it('still lists every look from the vibe, just reordered', () => {
    const withoutTone = buildCandidates([{ vibe: 'beach', confidence: 0.8 }]);
    const withTone = buildCandidates([{ vibe: 'beach', confidence: 0.8 }], { brightness: 0.9, saturation: 0.5 });
    const filtersOf = (list) => list.map((c) => c.filter).sort();
    expect(filtersOf(withTone)).toEqual(filtersOf(withoutTone));
  });

  it('falls back to the curated order when tone is null', () => {
    const candidates = buildCandidates([{ vibe: 'beach', confidence: 0.8 }], null);
    expect(candidates[0].filter).toBe('vintage');
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
