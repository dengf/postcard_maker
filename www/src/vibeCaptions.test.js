import { describe, expect, it } from 'vitest';
import { VIBE_CAPTIONS, captionFor, pickCaption } from './vibeCaptions';

describe('pickCaption', () => {
  it('returns null for an empty or missing pool', () => {
    expect(pickCaption([])).toBeNull();
    expect(pickCaption(undefined)).toBeNull();
  });

  it('always returns a key from the given pool', () => {
    const pool = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) {
      expect(pool).toContain(pickCaption(pool));
    }
  });
});

describe('captionFor', () => {
  it('returns null for a vibe with no caption pool', () => {
    expect(captionFor('not-a-real-vibe')).toBeNull();
  });

  it.each(Object.keys(VIBE_CAPTIONS))('returns a key from %s\'s own pool', (vibe) => {
    for (let i = 0; i < 20; i += 1) {
      expect(VIBE_CAPTIONS[vibe]).toContain(captionFor(vibe));
    }
  });

  it('draws from more than one caption over many calls', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(captionFor('beach'));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('VIBE_CAPTIONS', () => {
  it('gives every vibe more than one variant', () => {
    for (const [vibe, pool] of Object.entries(VIBE_CAPTIONS)) {
      expect(pool.length, `${vibe} should have multiple caption variants`).toBeGreaterThan(1);
    }
  });

  it('has no duplicate keys within a single vibe', () => {
    for (const [vibe, pool] of Object.entries(VIBE_CAPTIONS)) {
      expect(new Set(pool).size, `${vibe} should have no duplicate keys`).toBe(pool.length);
    }
  });
});
