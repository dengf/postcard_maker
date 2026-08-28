import { describe, expect, it, vi, afterEach } from 'vitest';
import { detectLocation } from './location';

function mockTimeZone(zone) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: zone }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectLocation', () => {
  it('takes the last path segment as the city', () => {
    mockTimeZone('Asia/Singapore');
    expect(detectLocation()).toBe('Singapore');
  });

  it('replaces underscores with spaces', () => {
    mockTimeZone('America/New_York');
    expect(detectLocation()).toBe('New York');
  });

  it('handles a three-part zone by taking the last segment', () => {
    mockTimeZone('America/Argentina/Buenos_Aires');
    expect(detectLocation()).toBe('Buenos Aires');
  });

  it('returns empty for a bare UTC/Etc zone rather than a meaningless label', () => {
    mockTimeZone('UTC');
    expect(detectLocation()).toBe('');
    mockTimeZone('Etc/GMT+5');
    expect(detectLocation()).toBe('');
  });

  it('never throws if Intl.DateTimeFormat is unavailable', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('unsupported');
    });
    expect(detectLocation()).toBe('');
  });
});
